import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicCoaches } from '../../../lib/firebase-dataconnect-server';
import { adminDb } from '../../../lib/firebase-admin-server';
import { calculateCoachXP, type XPCalculationInputs } from '../../../lib/xp-calculator';

const BATCH_SIZE = 100; // Process 100 coaches at a time
const CONCURRENT_UPDATES = 10; // Update 10 coaches in parallel

/**
 * Process a batch of coaches in parallel
 */
async function processBatch(coaches: any[]): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  // Process in chunks of CONCURRENT_UPDATES
  for (let i = 0; i < coaches.length; i += CONCURRENT_UPDATES) {
    const chunk = coaches.slice(i, i + CONCURRENT_UPDATES);

    const results = await Promise.allSettled(
      chunk.map(async (coach) => {
        const inputs: XPCalculationInputs = {
          subscription_tier: Number(coach.subscriptionTier) || 0,
          longevity_platform_years: Number(coach.longevityPlatformYears) || 0,
          career_years: Number(coach.careerYears) || 0,
          courses_created: Number(coach.coursesCreated) || 0,
          jobs_completed: Number(coach.jobsCompleted) || 0,
          review_score: Number(coach.averageRating) || 0,
          consistency_multiplier: Number(coach.consistencyMultiplier) || 1.0,
        };

        const xpResult = calculateCoachXP(inputs);

        await adminDb.collection('coaches').doc(coach.id).update({
          totalXp: xpResult.total_xp,
          updatedAt: new Date().toISOString(),
        });

        return { id: coach.id, xp: xpResult.total_xp };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        updated++;
      } else {
        errors++;
      }
    }
  }

  return { updated, errors };
}

/**
 * POST - Recalculate XP for coaches in batches
 *
 * Query params:
 * - offset: Starting position (default: 0)
 * - limit: Max coaches to process in this request (default: 1000, max: 5000)
 * - dryRun: If true, calculate but don't save (default: false)
 *
 * For 100k+ coaches, call this endpoint multiple times:
 * - First call: /api/coaches/recalculate-xp?offset=0&limit=5000
 * - Second call: /api/coaches/recalculate-xp?offset=5000&limit=5000
 * - etc.
 *
 * Or use the script endpoint to process all automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000', 10), 5000);
    const dryRun = searchParams.get('dryRun') === 'true';

    console.log(`🔄 Starting XP recalculation: offset=${offset}, limit=${limit}, dryRun=${dryRun}`);

    const startTime = Date.now();
    let totalUpdated = 0;
    let totalErrors = 0;
    let processedCount = 0;
    let currentOffset = offset;

    // Process in batches
    while (processedCount < limit) {
      const batchLimit = Math.min(BATCH_SIZE, limit - processedCount);

      // Fetch batch of coaches (fetchPublicCoaches paginates by page, not raw offset)
      const page = Math.floor(currentOffset / batchLimit) + 1;
      const coaches: any[] = await fetchPublicCoaches({
        limit: batchLimit,
        page,
      });

      if (coaches.length === 0) {
        console.log('No more coaches to process');
        break;
      }

      console.log(`📊 Processing batch: offset=${currentOffset}, count=${coaches.length}`);

      if (!dryRun) {
        const { updated, errors } = await processBatch(coaches);
        totalUpdated += updated;
        totalErrors += errors;
      } else {
        // Dry run - just calculate without saving
        for (const coach of coaches) {
          const inputs: XPCalculationInputs = {
            subscription_tier: Number(coach.subscriptionTier) || 0,
            longevity_platform_years: Number(coach.longevityPlatformYears) || 0,
            career_years: Number(coach.careerYears) || 0,
            courses_created: Number(coach.coursesCreated) || 0,
            jobs_completed: Number(coach.jobsCompleted) || 0,
            review_score: Number(coach.averageRating) || 0,
            consistency_multiplier: Number(coach.consistencyMultiplier) || 1.0,
          };
          calculateCoachXP(inputs);
          totalUpdated++;
        }
      }

      processedCount += coaches.length;
      currentOffset += coaches.length;

      // If we got fewer coaches than requested, we've reached the end
      if (coaches.length < batchLimit) {
        break;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Completed: ${totalUpdated} updated, ${totalErrors} errors in ${duration}s`);

    return NextResponse.json({
      success: true,
      dryRun,
      startOffset: offset,
      endOffset: currentOffset,
      processed: processedCount,
      updated: totalUpdated,
      errors: totalErrors,
      durationSeconds: parseFloat(duration),
      nextOffset: currentOffset, // Use this for the next request
      hasMore: processedCount === limit, // If we hit the limit, there might be more
    });

  } catch (error) {
    console.error('Error recalculating XP:', error);
    return NextResponse.json({
      error: 'Failed to recalculate XP',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET - Get count of coaches and estimate processing time
 */
export async function GET(request: NextRequest) {
  try {
    // Fetch a small batch to verify connectivity
    await fetchPublicCoaches({ limit: 1, page: 1 });

    return NextResponse.json({
      message: 'XP Recalculation Endpoint',
      usage: {
        singleBatch: 'POST /api/coaches/recalculate-xp?offset=0&limit=1000',
        dryRun: 'POST /api/coaches/recalculate-xp?offset=0&limit=100&dryRun=true',
        fullProcess: 'Use the script at /api/coaches/recalculate-xp/all',
      },
      recommendations: {
        batchSize: '1000-5000 coaches per request',
        forLargeDatasets: 'Use offset pagination to process in multiple requests',
        example: [
          'POST /api/coaches/recalculate-xp?offset=0&limit=5000',
          'POST /api/coaches/recalculate-xp?offset=5000&limit=5000',
          'POST /api/coaches/recalculate-xp?offset=10000&limit=5000',
          '... continue until hasMore is false',
        ],
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get info' }, { status: 500 });
  }
}
