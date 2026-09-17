import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/firebase-admin-server';
import { sqlQuery } from '../../../lib/pgdb';

// GET - Find claimable coach profiles by email
export async function GET(req: NextRequest) {
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

    const userEmail = decodedToken.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'Email not found in token' }, { status: 400 });
    }

    // Find unclaimed coach profiles with matching email from Postgres
    const result = await sqlQuery(
      `SELECT id, data FROM coaches
       WHERE LOWER(data->>'email') = LOWER($1)
         AND COALESCE((data->>'isClaimed')::boolean, false) = false
       LIMIT 100`,
      [userEmail]
    );
    const coaches = result.rows.map((r: { id: string; data: Record<string, any> }) => ({ id: r.id, ...r.data }));

    const claimableProfiles = coaches.map((coach: any) => ({
      id: coach.id,
      username: coach.username,
      displayName: coach.displayName,
      email: coach.email,
      organization: coach.organization,
      role: coach.role,
      sports: coach.sports || [],
    }));

    return NextResponse.json({ 
      claimableProfiles,
      count: claimableProfiles.length 
    });

  } catch (error) {
    console.error('Error finding claimable profiles:', error);
    return NextResponse.json({
      error: 'Failed to find claimable profiles',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
