import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyFirebaseToken } from '../../../lib/firebase-admin-server';

// GET - Fetch coach profile by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;

    // Fetch coach from Postgres
    const coachDoc = await adminDb.collection('coaches').doc(coachId).get();
    const coach: any = coachDoc.exists ? { id: coachDoc.id, ...coachDoc.data() } : null;

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: coach.id,
      username: coach.username,
      userId: coach.userId,
      displayName: coach.displayName,
      email: coach.email,
      phoneNumber: coach.phoneNumber,
      bio: coach.bio,
      sports: coach.sports || [],
      specialties: coach.specialties || [],
      certifications: coach.certifications || [],
      location: coach.location,
      organization: coach.organization,
      role: coach.role,
      gender: coach.gender,
      ageGroup: coach.ageGroup || [],
      availability: coach.availability || [],
      languages: coach.languages || [],
      website: coach.website,
      socialMedia: coach.socialMedia,
      hourlyRate: coach.hourlyRate || 0,
      experience: coach.experience || 0,
      averageRating: coach.averageRating || 0,
      totalReviews: coach.totalReviews || 0,
      profileImage: coach.profileImage,
      isVerified: coach.isVerified || false,
      isClaimed: coach.isClaimed,
      sourceUrl: coach.sourceUrl,
      subscriptionStatus: coach.subscriptionStatus,
      subscriptionTier: coach.subscriptionTier || 0,
      longevityPlatformYears: coach.longevityPlatformYears || 0,
      careerYears: coach.careerYears || 0,
      coursesCreated: coach.coursesCreated || 0,
      jobsCompleted: coach.jobsCompleted || 0,
      consistencyMultiplier: coach.consistencyMultiplier || 1.0,
      totalXp: coach.totalXp || 0,
      activeCardId: coach.activeCardId,
      activeCardImageUrl: coach.activeCardImageUrl,
      createdAt: coach.createdAt,
      updatedAt: coach.updatedAt,
    });

  } catch (error) {
    console.error('Error fetching coach:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update coach profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the token
    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const userId = decodedToken.uid;

    // Fetch coach to verify ownership
    const coachRef = adminDb.collection('coaches').doc(coachId);
    const coachDoc = await coachRef.get();
    const coach = coachDoc.exists ? coachDoc.data() : null;

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    if (coach.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates = await request.json();

    // Validate specific fields
    if (updates.hourlyRate && (updates.hourlyRate < 0 || updates.hourlyRate > 1000)) {
      return NextResponse.json({ error: 'Hourly rate must be between 0 and 1000' }, { status: 400 });
    }

    // Update in Postgres — only apply provided fields
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const field of ['bio', 'sports', 'location', 'hourlyRate', 'profileImage', 'isPublic', 'activeCardId', 'activeCardImageUrl'] as const) {
      if (updates[field] !== undefined) patch[field] = updates[field];
    }
    await coachRef.update(patch);

    return NextResponse.json({
      success: true,
      message: 'Coach profile updated successfully'
    });

  } catch (error) {
    console.error('Error updating coach:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
