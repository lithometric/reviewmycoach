import { NextRequest, NextResponse } from 'next/server';
import { fetchCoachReviews, addReview, calculateRatingStats, updateCoachStats } from '../../../../lib/reviews-dataconnect';
import { verifyFirebaseToken, adminDb } from '../../../../lib/firebase-admin-server';

interface ReviewData {
  studentId: string;
  studentName: string;
  rating: number;
  reviewText: string;
  sport?: string;
}

// POST - Create a new review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    let userId = null;
    let isAuthenticated = false;
    let userEmail = null;
    
    // Try to verify token if provided
    if (token) {
      try {
        const decodedToken = await verifyFirebaseToken(token);
        if (decodedToken) {
          userId = decodedToken.uid;
          userEmail = decodedToken.email;
          isAuthenticated = true;
        }
      } catch {
        console.log('Invalid token provided, treating as anonymous user');
      }
    }

    const body = await request.json();
    const { rating, reviewText, sport, coachUsername } = body;
    
    // Generate unique ID
    const effectiveUserId = userId || `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Basic validation
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    if (!reviewText || !reviewText.trim()) {
      return NextResponse.json({ error: 'Review text is required' }, { status: 400 });
    }

    // Look up coach username from coachId if not provided in body
    let resolvedCoachUsername = coachUsername;
    if (!resolvedCoachUsername) {
      try {
        const coachDoc = await adminDb.collection('coaches').doc(coachId).get();
        resolvedCoachUsername = coachDoc.exists ? coachDoc.data()?.username : undefined;
      } catch (err) {
        console.error('Error looking up coach username:', err);
      }
    }

    if (!resolvedCoachUsername) {
      return NextResponse.json({ error: 'Could not resolve coach username' }, { status: 400 });
    }

    // Get user's display name if authenticated
    let studentName = 'Anonymous User';
    if (isAuthenticated && userId) {
      try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          studentName = userData?.username || userData?.displayName || 'Anonymous User';
        }
      } catch {
        console.log('Could not fetch user data, using Anonymous');
      }
    }

    // Generate review ID
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create review in Data Connect
    await addReview({
      id: reviewId,
      coachId: coachId,
      coachUsername: resolvedCoachUsername,
      userId: effectiveUserId,
      email: userEmail || undefined,
      studentName: studentName,
      rating: Number(rating),
      reviewText: String(reviewText).trim(),
      sport: sport || 'General',
    });

    // Fetch all reviews for this coach to recalculate stats
    const allReviews = await fetchCoachReviews(coachId, 1000);
    const stats = calculateRatingStats(allReviews);
    
    // Update coach rating stats in Data Connect
    await updateCoachStats(coachId, stats.averageRating, stats.totalReviews);

    return NextResponse.json({ 
      success: true, 
      reviewId: reviewId,
      message: 'Review created successfully'
    });

  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - Fetch coach reviews
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);

    // Fetch reviews from Data Connect
    const reviews = await fetchCoachReviews(coachId, limitParam);

    const formattedReviews = reviews.map((review: any) => ({
      id: review.id,
      studentId: review.userId || review.studentId,
      studentName: review.studentName,
      rating: review.rating,
      reviewText: review.reviewText,
      sport: review.sport,
      createdAt: review.createdAt,
    }));

    return NextResponse.json({ reviews: formattedReviews });

  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch reviews',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
