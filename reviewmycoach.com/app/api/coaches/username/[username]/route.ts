import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase-admin-server';
import { sqlQuery } from '../../../../lib/pgdb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Basic username validation
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ 
        available: false, 
        error: 'Username must be 3-20 characters long and contain only letters, numbers, hyphens, and underscores' 
      }, { status: 400 });
    }

    const usernameLower = username.toLowerCase();

    // Check if username is already taken in Firestore users collection
    const usersSnapshot = await adminDb.collection('users')
      .where('username', '==', usernameLower)
      .limit(1)
      .get();
    const userExists = !usersSnapshot.empty;

    // Check if username is already taken in the coaches table
    let coachExists = false;
    try {
      const result = await sqlQuery(
        `SELECT 1 FROM coaches WHERE LOWER(data->>'username') = $1 LIMIT 1`,
        [usernameLower]
      );
      coachExists = result.rows.length > 0;
    } catch (error) {
      // If error, assume available (fail open)
      console.error('Error checking coach username:', error);
    }

    // Username is available if it's not found in either location
    const available = !userExists && !coachExists;

    return NextResponse.json({ 
      available,
      username: usernameLower
    });

  } catch (error) {
    console.error('Error checking username availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 