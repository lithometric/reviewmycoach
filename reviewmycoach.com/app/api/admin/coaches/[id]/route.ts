import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../../lib/firebase-admin-server';

async function requireAdmin(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { error: NextResponse.json({ error: 'No authentication token' }, { status: 401 }) };
  }
  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 }) };
  }
  return { uid: decoded.uid };
}

// Fields an admin is allowed to overwrite on a coach profile.
const EDITABLE_FIELDS = [
  'displayName',
  'email',
  'bio',
  'sports',
  'experience',
  'certifications',
  'hourlyRate',
  'location',
  'specialties',
  'languages',
  'organization',
  'role',
  'gender',
  'ageGroup',
  'sourceUrl',
  'phoneNumber',
  'website',
  'socialMedia',
  'profileImage',
] as const;

// PATCH - Admin-update a coach profile (any coach, no ownership check).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if ('error' in admin) return admin.error;

    const { id } = await params;
    const body = await request.json();

    const coachRef = adminDb.collection('coaches').doc(id);
    const existing = await coachRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      lastEditedBy: admin.uid,
    };
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) patch[field] = body[field];
    }
    if (typeof body.username === 'string' && body.username.trim()) {
      patch.username = body.username.toLowerCase().trim();
    }

    await coachRef.set(patch, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating coach (admin):', error);
    return NextResponse.json(
      { error: 'Failed to update coach profile', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
