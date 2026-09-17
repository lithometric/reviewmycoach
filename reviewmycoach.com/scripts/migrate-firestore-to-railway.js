#!/usr/bin/env node
/**
 * Migrate ALL Firestore data (every root collection + subcollections)
 * into the Railway Postgres database.
 *
 * Tables that exist in scripts/schema.sql get their structured columns
 * populated too; every table always gets the full document in `data` JSONB.
 * Subcollections land in tables named `<parent>__<sub>` keyed by doc_path.
 *
 * Credentials (first one that works wins):
 *   1. GOOGLE_APPLICATION_CREDENTIALS env var (any valid ADC file)
 *   2. A service-account JSON passed as argv[2]
 *   3. The repo-root "Review My Coach Firebase Service Account.json"
 *   4. Your Firebase CLI login (run `firebase login --reauth` first)
 *
 * Usage:
 *   RAILWAY_PG_URL=postgresql://... node scripts/migrate-firestore-to-railway.js [serviceAccount.json]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'review-my-coach';
const PG_URL = process.env.RAILWAY_PG_URL;
if (!PG_URL) { console.error('Set RAILWAY_PG_URL'); process.exit(1); }

// Well-known public OAuth client of the firebase-tools CLI
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function resolveCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Using GOOGLE_APPLICATION_CREDENTIALS');
    return applicationDefault();
  }
  const candidates = [
    process.argv[2],
    path.join(__dirname, '..', '..', 'Review My Coach Firebase Service Account.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const sa = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (sa.private_key) {
        console.log('Using service account file:', p);
        return cert(sa);
      }
    } catch { /* try next */ }
  }
  // Fall back to firebase CLI refresh token as an authorized_user ADC file
  const cfg = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const tokens = JSON.parse(fs.readFileSync(cfg, 'utf8')).tokens;
  if (!tokens || !tokens.refresh_token) throw new Error('No usable Google credentials found');
  const aduPath = path.join(os.tmpdir(), 'rmc-adc.json');
  fs.writeFileSync(aduPath, JSON.stringify({
    type: 'authorized_user',
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
  }));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = aduPath;
  console.log('Using Firebase CLI login (authorized_user ADC)');
  return applicationDefault();
}

initializeApp({ credential: resolveCredential(), projectId: PROJECT_ID });
const db = getFirestore();
const pool = new Pool({ connectionString: PG_URL, max: 25 });
const CONCURRENCY = 100;

async function inChunks(items, fn) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

// ---------- value conversion ----------
function deepConvert(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate().toISOString();          // Timestamp
    if (v instanceof Date) return v.toISOString();
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && v.constructor.name === 'GeoPoint')
      return { latitude: v.latitude, longitude: v.longitude };
    if (v.constructor && v.constructor.name === 'DocumentReference') return v.path;
    if (Buffer.isBuffer(v)) return v.toString('base64');
    if (Array.isArray(v)) return v.map(deepConvert);
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = deepConvert(val);
    return out;
  }
  return v;
}
const colName = (k) => k.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
const tsOrNull = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null);

// ---------- table helpers ----------
const tableColumnsCache = new Map();
async function getColumns(table) {
  if (!tableColumnsCache.has(table)) {
    const r = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
    tableColumnsCache.set(table, new Map(r.rows.map(x => [x.column_name, x.data_type])));
  }
  return tableColumnsCache.get(table);
}

async function ensureTable(table, keyCol) {
  await pool.query(`CREATE TABLE IF NOT EXISTS "${table}" (
    ${keyCol === 'doc_path' ? 'doc_path TEXT PRIMARY KEY, id VARCHAR(255),' : 'id VARCHAR(255) PRIMARY KEY,'}
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "idx_${table}_data_gin" ON "${table}" USING GIN (data)`);
  tableColumnsCache.delete(table);
}

function columnValue(dataType, v) {
  if (v === null || v === undefined) return null;
  if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v); // object into text col
  return v;
}

