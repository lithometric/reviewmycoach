/**
 * Postgres data layer for ReviewMyCoach (Railway Postgres).
 *
 * Exposes a Firestore-Admin-compatible API (`db.collection(...).doc(...)`,
 * `where/orderBy/limit/get`, `set/update/delete/add`, `batch`) backed by
 * Postgres tables of shape (id, data JSONB, created_at, updated_at) — the
 * layout produced by scripts/migrate-firestore-to-railway.js.
 *
 * Documents live in the `data` JSONB column (camelCase keys, exactly like the
 * original Firestore docs). Matching snake_case structured columns, where they
 * exist, are kept in sync on writes for easy browsing/queries in Railway.
 */
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __rmcPgPool: Pool | undefined;
}

function connectionString(): string {
  // During `next build`, Railway's private network is unavailable; prefer the
  // public URL if provided.
  if (process.env.NEXT_PHASE === 'phase-production-build' && process.env.DATABASE_PUBLIC_URL) {
    return process.env.DATABASE_PUBLIC_URL;
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

export function getPool(): Pool {
  if (!global.__rmcPgPool) {
    global.__rmcPgPool = new Pool({ connectionString: connectionString(), max: 10 });
  }
  return global.__rmcPgPool;
}

export async function sqlQuery(text: string, values?: unknown[]) {
  return getPool().query(text, values);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const tableNameFor = (collection: string) =>
  collection.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

const snakeCase = (k: string) =>
  k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

/** Firestore-style 20-char document id */
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Convert any timestamp-ish value (ISO string, Date, Firestore Timestamp) to Date. */
export function toDateSafe(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.toDate === 'function') return (o.toDate as () => Date)();
  if (typeof o.seconds === 'number') return new Date((o.seconds as number) * 1000);
  if (typeof o._seconds === 'number') return new Date((o._seconds as number) * 1000);
  return null;
}

const ensuredTables = new Set<string>();
const tableColumns = new Map<string, Map<string, string>>();

async function ensureTable(table: string, keyCol: 'id' | 'doc_path' = 'id') {
  if (ensuredTables.has(table)) return;
  await sqlQuery(`CREATE TABLE IF NOT EXISTS "${table}" (
    ${keyCol === 'doc_path' ? 'doc_path TEXT PRIMARY KEY, id VARCHAR(255),' : 'id VARCHAR(255) PRIMARY KEY,'}
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  ensuredTables.add(table);
}

async function getColumns(table: string): Promise<Map<string, string>> {
  let cols = tableColumns.get(table);
  if (!cols) {
    const r = await sqlQuery(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`, [table]);
    cols = new Map(r.rows.map((x: { column_name: string; data_type: string }) => [x.column_name, x.data_type]));
    tableColumns.set(table, cols);
  }
  return cols;
}

function columnValue(dataType: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Build SET fragments syncing structured snake_case columns from a patch. */
async function columnSync(table: string, patch: Record<string, unknown>, params: unknown[]): Promise<string[]> {
  const cols = await getColumns(table);
  const frags: string[] = [];
  const reserved = new Set(['id', 'doc_path', 'data', 'created_at', 'updated_at']);
  for (const [k, v] of Object.entries(patch)) {
    const c = snakeCase(k);
    if (reserved.has(c) || !cols.has(c)) continue;
    params.push(columnValue(cols.get(c)!, v));
    frags.push(`"${c}" = $${params.length}`);
  }
  return frags;
}

// ---------------------------------------------------------------------------
// Firestore-compatible classes
// ---------------------------------------------------------------------------

export interface DocSnapshot {
  id: string;
  exists: boolean;
  ref: DocRef;
  data(): Record<string, any> | undefined;
  get(field: string): any;
  createTime?: Date;
  updateTime?: Date;
}

export interface QuerySnapshot {
  empty: boolean;
  size: number;
  docs: DocSnapshot[];
  forEach(cb: (doc: DocSnapshot) => void): void;
}

type WhereOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';

interface Cond { field: string; op: WhereOp; value: unknown }
interface Order { field: string; dir: 'asc' | 'desc' }

export class Query {
  constructor(
    protected table: string,
    protected keyCol: 'id' | 'doc_path',
    protected conds: Cond[] = [],
    protected orders: Order[] = [],
    protected limitN: number | null = null,
    protected offsetN: number | null = null,
    protected parentPath: string | null = null,
  ) {}

  where(field: string, op: WhereOp, value: unknown): Query {
    return new Query(this.table, this.keyCol, [...this.conds, { field, op, value }],
      this.orders, this.limitN, this.offsetN, this.parentPath);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    return new Query(this.table, this.keyCol, this.conds,
      [...this.orders, { field, dir }], this.limitN, this.offsetN, this.parentPath);
  }

  limit(n: number): Query {
    return new Query(this.table, this.keyCol, this.conds, this.orders, n, this.offsetN, this.parentPath);
  }

  offset(n: number): Query {
    return new Query(this.table, this.keyCol, this.conds, this.orders, this.limitN, n, this.parentPath);
  }

  select(..._fields: string[]): Query {
    return this; // we always fetch the full doc; selection is a no-op
  }

  count() {
    return {
      get: async () => {
        const { whereSql, params } = this.buildWhere();
        const r = await sqlQuery(`SELECT COUNT(*)::int AS n FROM "${this.table}"${whereSql}`, params);
        const n = r.rows[0]?.n ?? 0;
        return { data: () => ({ count: n }) };
      },
    };
  }

  protected buildWhere(): { whereSql: string; params: unknown[] } {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (this.parentPath) {
      params.push(`${this.parentPath}/%`);
      clauses.push(`doc_path LIKE $${params.length}`);
    }
    for (const c of this.conds) {
      const f = c.field;
      if (f === '__name__' || f === 'documentId') {
        params.push(c.value);
        clauses.push(`"${this.keyCol}" ${c.op === '==' ? '=' : c.op} $${params.length}`);
        continue;
      }
      const jsonText = `data->>'${f.replace(/'/g, "''")}'`;
      const jsonVal = `data->'${f.replace(/'/g, "''")}'`;
      switch (c.op) {
        case '==':
          if (c.value === null) { clauses.push(`(${jsonVal} IS NULL OR ${jsonVal} = 'null'::jsonb)`); break; }
          params.push(JSON.stringify(c.value));
          clauses.push(`${jsonVal} = $${params.length}::jsonb`);
          break;
        case '!=':
          params.push(JSON.stringify(c.value));
          clauses.push(`(${jsonVal} IS DISTINCT FROM $${params.length}::jsonb)`);
          break;
        case '>': case '>=': case '<': case '<=': {
          if (typeof c.value === 'number') {
            params.push(c.value);
            clauses.push(`(${jsonText})::numeric ${c.op} $${params.length}`);
          } else {
            params.push(String(c.value));
            clauses.push(`${jsonText} ${c.op} $${params.length}`);
          }
          break;
        }
        case 'in': {
          params.push(JSON.stringify(c.value));
          clauses.push(`${jsonVal} IN (SELECT jsonb_array_elements($${params.length}::jsonb))`);
          break;
        }
        case 'not-in': {
          params.push(JSON.stringify(c.value));
          clauses.push(`${jsonVal} NOT IN (SELECT jsonb_array_elements($${params.length}::jsonb))`);
          break;
        }
        case 'array-contains': {
          params.push(JSON.stringify([c.value]));
          clauses.push(`${jsonVal} @> $${params.length}::jsonb`);
          break;
        }
        case 'array-contains-any': {
          params.push(JSON.stringify(c.value));
          clauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements($${params.length}::jsonb) e WHERE ${jsonVal} @> jsonb_build_array(e))`);
          break;
        }
      }
    }
    return { whereSql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
  }

  async get(): Promise<QuerySnapshot> {
    await ensureTable(this.table, this.keyCol);
    const { whereSql, params } = this.buildWhere();
    let sql = `SELECT "${this.keyCol}" AS __key, ${this.keyCol === 'doc_path' ? 'id,' : ''} data, created_at, updated_at FROM "${this.table}"${whereSql}`;
    if (this.orders.length) {
      sql += ' ORDER BY ' + this.orders.map(o =>
        `data->'${o.field.replace(/'/g, "''")}' ${o.dir.toUpperCase()} NULLS LAST`).join(', ');
    }
    if (this.limitN != null) sql += ` LIMIT ${Math.max(0, Math.floor(this.limitN))}`;
    if (this.offsetN != null) sql += ` OFFSET ${Math.max(0, Math.floor(this.offsetN))}`;
    const r = await sqlQuery(sql, params);
    const docs = r.rows.map((row: any) => this.rowToSnapshot(row));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (cb) => docs.forEach(cb) };
  }

  protected rowToSnapshot(row: any): DocSnapshot {
    const id: string = this.keyCol === 'doc_path' ? (row.id ?? row.__key) : row.__key;
    const ref = new DocRef(this.table, this.keyCol, row.__key);
    const data = row.data ?? {};
    return {
      id,
      exists: true,
      ref,
      data: () => ({ ...data }),
      get: (field: string) => data[field],
      createTime: row.created_at ?? undefined,
      updateTime: row.updated_at ?? undefined,
    };
  }
}

