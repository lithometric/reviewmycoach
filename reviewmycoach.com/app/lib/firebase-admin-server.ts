/**
 * Server-side auth + data access.
 *
 * Auth: Firebase ID-token verification (signature checked against Google's
 * public certs — no service-account key required).
 * Data: Railway Postgres via the Firestore-compatible shim in ./pgdb.
 *
 * NOTE: adminAuth management APIs (getUser, updateUser, deleteUser, link
 * generation) require valid service-account credentials. The current key was
 * revoked, so those calls will fail until a fresh key is configured — same as
 * before this migration.
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { db as pgFirestore } from './pgdb';

let adminApp: App;
let adminAuth: Auth;

function formatPrivateKey(key: string): string {
  key = key.replace(/^["']+|["']+$/g, '');
  key = key.replace(/\\n/g, '\n');
  key = key.trim();
  if (!key.startsWith('-----BEGIN')) {
    key = '-----BEGIN PRIVATE KEY-----\n' + key;
  }
  if (!key.endsWith('-----')) {
    key = key + '\n-----END PRIVATE KEY-----';
  }
  return key;
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    adminAuth = getAuth(adminApp);
    return;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'review-my-coach';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    try {
      adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey: formatPrivateKey(privateKey) }),
        projectId,
      });
      adminAuth = getAuth(adminApp);
      return;
    } catch (error) {
      console.warn('Firebase Admin cert init failed, falling back to projectId-only init:', error);
    }
  }

  // projectId-only app: ID-token VERIFICATION still works (public certs);
  // privileged auth-management APIs will not.
  adminApp = initializeApp({ projectId });
  adminAuth = getAuth(adminApp);
}

initializeFirebaseAdmin();

// Postgres-backed Firestore-compatible database
const adminDb = pgFirestore;

export { adminApp, adminAuth, adminDb };

/**
 * Verify Firebase ID token
 */
export async function verifyFirebaseToken(token: string): Promise<{ uid: string; email?: string; email_verified?: boolean } | null> {
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
    };
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return null;
  }
}
