import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

// GET - Fetch the authenticated coach's subscription state.
// Resolves the caller's username from their user doc, then reads the coach
// record (keyed by lowercase username) for subscription fields.
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decoded = await verifyFirebaseToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const username = userDoc.exists ? (userDoc.data()?.username as string | undefined) : undefined;

    if (!username) {
      return NextResponse.json({ found: false });
    }

    const coachDoc = await adminDb.collection('coaches').doc(username.toLowerCase()).get();
    if (!coachDoc.exists) {
      return NextResponse.json({ found: false });
    }

    const coach = coachDoc.data() || {};

    return NextResponse.json({
      found: true,
      coach: {
        userId: coach.userId || decoded.uid,
        displayName: coach.displayName || userDoc.data()?.displayName || '',
        isCoach: true,
        subscriptionStatus: coach.subscriptionStatus || coach.subscription_status || 'inactive',
        subscriptionPlan: coach.subscriptionPlan || null,
        subscriptionId: coach.subscriptionId || null,
      },
    });
  } catch (error) {
    console.error('Error fetching coach subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