async function upsertDoc(table, keyCol, keyVal, docId, converted) {
  const cols = await getColumns(table);
  const names = [keyCol, 'data', 'created_at', 'updated_at'];
  const vals = [keyVal, JSON.stringify(converted),
    tsOrNull(converted.createdAt) || new Date().toISOString(),
    tsOrNull(converted.updatedAt) || new Date().toISOString()];
  if (keyCol === 'doc_path' && cols.has('id')) { names.push('id'); vals.push(docId); }
  for (const [k, v] of Object.entries(converted)) {
    const c = colName(k);
    if (names.includes(c) || !cols.has(c)) continue;
    names.push(c);
    vals.push(columnValue(cols.get(c), v));
  }
  const ph = names.map((_, i) => `$${i + 1}`).join(',');
  const updates = names.filter(n => n !== keyCol).map(n => `"${n}" = EXCLUDED."${n}"`).join(', ');
  const q = `INSERT INTO "${table}" (${names.map(n => `"${n}"`).join(',')}) VALUES (${ph})
             ON CONFLICT ("${keyCol}") DO UPDATE SET ${updates}`;
  try {
    await pool.query(q, vals);
  } catch (e) {
    // fallback: JSONB-only upsert (handles varchar overflows / type mismatches)
    await pool.query(
      `INSERT INTO "${table}" ("${keyCol}", data) VALUES ($1, $2)
       ON CONFLICT ("${keyCol}") DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [keyVal, JSON.stringify(converted)]);
    return `fallback (${e.message.slice(0, 80)})`;
  }
  return null;
}

// Build (names, vals) for one doc using the table's FULL column list so every
// row in a page shares one column set (missing fields become NULL)
async function rowFor(table, keyCol, keyVal, docId, converted) {
  const cols = await getColumns(table);
  const byCol = {};
  for (const [k, v] of Object.entries(converted)) byCol[colName(k)] = v;
  const names = [], vals = [];
  for (const [c, type] of cols) {
    names.push(c);
    if (c === keyCol) vals.push(keyVal);
    else if (c === 'data') vals.push(JSON.stringify(converted));
    else if (c === 'created_at') vals.push(tsOrNull(converted.createdAt) || new Date().toISOString());
    else if (c === 'updated_at') vals.push(tsOrNull(converted.updatedAt) || new Date().toISOString());
    else if (c === 'id' && keyCol === 'doc_path') vals.push(docId);
    else vals.push(columnValue(type, byCol[c] === undefined ? null : byCol[c]));
  }
  return { names, vals };
}

// Multi-row upsert for rows sharing an identical column list
async function batchUpsert(table, keyCol, group) {
  const { names } = group[0];
  const keyIdx = names.indexOf(keyCol), dataIdx = names.indexOf('data');
  const BATCH = 50;
  const chunks = [];
  for (let i = 0; i < group.length; i += BATCH) chunks.push(group.slice(i, i + BATCH));
  const results = await Promise.all(chunks.map(async (rows) => {
    const placeholders = rows.map((r, ri) =>
      `(${r.vals.map((_, ci) => `$${ri * names.length + ci + 1}`).join(',')})`).join(',');
    const updates = names.filter(n => n !== keyCol).map(n => `"${n}" = EXCLUDED."${n}"`).join(', ');
    const q = `INSERT INTO "${table}" (${names.map(n => `"${n}"`).join(',')}) VALUES ${placeholders}
               ON CONFLICT ("${keyCol}") DO UPDATE SET ${updates}`;
    try {
      await pool.query(q, rows.flatMap(r => r.vals));
      return 0;
    } catch {
      // batch failed (type mismatch / overflow) — fall back to per-row upserts
      let fb = 0;
      for (const r of rows) {
        await pool.query(
          `INSERT INTO "${table}" ("${keyCol}", data) VALUES ($1, $2)
           ON CONFLICT ("${keyCol}") DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [r.vals[keyIdx], r.vals[dataIdx]]);
        fb++;
      }
      return fb;
    }
  }));
  return results.reduce((a, b) => a + b, 0);
}

// ---------- migration ----------
const stats = {};
async function migrateCollection(ref, table, keyCol) {
  await ensureTable(table, keyCol);
  let count = 0, fallbacks = 0;
  let nextPromise = ref.orderBy('__name__').limit(1000).get();
  for (;;) {
    const snap = await nextPromise;
    if (snap.empty) break;
    // prefetch the next page while we process this one
    nextPromise = ref.orderBy('__name__').limit(1000)
      .startAfter(snap.docs[snap.docs.length - 1]).get();
    const subRefs = [];
    const groups = new Map();
    await inChunks(snap.docs, async (doc) => {
      const converted = deepConvert(doc.data());
      const keyVal = keyCol === 'doc_path' ? doc.ref.path : doc.id;
      const row = await rowFor(table, keyCol, keyVal, doc.id, converted);
      const gk = row.names.join(',');
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(row);
      count++;
      const subs = await doc.ref.listCollections();
      subRefs.push(...subs);
    });
    for (const group of groups.values()) fallbacks += await batchUpsert(table, keyCol, group);
    for (const sub of subRefs) {
      const subTable = `${table}__${colName(sub.id)}`.slice(0, 63);
      await migrateCollection(sub, subTable, 'doc_path');
    }
    process.stdout.write(`\r  ${table}: ${count} docs${fallbacks ? ` (${fallbacks} jsonb-only)` : ''}   `);
  }
  if (count) {
    console.log(`\r  ✓ ${table}: ${count} docs${fallbacks ? ` (${fallbacks} jsonb-only fallbacks)` : ''}      `);
    stats[table] = (stats[table] || 0) + count;
  }
}

(async () => {
  const roots = await db.listCollections();
  console.log(`Found ${roots.length} root collections: ${roots.map(c => c.id).join(', ')}\n`);
  for (const c of roots) {
    console.log(`📦 ${c.id}`);
    await migrateCollection(c, colName(c.id), 'id');
  }
  console.log('\n=== SUMMARY ===');
  let total = 0;
  for (const [t, n] of Object.entries(stats).sort()) { console.log(`  ${t}: ${n}`); total += n; }
  console.log(`  TOTAL: ${total} documents`);
  await pool.end();
  process.exit(0);
})().catch(e => { console.error('\nFATAL:', e); process.exit(1); });