export class DocRef {
  constructor(
    private table: string,
    private keyCol: 'id' | 'doc_path',
    public readonly key: string,
  ) {}

  get id(): string {
    return this.keyCol === 'doc_path' ? this.key.split('/').pop()! : this.key;
  }

  get path(): string {
    return this.keyCol === 'doc_path' ? this.key : `${this.table}/${this.key}`;
  }

  /** Subcollection — stored in `<table>__<sub>` keyed by doc_path. */
  collection(sub: string): CollectionRef {
    const subTable = `${this.table}__${tableNameFor(sub)}`.slice(0, 63);
    const parentPath = this.keyCol === 'doc_path' ? this.key : `${this.table}/${this.key}`;
    return new CollectionRef(subTable, 'doc_path', `${parentPath}/${sub}`);
  }

  async get(): Promise<DocSnapshot> {
    await ensureTable(this.table, this.keyCol);
    const r = await sqlQuery(
      `SELECT "${this.keyCol}" AS __key, ${this.keyCol === 'doc_path' ? 'id,' : ''} data, created_at, updated_at
       FROM "${this.table}" WHERE "${this.keyCol}" = $1 LIMIT 1`, [this.key]);
    if (r.rows.length === 0) {
      return {
        id: this.id, exists: false, ref: this,
        data: () => undefined, get: () => undefined,
      };
    }
    const row = r.rows[0];
    const data = row.data ?? {};
    return {
      id: this.id, exists: true, ref: this,
      data: () => ({ ...data }),
      get: (field: string) => data[field],
      createTime: row.created_at ?? undefined,
      updateTime: row.updated_at ?? undefined,
    };
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    await ensureTable(this.table, this.keyCol);
    const params: unknown[] = [this.key, JSON.stringify(data)];
    let cols = `"${this.keyCol}", data`;
    let vals = `$1, $2::jsonb`;
    if (this.keyCol === 'doc_path') { params.push(this.id); cols += ', id'; vals += ', $3'; }
    const dataExpr = options?.merge ? `"${this.table}".data || EXCLUDED.data` : 'EXCLUDED.data';
    await sqlQuery(
      `INSERT INTO "${this.table}" (${cols}) VALUES (${vals})
       ON CONFLICT ("${this.keyCol}") DO UPDATE SET data = ${dataExpr}, updated_at = NOW()`,
      params);
    // sync structured snake_case columns (applies to both insert and update)
    const p2: unknown[] = [this.key];
    const frags = await columnSync(this.table, data, p2);
    if (frags.length) {
      await sqlQuery(`UPDATE "${this.table}" SET ${frags.join(', ')} WHERE "${this.keyCol}" = $1`, p2);
    }
  }

