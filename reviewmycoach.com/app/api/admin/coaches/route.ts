import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';

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

// POST - Admin-create an unclaimed coach profile.
// The coach document is keyed by username (matching the rest of the app), and a
// matching users doc is written so the profile is recognized as a coach account.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if ('error' in admin) return admin.error;

    const body = await request.json();
    const username = (body.username || '').toLowerCase().trim();

    if (!body.displayName || !body.email || !username) {
      return NextResponse.json(
        { error: 'displayName, email, and username are required' },
        { status: 400 }
      );
    }

    const existing = await adminDb.collection('coaches').doc(username).get();
    if (existing.exists) {
      return NextResponse.json(
        { error: 'A coach with that username already exists' },
        { status: 409 }
      );
    }

    // Unclaimed profile: userId is a generated id (no real owner yet).
    const coachId = `coach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nowIso = new Date().toISOString();

    await adminDb.collection('coaches').doc(username).set({
      id: username,
      userId: coachId,
      username,
      displayName: body.displayName,
      email: body.email,
      bio: body.bio || '',
      sports: body.sports || [],
      experience: body.experience || 0,
      certifications: body.certifications || [],
      hourlyRate: body.hourlyRate || 0,
      location: body.location || '',
      availability: [],
      specialties: body.specialties || [],
      languages: body.languages || [],
      organization: body.organization || '',
      role: body.role || '',
      gender: body.gender || '',
      ageGroup: body.ageGroup || [],
      sourceUrl: body.sourceUrl || '',
      averageRating: 0,
      totalReviews: 0,
      isVerified: false,
      isClaimed: false,
      isPublic: true,
      profileImage: '',
      phoneNumber: body.phoneNumber || '',
      website: body.website || '',
      socialMedia: body.socialMedia || {},
      profileCompleted: true,
      adminCreated: true,
      createdBy: admin.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Mirror a users doc so the account is recognized as a coach.
    await adminDb.collection('users').doc(coachId).set({
      userId: coachId,
      username,
      email: body.email,
      displayName: body.displayName,
      role: 'coach',
      onboardingCompleted: true,
      isVerified: false,
      adminCreated: true,
      createdBy: admin.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return NextResponse.json({ success: true, coachId: username, userId: coachId, username });
  } catch (error: any) {
    console.error('Error creating coach (admin):', error);
    if (
      error?.message?.includes('already exists') ||
      error?.message?.includes('unique constraint')
    ) {
      return NextResponse.json(
        { error: 'A coach with that username already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create coach profile', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
