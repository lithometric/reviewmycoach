import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/firebase-admin-server';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/coach-requests/[id]
 * Approve or reject a coach request
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin token
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const adminUserId = decodedToken.uid;

    // TODO: Verify user is admin
    // For now, any authenticated user can approve/reject requests
    // In production, check if user has admin role

    // TODO: Re-enable after schema is deployed to database
    return NextResponse.json({
      success: false,
      message: 'Coach request feature temporarily disabled',
    }, { status: 503 });

    /*
    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason } = body;

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Get the coach request
    const requestResult = await getCoachRequest(dataConnect, { id });
    const coachRequest = requestResult.data.coachRequest;

    if (!coachRequest) {
      return NextResponse.json({ error: 'Coach request not found' }, { status: 404 });
    }

    if (coachRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `Coach request has already been ${coachRequest.status}` },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      // Create a new coach profile
      const coachId = uuidv4();
      const username = coachRequest.coachName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      // Create coach in database
      await createCoach(dataConnect, {
        id: coachId,
        username: username,
        userId: '', // Not claimed yet
        displayName: coachRequest.coachName,
        email: '',
      });

      // Update the request as approved
      await approveCoachRequest(dataConnect, {
        id: id,
        reviewedByUserId: adminUserId,
        createdCoachId: coachId,
      });

      return NextResponse.json({
        success: true,
        message: 'Coach request approved and coach created',
        coachId,
        username,
      });

    } else {
      // Reject the request
      if (!rejectionReason) {
        return NextResponse.json(
          { error: 'Rejection reason is required' },
          { status: 400 }
        );
      }

      await rejectCoachRequest(dataConnect, {
        id: id,
        reviewedByUserId: adminUserId,
        rejectionReason: rejectionReason,
      });

      return NextResponse.json({
        success: true,
        message: 'Coach request rejected',
      });
    }
    */

  } catch (error) {
    console.error('Error processing coach request:', error);
    return NextResponse.json(
      { error: 'Failed to process coach request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/coach-requests/[id]
 * Get a specific coach request
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin token
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // TODO: Re-enable after schema is deployed to database
    return NextResponse.json({
      success: false,
      message: 'Coach request feature temporarily disabled',
    }, { status: 503 });

    /*
    const { id } = await params;

    // Get the coach request
    const result = await getCoachRequest(dataConnect, { id });
    const coachRequest = result.data.coachRequest;

    if (!coachRequest) {
      return NextResponse.json({ error: 'Coach request not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: coachRequest,
    });
    */

  } catch (error) {
    console.error('Error fetching coach request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coach request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
