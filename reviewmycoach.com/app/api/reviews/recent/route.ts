import { NextRequest, NextResponse } from 'next/server';
import { toDateSafe } from '../../../lib/pgdb';

// Function to get Firebase instance
async function getFirebaseDb() {
  try {
    const firebaseAdminModule = await import('../../../lib/firebase-admin');
    return firebaseAdminModule.db;
  } catch (error) {
    console.error('Failed to load Firebase Admin in recent reviews route:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const db = await getFirebaseDb();
  
  // Early return if Firebase isn't initialized
  if (!db) {
    console.error('Firebase not initialized - returning fallback empty reviews');
    return NextResponse.json({ 
      reviews: [],
      error: 'Firebase connection not available',
      fallback: true
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit') || '6';
    const limitNum = parseInt(limitParam, 10);

    console.log('Fetching recent reviews with limit:', limitNum);

    // Get all coaches first with error handling
    let coachesSnapshot;
    try {
      coachesSnapshot = await db.collection('coaches').limit(50).get(); // Limit coaches to avoid timeout
    } catch (error) {
      console.error('Error fetching coaches:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch coaches',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
    if (coachesSnapshot.empty) {
      console.log('No coaches found in database');
      return NextResponse.json({ reviews: [] });
    }

    console.log(`Found ${coachesSnapshot.docs.length} coaches`);

    // Collect all recent reviews from all coaches with better error handling
    const allReviewsPromises = coachesSnapshot.docs.map(async (coachDoc) => {
      try {
        const coachId = coachDoc.id;
        const coachData = coachDoc.data() as Record<string, any>;
        
        console.log(`Fetching reviews for coach: ${coachId}`);

        // Get recent reviews for this coach
        const reviewsSnapshot = await db
          .collection('coaches')
          .doc(coachId)
          .collection('reviews')
          .orderBy('createdAt', 'desc')
          .limit(3) // Get a few recent reviews from each coach
          .get();

        if (reviewsSnapshot.empty) {
          console.log(`No reviews found for coach: ${coachId}`);
          return [];
        }

        console.log(`Found ${reviewsSnapshot.docs.length} reviews for coach: ${coachId}`);

        return reviewsSnapshot.docs.map(reviewDoc => {
          const reviewData = reviewDoc.data() as Record<string, any>;
          return {
            id: reviewDoc.id,
            coachId,
            coachName: coachData.displayName || coachData.username || coachData.name || 'Unknown Coach',
            coachSport: coachData.primarySport || (coachData.sports && coachData.sports[0]) || 'Sports Coach',
            studentName: reviewData.studentName || 'Anonymous',
            rating: reviewData.rating || 5,
            reviewText: reviewData.reviewText || '',
            sport: reviewData.sport || null,
            createdAt: toDateSafe(reviewData.createdAt)?.toISOString() || new Date().toISOString()
          };
        });
      } catch (error) {
        console.error(`Error fetching reviews for coach ${coachDoc.id}:`, error);
        return []; // Return empty array for this coach if there's an error
      }
    });

    let allReviewsArrays;
    try {
      allReviewsArrays = await Promise.all(allReviewsPromises);
    } catch (error) {
      console.error('Error processing reviews promises:', error);
      return NextResponse.json({ 
        error: 'Failed to process reviews',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }

    const allReviews = allReviewsArrays.flat();
    console.log(`Total reviews collected: ${allReviews.length}`);

    // Sort all reviews by creation date and limit
    const sortedReviews = allReviews
      .filter(review => review.createdAt && review.reviewText) // Only include valid reviews
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limitNum);

    console.log(`Returning ${sortedReviews.length} sorted reviews`);

    return NextResponse.json({ reviews: sortedReviews });

  } catch (error) {
    console.error('Error in recent reviews API:', error);
    
    // More detailed error logging
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 