import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin-server';
import { toDateSafe } from '../../../lib/pgdb';
import { fetchPublicCoaches } from '../../../lib/firebase-dataconnect-server';

// GET - Aggregated public marketplace data: featured coaches, open jobs,
// active services, and active courses. Each source is isolated so a missing
// table/collection degrades to an empty list instead of failing the page.
export async function GET() {
  const [coaches, jobs, services, courses] = await Promise.all([
    fetchFeaturedCoaches(),
    fetchOpenJobs(),
    fetchActiveServices(),
    fetchActiveCourses(),
  ]);

  return NextResponse.json({ coaches, jobs, services, courses });
}

async function fetchFeaturedCoaches() {
  try {
    const coaches = await fetchPublicCoaches({ page: 1, limit: 50 });
    return [...coaches]
      .sort((a: any, b: any) => (b.averageRating || 0) - (a.averageRating || 0))
      .slice(0, 6);
  } catch (error) {
    console.error('marketplace/overview: coaches failed', error);
    return [];
  }
}

async function fetchOpenJobs() {
  try {
    const snapshot = await adminDb
      .collection('jobs')
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDateSafe(doc.data()?.createdAt)?.toISOString() ?? null,
      deadline: toDateSafe(doc.data()?.deadline)?.toISOString() ?? null,
    }));
  } catch (error) {
    console.error('marketplace/overview: jobs failed', error);
    return [];
  }
}

async function fetchActiveServices() {
  try {
    const snapshot = await adminDb
      .collection('services')
      .where('isActive', '==', true)
      .limit(8)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('marketplace/overview: services failed', error);
    return [];
  }
}

async function fetchActiveCourses() {
  try {
    const snapshot = await adminDb
      .collection('courses')
      .where('isActive', '==', true)
      .limit(8)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('marketplace/overview: courses failed', error);
    return [];
  }
}
