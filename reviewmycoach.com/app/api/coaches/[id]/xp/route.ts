import { NextRequest, NextResponse } from 'next/server';
import { sqlQuery } from '../../../../lib/pgdb';
import {
  calculateCoachXP,
  formatXPBreakdown,
  type XPCalculationInputs,
  type XPResult,
} from '../../../../lib/xp-calculator';

/**
 * GET /api/coaches/[id]/xp
 * 
 * Calculate and return XP score for a coach
 * 
 * Query parameters:
 * - id: Coach ID (username or userId)
 * - userId: Optional, if provided, searches by userId instead of id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');

    let coachData;

    // Fetch coach from Postgres (by username, which is the coachId)
    const username = coachId.toLowerCase();
    const coachResult = await sqlQuery(
      `SELECT id, data FROM coaches WHERE id = $1 OR LOWER(data->>'username') = $1 LIMIT 1`,
      [username]
    );

    if (coachResult.rows.length === 0) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const coach = { id: coachResult.rows[0].id, ...coachResult.rows[0].data };

    // Map Data Connect fields to the format expected by XP calculator
    coachData = {
      userId: coach.userId,
      username: coach.username,
      displayName: coach.displayName,
      email: coach.email,
      subscriptionTier: coach.subscriptionTier || 0,
      longevityPlatformYears: coach.longevityPlatformYears || 0,
      careerYears: coach.careerYears || 0,
      coursesCreated: coach.coursesCreated || 0,
      jobsCompleted: coach.jobsCompleted || 0,
      averageRating: coach.averageRating || 0,
      totalReviews: coach.totalReviews || 0,
      consistencyMultiplier: coach.consistencyMultiplier || 1.0,
      createdAt: coach.createdAt ? new Date(coach.createdAt) : new Date(),
    };

    // Use XP fields directly from Data Connect (they're already stored there)
    const subscription_tier = coachData.subscriptionTier;
    const longevity_platform_years = coachData.longevityPlatformYears;
    const career_years = coachData.careerYears;
    const courses_created = coachData.coursesCreated;
    const jobs_completed = coachData.jobsCompleted;
    const review_score = coachData.averageRating;
    const consistency_multiplier = coachData.consistencyMultiplier;

    // Prepare inputs for XP calculation
    const inputs: XPCalculationInputs = {
      subscription_tier,
      longevity_platform_years,
      career_years,
      courses_created,
      jobs_completed,
      review_score,
      consistency_multiplier,
    };

    // Calculate XP
    const xpResult: XPResult = calculateCoachXP(inputs);

    // Format breakdown for display
    const breakdownText = formatXPBreakdown(xpResult.breakdown);

    // Auto-unlock tier cards if XP qualifies (fire and forget)
    if (xpResult.total_xp > 0 && userIdParam && coachData.username) {
      // Trigger tier card unlock in background (don't await)
      fetch(`${request.nextUrl.origin}/api/cards/tier/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userIdParam,
          username: coachData.username,
          totalXP: xpResult.total_xp
        })
      }).catch(err => {
        // Log error but don't fail the XP calculation
        console.error('Failed to auto-unlock tier cards:', err);
      });
    }

    // Return result
    return NextResponse.json({
      coachId: userIdParam ? coachData.userId : coachId,
      coachUsername: coachData.username || coachId,
      coachName: coachData.displayName || 'Unknown Coach',
      total_xp: xpResult.total_xp,
      xp: xpResult.total_xp,
      tier: xpResult.tier,
      tier_number: xpResult.tier_number,
      breakdown: xpResult.breakdown,
      breakdown_text: breakdownText,
      inputs: {
        subscription_tier,
        longevity_platform_years: Math.round(longevity_platform_years * 100) / 100,
        career_years,
        courses_created,
        jobs_completed,
        review_score: Math.round(review_score * 100) / 100,
        consistency_multiplier: Math.round(consistency_multiplier * 100) / 100,
      },
    });

  } catch (error) {
    console.error('Error calculating coach XP:', error);
    return NextResponse.json(
      { error: 'Failed to calculate coach XP', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

