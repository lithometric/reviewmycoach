import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

// POST - Claim a coach profile
export async function POST(req: NextRequest) {
  try {
    // Verify Firebase token
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;
    const emailVerified = decodedToken.email_verified || false;

    const { coachId } = await req.json();

    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID required' }, { status: 400 });
    }

    // Verify email is verified before claiming
    if (!emailVerified) {
      return NextResponse.json({ 
        error: 'Email not verified',
        message: 'Please verify your email before claiming a coach profile'
      }, { status: 400 });
    }

    // Claim the coach profile in Postgres
    await adminDb.collection('coaches').doc(coachId).update({
      userId: userId,
      isClaimed: true,
      updatedAt: new Date().toISOString(),
    });

    // Update user role in Firestore
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.set({
      role: 'coach',
      onboardingCompleted: true,
      updatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: 'Profile claimed successfully',
      coachId: coachId
    });

  } catch (error: any) {
    console.error('Error claiming coach profile:', error);
    
    if (error.message?.includes('Email mismatch')) {
      return NextResponse.json({ 
        error: 'Email mismatch',
        message: 'Your email does not match the coach profile email'
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to claim profile',
      details: error.message || 'Unknown error'
    }, { status: 500 });
  }
}