  async update(patch: Record<string, unknown>): Promise<void> {
    await ensureTable(this.table, this.keyCol);
    // Firestore dot-path keys update nested fields
    const flat: Record<string, unknown> = {};
    const nested: Array<{ path: string[]; value: unknown }> = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes('.')) nested.push({ path: k.split('.'), value: v });
      else flat[k] = v;
    }
    const params: unknown[] = [this.key, JSON.stringify(flat)];
    let dataExpr = 'data || $2::jsonb';
    for (const n of nested) {
      // jsonb_set cannot create intermediate objects, so ensure each parent
      // prefix exists before setting the leaf value
      for (let i = 1; i < n.path.length; i++) {
        const prefix = n.path.slice(0, i);
        params.push(`{${prefix.join(',')}}`);
        const pathIdx = params.length;
        dataExpr = `jsonb_set(${dataExpr}, $${pathIdx}::text[], COALESCE((${dataExpr}) #> $${pathIdx}::text[], '{}'::jsonb), true)`;
      }
      params.push(`{${n.path.join(',')}}`);
      params.push(JSON.stringify(n.value === undefined ? null : n.value));
      dataExpr = `jsonb_set(${dataExpr}, $${params.length - 1}::text[], $${params.length}::jsonb, true)`;
    }
    const colFrags = await columnSync(this.table, flat, params);
    const r = await sqlQuery(
      `UPDATE "${this.table}" SET data = ${dataExpr}, updated_at = NOW()
         ${colFrags.length ? ', ' + colFrags.join(', ') : ''}
       WHERE "${this.keyCol}" = $1`, params);
    if (r.rowCount === 0) throw new Error(`No document to update: ${this.path}`);
  }

  async delete(): Promise<void> {
    await ensureTable(this.table, this.keyCol);
    await sqlQuery(`DELETE FROM "${this.table}" WHERE "${this.keyCol}" = $1`, [this.key]);
  }
}

