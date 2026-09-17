import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

// GET - Fetch a user document (public-ish profile fields) by userId
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = userDoc.data() || {};

    return NextResponse.json({
      userId,
      role: data.role || null,
      username: data.username || null,
      displayName: data.displayName || null,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      onboardingCompleted: data.onboardingCompleted || false,
      activeProfileCard: data.activeProfileCard || null,
      isPublic: data.isPublic !== false,
      isVerified: data.isVerified || false,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create/merge the authenticated user's own document
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decoded = await verifyFirebaseToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();

    const patch: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
    // Never let the client set identity/uid via the body.
    delete patch.uid;
    delete patch.userId;

    await adminDb.collection('users').doc(decoded.uid).set(patch, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
