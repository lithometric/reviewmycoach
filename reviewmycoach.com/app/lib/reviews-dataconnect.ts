/**
 * Reviews helper — Railway Postgres (server-side only).
 *
 * Replaces the old Firebase Data Connect implementation with SQL over
 * public.reviews. Review objects keep the same camelCase shape:
 * { id, coachId, coachUsername, userId, email, studentName, rating,
 *   reviewText, sport, createdAt }
 */
import { sqlQuery } from './pgdb';

function rowsToReviews(rows: Array<{ id: string; data: Record<string, any> }>) {
  return rows.map((r) => ({ id: r.id, ...r.data }));
}

/**
 * Fetch reviews for a specific coach
 */
export async function fetchCoachReviews(coachId: string, limit: number = 50) {
  const r = await sqlQuery(
    `SELECT id, data FROM reviews
     WHERE data->>'coachId' = $1 OR data->>'coachUsername' = $1
     ORDER BY created_at DESC LIMIT $2`, [coachId, limit]);
  return rowsToReviews(r.rows);
}

/**
 * Fetch reviews with pagination
 */
export async function fetchCoachReviewsPaginated(coachId: string, page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  const r = await sqlQuery(
    `SELECT id, data FROM reviews
     WHERE data->>'coachId' = $1 OR data->>'coachUsername' = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [coachId, limit, offset]);
  return rowsToReviews(r.rows);
}

/**
 * Fetch recent reviews across all coaches
 */
export async function fetchRecentReviews(limit: number = 10) {
  const r = await sqlQuery(
    `SELECT id, data FROM reviews ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rowsToReviews(r.rows);
}

/**
 * Create a new review
 */
export async function addReview(reviewData: {
  id: string;
  coachId: string;
  coachUsername: string;
  userId?: string;
  email?: string;
  studentName: string;
  rating: number;
  reviewText: string;
  sport: string;
}) {
  const createdAt = new Date().toISOString();
  const doc: Record<string, unknown> = { ...reviewData, createdAt };
  delete doc.id;
  await sqlQuery(
    `INSERT INTO reviews (id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [reviewData.id, JSON.stringify(doc), createdAt]);
  return { review_insert: { id: reviewData.id } };
}

/**
 * Update coach rating statistics
 */
export async function updateCoachStats(coachId: string, averageRating: number, totalReviews: number) {
  await sqlQuery(
    `UPDATE coaches SET
       data = data || jsonb_build_object('averageRating', $2::numeric, 'totalReviews', $3::int),
       average_rating = $2, total_reviews = $3, updated_at = NOW()
     WHERE id = $1 OR data->>'username' = $1`,
    [coachId, averageRating, totalReviews]);
  return { coach_update: { id: coachId } };
}

/**
 * Calculate rating statistics from a list of reviews
 */
export function calculateRatingStats(reviews: any[]) {
  if (!reviews || reviews.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }
  const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  return {
    averageRating: Math.round((total / reviews.length) * 100) / 100,
    totalReviews: reviews.length,
  };
}
