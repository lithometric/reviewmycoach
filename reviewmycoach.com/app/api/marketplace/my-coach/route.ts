import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getDataConnect } from 'firebase/data-connect';
import { getCoachByUsername } from '../../../lib/dataconnect';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

// Initialize Firebase Client for Data Connect
let clientApp;
if (getApps().length === 0) {
  clientApp = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
} else {
  clientApp = getApps()[0];
}

const dataConnect = getDataConnect(clientApp, {
  connector: 'reviewmycoach',
  location: 'us-east4',
  service: 'review-my-coach-service',
});

// GET - Return the authenticated user's own coach profile (if any).
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
    const username = userDoc.data()?.username;
    if (!username) {
      return NextResponse.json({ coach: null });
    }

    const result = await getCoachByUsername(dataConnect, { username: String(username).toLowerCase() });
    const coach = result.data.coaches?.[0] ?? null;

    return NextResponse.json({ coach });
  } catch (error) {
    console.error('Error fetching own coach profile:', error);
    return NextResponse.json({ coach: null });
  }
}
