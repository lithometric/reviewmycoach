import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

async function authedUid(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { error: NextResponse.json({ error: 'No authentication token' }, { status: 401 }) };
  }
  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  return { uid: decoded.uid, email: decoded.email };
}

// GET - Return the authenticated user's onboarding-relevant fields.
export async function GET(request: NextRequest) {
  try {
    const auth = await authedUid(request);
    if ('error' in auth) return auth.error;

    const userDoc = await adminDb.collection('users').doc(auth.uid).get();
    const data = userDoc.exists ? userDoc.data() : undefined;

    return NextResponse.json({
      exists: userDoc.exists,
      username: data?.username ?? null,
      displayName: data?.displayName ?? null,
      email: data?.email ?? auth.email ?? null,
      role: data?.role ?? null,
      onboardingCompleted: data?.onboardingCompleted ?? false,
    });
  } catch (error) {
    console.error('Error fetching onboarding user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

// PATCH - Merge onboarding fields into the authenticated user's doc.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authedUid(request);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (typeof body.username === 'string') patch.username = body.username.toLowerCase();
    if (body.role === 'student' || body.role === 'coach') patch.role = body.role;
    if (typeof body.onboardingCompleted === 'boolean') patch.onboardingCompleted = body.onboardingCompleted;
    if (typeof body.displayName === 'string') patch.displayName = body.displayName;

    await adminDb.collection('users').doc(auth.uid).set(patch, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating onboarding user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
