import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicCoaches, filterCoaches } from '../../lib/firebase-dataconnect-server';
import { verifyFirebaseToken, adminDb } from '../../lib/firebase-admin-server';
import {
  calculateCoachXP,
  type XPCalculationInputs,
} from '../../lib/xp-calculator';

interface CoachData {
  id: string;
  displayName?: string;
  email?: string;
  bio?: string;
  specialties?: string[];
  sports?: string[];
  hourlyRate?: number;
  organization?: string;
  role?: string;
  gender?: string;
  ageGroup?: string[];
  sourceUrl?: string;
  userId?: string;
  username?: string;
  averageRating?: number;
  totalReviews?: number;
  profileImage?: string;
  isVerified?: boolean;
  hasActiveServices?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  xp?: number;
  [key: string]: any;
}

// GET - Fetch coaches with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const limitParam = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const searchTermParam = searchParams.get('search');
    const organizationParam = searchParams.get('organization');
    const ageGroupParam = searchParams.get('ageGroup');
    const sortByXP = searchParams.get('sortByXP') === 'true';

    // Fetch coaches from Firebase Data Connect
    // If sorting by XP, fetch ALL coaches (no limit) to ensure we get the top ones after sorting
    // Then we'll sort by XP and limit to the requested amount
    const fetchLimit = sortByXP ? null : limitParam; // null = fetch all coaches
    
    let coaches: any[];
    try {
      coaches = await fetchPublicCoaches({
        page: pageParam,
        limit: fetchLimit,
      });
      
      // Debug: Check if XP fields are present and if kevinvera7 is in the list
      if (sortByXP && coaches.length > 0) {
        console.log(`📊 Fetched ${coaches.length} coaches from Data Connect`);
        
        // Check if kevinvera7 is in the fetched coaches
        const kevinvera7 = coaches.find((c: any) => 
          c.username?.toLowerCase() === 'kevinvera7' || 
          c.displayName?.toLowerCase().includes('kevin vera')
        );
        
        if (kevinvera7) {
          console.log('✅ Found kevinvera7 in fetched coaches:', {
            username: kevinvera7.username,
            displayName: kevinvera7.displayName,
            subscriptionTier: kevinvera7.subscriptionTier,
            longevityPlatformYears: kevinvera7.longevityPlatformYears,
            careerYears: kevinvera7.careerYears,
            coursesCreated: kevinvera7.coursesCreated,
            jobsCompleted: kevinvera7.jobsCompleted,
            consistencyMultiplier: kevinvera7.consistencyMultiplier,
            averageRating: kevinvera7.averageRating,
          });
        } else {
          console.log('❌ kevinvera7 NOT found in first', coaches.length, 'coaches');
          console.log('📋 All coach usernames:', coaches.map((c: any) => c.username).sort());
        }
        
        const sampleCoach = coaches[0];
        console.log('🔍 Sample coach XP fields:', {
          username: sampleCoach.username,
          subscriptionTier: sampleCoach.subscriptionTier,
          longevityPlatformYears: sampleCoach.longevityPlatformYears,
          careerYears: sampleCoach.careerYears,
        });
      }
    } catch (error) {
      console.error('Error fetching coaches from Data Connect:', error);
      
      // Return fallback response
      return NextResponse.json({ 
        coaches: [],
        count: 0,
        page: 1,
        limit: 20,
        hasMore: false,
        error: 'Coach service temporarily unavailable'
      });
    }

    // Apply client-side filtering for complex searches
    let filteredCoaches = coaches;
    if (searchTermParam || organizationParam || ageGroupParam) {
      filteredCoaches = filterCoaches(
        coaches,
        searchTermParam || undefined,
        organizationParam || undefined,
        ageGroupParam || undefined
      );
    }

    // Convert to API response format and calculate XP
    let formattedCoaches: CoachData[] = filteredCoaches.map((coach: any) => {
      // Calculate XP for each coach
      let xp = 0;
      if (coach.userId && coach.username) {
        try {
          const subscription_tier = coach.subscriptionTier ?? 0;
          const longevity_platform_years = coach.longevityPlatformYears ?? 0;
          const career_years = coach.careerYears ?? 0;
          const courses_created = coach.coursesCreated ?? 0;
          const jobs_completed = coach.jobsCompleted ?? 0;
          const review_score = coach.averageRating ?? 0;
          const consistency_multiplier = coach.consistencyMultiplier ?? 1.0;

          const inputs: XPCalculationInputs = {
            subscription_tier: Number(subscription_tier) || 0,
            longevity_platform_years: Number(longevity_platform_years) || 0,
            career_years: Number(career_years) || 0,
            courses_created: Number(courses_created) || 0,
            jobs_completed: Number(jobs_completed) || 0,
            review_score: Number(review_score) || 0,
            consistency_multiplier: Number(consistency_multiplier) || 1.0,
          };

          const xpResult = calculateCoachXP(inputs);
          xp = xpResult.total_xp;
          
          // Debug logging for kevinvera7
          if (coach.username === 'kevinvera7' || coach.username?.toLowerCase() === 'kevinvera7') {
            console.log('🔍 kevinvera7 XP calculation:', {
              username: coach.username,
              subscription_tier: inputs.subscription_tier,
              longevity_platform_years: inputs.longevity_platform_years,
              career_years: inputs.career_years,
              courses_created: inputs.courses_created,
              jobs_completed: inputs.jobs_completed,
              review_score: inputs.review_score,
              consistency_multiplier: inputs.consistency_multiplier,
              calculated_xp: xp,
            });
          }
        } catch (error) {
          console.error(`Error calculating XP for coach ${coach.username || coach.id}:`, error);
          xp = 0;
        }
      }

      return {
        id: coach.id,
        displayName: coach.displayName,
        email: coach.email,
        bio: coach.bio,
        specialties: coach.specialties || [],
        sports: coach.sports || [],
        hourlyRate: coach.hourlyRate,
        organization: coach.organization,
        role: coach.role,
        gender: coach.gender,
        ageGroup: coach.ageGroup || [],
        sourceUrl: coach.sourceUrl,
        userId: coach.userId,
        username: coach.username,
        averageRating: coach.averageRating,
        totalReviews: coach.totalReviews,
        profileImage: coach.profileImage,
        isVerified: coach.isVerified,
        hasActiveServices: coach.hasActiveServices,
        createdAt: coach.createdAt,
        updatedAt: coach.updatedAt,
        xp,
      };
    });

    // Sort by XP if requested (highest first)
    if (sortByXP) {
      formattedCoaches.sort((a, b) => {
        const xpA = a.xp || 0;
        const xpB = b.xp || 0;
        return xpB - xpA; // Highest first
      });
      
      // Debug: Log top 5 coaches by XP
      console.log('🏆 Top 5 coaches by XP:', formattedCoaches.slice(0, 5).map(c => ({
        username: c.username,
        displayName: c.displayName,
        xp: c.xp
      })));
      
      // Limit to requested number after sorting
      formattedCoaches = formattedCoaches.slice(0, limitParam);
    }

    const count = formattedCoaches.length;
    const hasMore = formattedCoaches.length === limitParam && coaches.length >= (fetchLimit || 0);

    return NextResponse.json({
      coaches: formattedCoaches,
      count,
      page: pageParam,
      limit: limitParam,
      hasMore
    });

  } catch (error) {
    console.error('Error fetching coaches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new coach profile in Firebase Data Connect
export async function POST(request: NextRequest) {
  try {
    // Verify Firebase token
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      console.error('❌ No auth token provided');
      return NextResponse.json({ error: 'No authentication token' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) {
      console.error('❌ Invalid token');
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    const body = await request.json();
    
    console.log('📝 Creating coach profile with data:', {
      userId,
      userEmail,
      username: body.username,
      displayName: body.displayName
    });
    
    // Generate coach ID and username
    const coachId = body.id || `coach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const username = (body.username || body.displayName?.toLowerCase().replace(/\s+/g, '_') || coachId).toLowerCase();

    // Validate required fields
    if (!body.displayName) {
      console.error('❌ Display name is missing');
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    if (!username) {
      console.error('❌ Username is missing');
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    console.log('✅ Creating coach in Postgres:', {
      id: coachId,
      username: username,
      userId: userId,
      displayName: body.displayName,
      email: userEmail || body.email || ''
    });

    // Ensure a coach with this id doesn't already exist
    const existing = await adminDb.collection('coaches').doc(coachId).get();
    if (existing.exists) {
      throw new Error('Coach profile already exists');
    }

    // Create coach in Postgres
    const nowIso = new Date().toISOString();
    await adminDb.collection('coaches').doc(coachId).set({
      id: coachId,
      username: username,
      userId: userId,
      displayName: body.displayName,
      email: userEmail || body.email || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    console.log('✅ Coach created successfully in Postgres:', coachId);

    return NextResponse.json({ 
      success: true,
      coachId: coachId,
      username: username,
      message: 'Coach profile created successfully'
    });

  } catch (error: any) {
    console.error('❌ Error creating coach profile:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Check if coach already exists
    if (error.message?.includes('ALREADY_EXISTS') || error.message?.includes('already exists') || error.message?.includes('unique constraint')) {
      return NextResponse.json({ 
        error: 'Coach profile already exists',
        message: 'A coach profile already exists for this user'
      }, { status: 409 });
    }

    return NextResponse.json({ 
      error: 'Failed to create coach profile',
      details: error.message || 'Unknown error',
      fullError: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    }, { status: 500 });
  }
}
