import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase-admin-server';
import { sqlQuery } from '../../../../lib/pgdb';
import {
  calculateXpFromCoach,
  getEligibleTierCards,
  TIER_CARDS,
} from '../../../../lib/xp-service';

/**
 * POST - Recalculate XP for a coach and auto-unlock eligible tier cards
 *
 * This should be called whenever XP-affecting fields change:
 * - subscriptionTier, longevityPlatformYears, careerYears
 * - coursesCreated, jobsCompleted, averageRating, consistencyMultiplier
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
    const body = await request.json().catch(() => ({}));

    // Option 1: Pass coach data directly (faster, no extra fetch)
    // Option 2: Pass userId/username to fetch fresh data
    const { coach: coachData, userId, username } = body;

    let coach = coachData;
    let coachUsername = username;
    let coachUserId = userId;

    // If coach data not provided, fetch it
    if (!coach && username) {
      const result = await sqlQuery(
        `SELECT id, data FROM coaches WHERE id = $1 OR data->>'username' = $1 LIMIT 1`,
        [username]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
      }
      coach = { id: result.rows[0].id, ...result.rows[0].data };
      coachUsername = coach.username;
      coachUserId = coach.userId;
    }

    if (!coach) {
      return NextResponse.json(
        { error: 'Coach data or username required' },
        { status: 400 }
      );
    }

    // Calculate XP
    const totalXp = calculateXpFromCoach(coach);
    const previousXp = coach.totalXp || 0;

    // Update totalXp in database
    await adminDb.collection('coaches').doc(coachId).update({
      totalXp: totalXp,
      updatedAt: new Date().toISOString(),
    });

    // Get eligible tier cards
    const eligibleCards = getEligibleTierCards(totalXp);

    // Get user's existing tier cards
    let existingCardIds = new Set<string>();
    if (coachUserId) {
      try {
        const userCardsSnapshot = await adminDb
          .collection('user_cards')
          .where('userId', '==', coachUserId)
          .get();
        const userCards = userCardsSnapshot.docs.map((d) => d.data());
        existingCardIds = new Set(
          userCards
            .filter((c: any) => c.cardType === 'tier')
            .map((c: any) => c.cardId)
        );
      } catch (err) {
        console.warn('Could not fetch user cards:', err);
      }
    }

    // Unlock new eligible cards
    const newlyUnlocked: typeof TIER_CARDS[number][] = [];

    for (const card of eligibleCards) {
      if (!existingCardIds.has(card.id) && coachUserId && coachUsername) {
        try {
          const userCardId = `uc_${coachUserId}_${card.id}_${Date.now()}`;
          const nowIso = new Date().toISOString();
          await adminDb.collection('user_cards').doc(userCardId).set({
            id: userCardId,
            userId: coachUserId,
            coachUsername: coachUsername,
            cardId: card.id,
            cardType: 'tier',
            cardName: card.tierName,
            cardImageUrl: card.imageUrl,
            isActive: false,
            unlockedAt: nowIso,
            purchasedAt: nowIso,
            createdAt: nowIso,
          });
          newlyUnlocked.push(card);
          console.log(`✅ Unlocked ${card.tierName} for ${coachUsername}`);
        } catch (err) {
          console.error(`Failed to unlock ${card.tierName}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      coachId,
      previousXp,
      totalXp,
      xpGained: totalXp - previousXp,
      eligibleCards: eligibleCards.map((c) => c.tierName),
      newlyUnlocked: newlyUnlocked.map((c) => ({
        id: c.id,
        name: c.tierName,
        imageUrl: c.imageUrl,
      })),
    });
  } catch (error) {
    console.error('Error updating XP:', error);
    return NextResponse.json(
      { error: 'Failed to update XP' },
      { status: 500 }
    );
  }
}
