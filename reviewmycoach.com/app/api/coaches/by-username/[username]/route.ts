import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyFirebaseToken } from '../../../../lib/firebase-admin-server';
import { sqlQuery } from '../../../../lib/pgdb';
import { hasXpAffectingChanges, calculateXpFromCoach } from '../../../../lib/xp-service';

async function findCoachByUsername(username: string): Promise<{ id: string; [key: string]: any } | null> {
  const result = await sqlQuery(
    `SELECT id, data FROM coaches WHERE id = $1 OR LOWER(data->>'username') = $1 LIMIT 1`,
    [username]
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, ...result.rows[0].data };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params;
    const username = rawUsername.toLowerCase();

    // Fetch coach from Postgres
    const coach = await findCoachByUsername(username);

    if (coach) {
      return NextResponse.json({
        coach: {
          id: coach.id,
          username: coach.username,
          userId: coach.userId,
          displayName: coach.displayName,
          email: coach.email,
          phoneNumber: coach.phoneNumber,
          bio: coach.bio,
          sports: coach.sports,
          specialties: coach.specialties,
          certifications: coach.certifications,
          location: coach.location,
          organization: coach.organization,
          school: coach.school,
          role: coach.role,
          gender: coach.gender,
          ageGroup: coach.ageGroup,
          availability: coach.availability,
          languages: coach.languages,
          website: coach.website,
          socialMedia: coach.socialMedia,
          hourlyRate: coach.hourlyRate,
          experience: coach.experience,
          averageRating: coach.averageRating,
          totalReviews: coach.totalReviews,
          profileImage: coach.profileImage,
          isVerified: coach.isVerified,
          sourceUrl: coach.sourceUrl,
          activeCardId: coach.activeCardId,
          activeCardImageUrl: coach.activeCardImageUrl,
          // XP fields
          subscriptionTier: coach.subscriptionTier,
          longevityPlatformYears: coach.longevityPlatformYears,
          careerYears: coach.careerYears,
          coursesCreated: coach.coursesCreated,
          jobsCompleted: coach.jobsCompleted,
          consistencyMultiplier: coach.consistencyMultiplier,
          totalXp: coach.totalXp,
          createdAt: coach.createdAt,
          updatedAt: coach.updatedAt,
        }
      });
    } else {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error fetching coach by username:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    // Verify Firebase token
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { username: rawUsername } = await params;
    const username = rawUsername.toLowerCase();
    const body = await request.json();

    // Verify the coach belongs to the user
    const coach = await findCoachByUsername(username);
    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    if (coach.userId !== decodedToken.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update coach profile (handles both profile edits AND card activation).
    // Only apply fields that were provided.
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const field of ['bio', 'sports', 'location', 'hourlyRate', 'profileImage', 'isPublic', 'activeCardId', 'activeCardImageUrl', 'school'] as const) {
      if (body[field] !== undefined) patch[field] = body[field];
    }
    await adminDb.collection('coaches').doc(coach.id).update(patch);

    // If XP-affecting fields changed, trigger XP recalculation
    if (hasXpAffectingChanges(body)) {
      // Merge updated fields with existing coach data
      const updatedCoach = { ...coach, ...body };
      const newTotalXp = calculateXpFromCoach(updatedCoach);

      try {
        await adminDb.collection('coaches').doc(coach.id).update({
          totalXp: newTotalXp,
          updatedAt: new Date().toISOString(),
        });
        console.log(`📊 Updated XP for ${username}: ${newTotalXp}`);

        // Trigger card unlock check in background
        fetch(`${request.nextUrl.origin}/api/coaches/${coach.id}/update-xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coach: updatedCoach,
            userId: coach.userId,
            username: coach.username,
          }),
        }).catch(err => console.error('Background XP update failed:', err));
      } catch (xpErr) {
        console.error('Failed to update XP:', xpErr);
      }
    }

    console.log(`✅ Coach updated for ${username}`);
    return NextResponse.json({
      success: true,
      message: body.activeCardId ? 'Active card updated successfully' : 'Coach profile updated'
    });
  } catch (error) {
    console.error('Error updating coach:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
