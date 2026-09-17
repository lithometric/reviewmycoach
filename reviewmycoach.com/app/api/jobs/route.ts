import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '../../lib/firebase-admin';
import { toDateSafe } from '../../lib/pgdb';

// GET - Fetch available jobs (Coach Pro required)
export async function GET(request: NextRequest) {
  try {
    // Check for authentication token and Coach Pro subscription
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decodedToken = await auth.verifyIdToken(token);
        const userId = decodedToken.uid;
        
        // Check Coach Pro subscription status
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const subscription = userData?.subscription;
          
          // Check if user has active Coach Pro subscription
          let hasCoachPro = false;
          if (subscription) {
            const now = new Date();
            const expiresAt = toDateSafe(subscription.expiresAt);
            hasCoachPro = subscription.isActive === true && 
                         subscription.plan === 'pro' && 
                         (!expiresAt || expiresAt > now);
          }
          
          if (!hasCoachPro) {
            return NextResponse.json({ 
              error: 'Coach Pro subscription required to access job listings' 
            }, { status: 403 });
          }
        }
      } catch (error) {
        return NextResponse.json({ 
          error: 'Invalid authentication token' 
        }, { status: 401 });
      }
    } else {
      return NextResponse.json({ 
        error: 'Authentication required to access job listings' 
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const sport = searchParams.get('sport');
    const location = searchParams.get('location');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = db.collection('jobs').orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', '==', status);
    }

    if (sport && sport !== 'all') {
      query = query.where('sport', '==', sport);
    }

    if (location && location !== 'all') {
      query = query.where('location', '==', location);
    }

    query = query.limit(limit).offset(offset);

    const snapshot = await query.get();
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDateSafe(doc.data()?.createdAt)?.toISOString(),
      deadline: toDateSafe(doc.data()?.deadline)?.toISOString(),
      updatedAt: toDateSafe(doc.data()?.updatedAt)?.toISOString(),
    }));

    return NextResponse.json({ jobs, total: snapshot.size });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

// POST - Create a new job posting
export async function POST(request: NextRequest) {
  try {
    const { 
      title, 
      description, 
      budget, 
      location, 
      sport, 
      deadline, 
      requiredSkills,
      idToken 
    } = await request.json();

    // Validate required fields
    if (!title || !description || !budget || !location || !sport || !deadline) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate budget
    if (typeof budget !== 'number' || budget <= 0) {
      return NextResponse.json(
        { error: 'Budget must be a positive number' },
        { status: 400 }
      );
    }

    // Validate deadline
    const deadlineDate = new Date(deadline);
    if (deadlineDate <= new Date()) {
      return NextResponse.json(
        { error: 'Deadline must be in the future' },
        { status: 400 }
      );
    }

    // Authenticate user (optional - allow anonymous job posting)
    let userId = null;
    let userEmail = null;
    
    if (idToken) {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        userId = decodedToken.uid;
        userEmail = decodedToken.email;
      } catch {
        console.log('Invalid token provided, creating as anonymous job');
      }
    }

    // Create job document
    const jobRef = db.collection('jobs').doc();
    const jobData = {
      id: jobRef.id,
      title,
      description,
      budget,
      location,
      sport,
      deadline: deadlineDate,
      requiredSkills: requiredSkills || [],
      postedBy: userId || 'anonymous',
      posterEmail: userEmail || null,
      status: 'open',
      applicants: 0,
      applications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await jobRef.set(jobData);

    return NextResponse.json({
      message: 'Job posted successfully',
      ...jobData,
      createdAt: jobData.createdAt.toISOString(),
      deadline: jobData.deadline.toISOString(),
      updatedAt: jobData.updatedAt.toISOString(),
    });

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
} 