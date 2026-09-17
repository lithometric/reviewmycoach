import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase-admin';

// GET /api/bookmarks/count?userId=...&type=coach
// Returns: { total: number }
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    let query = db.collection('bookmarks').where('userId', '==', userId);
    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();
    return NextResponse.json({ total: snapshot.size });
  } catch (error) {
    console.error('Error counting bookmarks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


