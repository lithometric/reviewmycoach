/**
 * Server-side coach search — Railway Postgres.
 *
 * Replaces the old Firebase Data Connect implementation with direct SQL over
 * public.coaches (documents in the `data` JSONB column, camelCase keys).
 * Export signatures and return shapes are unchanged: arrays of camelCase
 * coach objects ({ id, username, displayName, sports, averageRating, ... }).
 */
import { sqlQuery } from './pgdb';

function rowsToCoaches(rows: Array<{ id: string; data: Record<string, any> }>) {
  return rows.map((r) => ({ id: r.id, ...r.data }));
}

/**
 * Search coaches with advanced filtering (server-side).
 * searchTerm matches username/displayName/bio/sports/specialties/location/
 * organization/school/email-domain; username & displayName matches rank first.
 */
export async function searchCoachesWithFilters(params: {
  searchTerm?: string;
  sport?: string;
  location?: string;
  gender?: string;
  organization?: string;
  minRating?: number;
  maxRate?: number;
  isVerified?: boolean;
  page?: number;
  limit?: number;
}) {
  const limit = params.limit || 12;
  const page = params.page || 1;
  const offset = (page - 1) * limit;

  const values: unknown[] = [];
  const where: string[] = [`(data->>'isPublic')::boolean IS TRUE`];

  if (params.sport) {
    values.push(`%${params.sport}%`);
    where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'sports','[]'::jsonb)) s WHERE s ILIKE $${values.length})`);
  }
  if (params.location) {
    values.push(`%${params.location}%`);
    where.push(`data->>'location' ILIKE $${values.length}`);
  }
  if (params.gender) {
    values.push(params.gender);
    where.push(`LOWER(data->>'gender') = LOWER($${values.length})`);
  }
  if (params.organization) {
    values.push(`%${params.organization}%`);
    where.push(`data->>'organization' ILIKE $${values.length}`);
  }
  if (params.minRating !== undefined && params.minRating !== null) {
    values.push(params.minRating);
    where.push(`COALESCE((data->>'averageRating')::numeric, 0) >= $${values.length}`);
  }
  if (params.maxRate !== undefined && params.maxRate !== null) {
    values.push(params.maxRate);
    where.push(`COALESCE((data->>'hourlyRate')::numeric, 0) <= $${values.length}`);
  }
  if (params.isVerified !== undefined) {
    where.push(`COALESCE((data->>'isVerified')::boolean, false) = ${params.isVerified ? 'TRUE' : 'FALSE'}`);
  }

  let relevance = '';
  if (params.searchTerm && params.searchTerm.trim()) {
    values.push(`%${params.searchTerm.trim()}%`);
    const t = `$${values.length}`;
    where.push(`(
      data->>'username' ILIKE ${t} OR
      data->>'displayName' ILIKE ${t} OR
      data->>'bio' ILIKE ${t} OR
      data->>'location' ILIKE ${t} OR
      data->>'organization' ILIKE ${t} OR
      data->>'school' ILIKE ${t} OR
      split_part(COALESCE(data->>'email',''), '@', 2) ILIKE ${t} OR
      EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'sports','[]'::jsonb)) s WHERE s ILIKE ${t}) OR
      EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'specialties','[]'::jsonb)) s WHERE s ILIKE ${t})
    )`);
    relevance = `CASE
      WHEN data->>'username' ILIKE ${t} THEN 0
      WHEN data->>'displayName' ILIKE ${t} THEN 1
      ELSE 2 END,`;
  }

  const sql = `
    SELECT id, data FROM coaches
    WHERE ${where.join(' AND ')}
    ORDER BY ${relevance} COALESCE((data->>'averageRating')::numeric, 0) DESC, id ASC
    LIMIT ${Math.max(0, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`;

  const r = await sqlQuery(sql, values);
  return rowsToCoaches(r.rows);
}

/**
 * Get public coaches with pagination (server-side)
 */
export async function fetchPublicCoaches(params: {
  page?: number;
  limit?: number | null;
}) {
  const limit = params.limit === null ? 100000 : (params.limit || 24);
  const page = params.page || 1;
  const offset = (page - 1) * limit;

  const r = await sqlQuery(
    `SELECT id, data FROM coaches
     WHERE (data->>'isPublic')::boolean IS TRUE
     ORDER BY COALESCE((data->>'averageRating')::numeric, 0) DESC, id ASC
     LIMIT $1 OFFSET $2`, [limit, offset]);
  return rowsToCoaches(r.rows);
}

/**
 * Count public coaches matching an optional search term (for pagination UIs).
 */
export async function countPublicCoaches(searchTerm?: string): Promise<number> {
  const values: unknown[] = [];
  let extra = '';
  if (searchTerm && searchTerm.trim()) {
    values.push(`%${searchTerm.trim()}%`);
    const t = `$${values.length}`;
    extra = ` AND (
      data->>'username' ILIKE ${t} OR data->>'displayName' ILIKE ${t} OR
      data->>'bio' ILIKE ${t} OR data->>'location' ILIKE ${t} OR
      data->>'organization' ILIKE ${t} OR data->>'school' ILIKE ${t} OR
      EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'sports','[]'::jsonb)) s WHERE s ILIKE ${t})
    )`;
  }
  const r = await sqlQuery(
    `SELECT COUNT(*)::int AS n FROM coaches WHERE (data->>'isPublic')::boolean IS TRUE${extra}`, values);
  return r.rows[0]?.n ?? 0;
}

/**
 * Filter coaches on the server side for complex search terms
 * (kept for compatibility — pure function, no DB access)
 */
export function filterCoaches(coaches: any[], searchTerm?: string, organization?: string, ageGroup?: string) {
  let filtered = [...coaches];

  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    filtered = filtered.filter((coach) => {
      const username = (coach.username || '').toLowerCase();
      const displayName = (coach.displayName || '').toLowerCase();
      const bio = (coach.bio || '').toLowerCase();
      const sports = Array.isArray(coach.sports) ? coach.sports.map((s: string) => s?.toLowerCase()) : [];
      const specialties = Array.isArray(coach.specialties) ? coach.specialties.map((s: string) => s?.toLowerCase()) : [];
      const organization = (coach.organization || '').toLowerCase();
      const school = (coach.school || '').toLowerCase();
      const email = (coach.email || '').toLowerCase();
      const emailDomain = email.includes('@') ? email.split('@')[1] : '';

      return (
        username.includes(term) ||
        displayName.includes(term) ||
        bio.includes(term) ||
        sports.some((s: string) => s?.includes(term)) ||
        specialties.some((s: string) => s?.includes(term)) ||
        organization.includes(term) ||
        school.includes(term) ||
        emailDomain.includes(term)
      );
    });

    filtered.sort((a, b) => {
      const aUsernameMatch = (a.username || '').toLowerCase().includes(term);
      const aDisplayNameMatch = (a.displayName || '').toLowerCase().includes(term);
      const bUsernameMatch = (b.username || '').toLowerCase().includes(term);
      const bDisplayNameMatch = (b.displayName || '').toLowerCase().includes(term);
      if (aUsernameMatch && !bUsernameMatch) return -1;
      if (!aUsernameMatch && bUsernameMatch) return 1;
      if (aDisplayNameMatch && !bDisplayNameMatch) return -1;
      if (!aDisplayNameMatch && bDisplayNameMatch) return 1;
      return (b.averageRating || 0) - (a.averageRating || 0);
    });
  }

  if (organization) {
    filtered = filtered.filter((coach) =>
      (coach.organization || '').toLowerCase().includes(organization.toLowerCase())
    );
  }

  if (ageGroup) {
    filtered = filtered.filter((coach) =>
      Array.isArray(coach.ageGroup) && coach.ageGroup.some((age: string) =>
        (age || '').toLowerCase().includes(ageGroup.toLowerCase())
      )
    );
  }

  return filtered;
}