export class CollectionRef extends Query {
  constructor(table: string, keyCol: 'id' | 'doc_path' = 'id', parentPath: string | null = null) {
    super(table, keyCol, [], [], null, null, parentPath);
  }

  get id(): string { return this.table; }

  doc(id?: string): DocRef {
    const docId = id ?? generateId();
    const key = this.keyCol === 'doc_path' ? `${this.parentPath}/${docId}` : docId;
    return new DocRef(this.table, this.keyCol, key);
  }

  async add(data: Record<string, unknown>): Promise<DocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class WriteBatch {
  private ops: Array<() => Promise<void>> = [];
  set(ref: DocRef, data: Record<string, unknown>, options?: { merge?: boolean }) {
    this.ops.push(() => ref.set(data, options)); return this;
  }
  update(ref: DocRef, patch: Record<string, unknown>) {
    this.ops.push(() => ref.update(patch)); return this;
  }
  delete(ref: DocRef) {
    this.ops.push(() => ref.delete()); return this;
  }
  async commit() {
    for (const op of this.ops) await op();
  }
}

export const db = {
  collection(name: string): CollectionRef {
    return new CollectionRef(tableNameFor(name));
  },
  doc(path: string): DocRef {
    const parts = path.split('/');
    if (parts.length === 2) return new DocRef(tableNameFor(parts[0]), 'id', parts[1]);
    // nested path like coaches/x/reviews/y
    const table = parts.slice(0, -1).filter((_, i) => i % 2 === 0).map(tableNameFor).join('__');
    return new DocRef(table, 'doc_path', path);
  },
  batch(): WriteBatch {
    return new WriteBatch();
  },
};

export type PgFirestore = typeof db;
