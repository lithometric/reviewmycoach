import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase-admin';

// GET /api/reviews/written?email=...&userId=...
// Returns: { total: number, lastReviewedAt?: string }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const userId = searchParams.get('userId');

    if (!email && !userId) {
      return NextResponse.json({ error: 'email or userId is required' }, { status: 400 });
    }

    // Global reviews collection stores user-written reviews
    // We count documents where email field matches, or userId matches if present
    const base = db.collection('reviews');
    const query = userId
      ? base.where('studentId', '==', userId)
      : email
        ? base.where('email', '==', email)
        : base;

    const snapshot = await query.get();

    let total = 0;
    let lastReviewedAt: string | undefined;
    snapshot.forEach((doc) => {
      total += 1;
      const createdAt = (doc.data()?.createdAt as any)?.toDate?.() ?? (doc.data()?.createdAt ? new Date(doc.data()?.createdAt) : null);
      if (createdAt) {
        const iso = createdAt.toISOString();
        if (!lastReviewedAt || iso > lastReviewedAt) lastReviewedAt = iso;
      }
    });

    return NextResponse.json({ total, lastReviewedAt });
  } catch (error) {
    console.error('Error counting written reviews:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


