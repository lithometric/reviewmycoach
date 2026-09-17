import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, adminDb } from '../../../lib/firebase-admin-server';
import { toDateSafe } from '../../../lib/pgdb';

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

// GET - List pending moderation reports (admin only)
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if ('error' in admin) return admin.error;

    const snapshot = await adminDb
      .collection('reports')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    const reports = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        reporterId: data.reporterId ?? data.reporter_id ?? null,
        reportedItemType: data.reportedItemType ?? data.reported_item_type ?? null,
        reportedItemId: data.reportedItemId ?? data.reported_item_id ?? null,
        reason: data.reason ?? '',
        description: data.description ?? '',
        status: data.status ?? 'pending',
        createdAt: toDateSafe(data.createdAt ?? data.created_at)?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
