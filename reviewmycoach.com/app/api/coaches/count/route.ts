import { NextRequest, NextResponse } from 'next/server';
import { sqlQuery } from '../../../lib/pgdb';

// Cache the total count (refresh every 5 minutes)
let cachedCount: { total: number; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/coaches/count
 * Returns the total number of coaches in the database
 * This is cached to avoid hitting the database on every request
 */
export async function GET(request: NextRequest) {
  try {
    // Check cache first
    if (cachedCount && Date.now() - cachedCount.timestamp < CACHE_DURATION) {
      return NextResponse.json({ 
        total: cachedCount.total, 
        cached: true,
        lastUpdated: new Date(cachedCount.timestamp).toISOString()
      });
    }

    // Query Postgres for the total number of coaches
    const result = await sqlQuery('SELECT COUNT(*)::int AS n FROM coaches');
    const total = result.rows[0]?.n ?? 0;

    // Update cache
    cachedCount = {
      total,
      timestamp: Date.now()
    };

    const response = NextResponse.json({ 
      total, 
      cached: false,
      lastUpdated: new Date().toISOString()
    });

    // Add cache headers (5 minutes)
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');

    return response;

  } catch (error) {
    console.error('Error counting coaches:', error);
    
    // If we have a cached count, return it even if stale
    if (cachedCount) {
      return NextResponse.json({ 
        total: cachedCount.total, 
        cached: true,
        stale: true,
        error: 'Count query failed, using cached value',
        lastUpdated: new Date(cachedCount.timestamp).toISOString()
      });
    }

    return NextResponse.json(
      { error: 'Failed to count coaches', total: 0 },
      { status: 500 }
    );
  }
}

