import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from '../../../../lib/firebase-admin-server';
import { TIER_CARDS, getEligibleTierCards } from '../../../../lib/xp-service';

/**
 * Fetch a coach's cards (user_cards) by coach username.
 */
async function fetchCoachCards(coachUsername: string): Promise<any[]> {
  const snapshot = await adminDb
    .collection('user_cards')
    .where('coachUsername', '==', coachUsername)
    .get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * GET /api/cards/tier/direct?userId=xxx&username=xxx&xp=14250
 * Fetch user's unlocked tier cards from database
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');
    const xpParam = searchParams.get('xp');
    const totalXP = parseInt(xpParam || '0', 10);

    if (!userId || !username) {
      return NextResponse.json(
        { error: 'userId and username are required' },
        { status: 400 }
      );
    }

    // Use centralized tier cards from xp-service
    const tierCards = TIER_CARDS;

    // Get tier card IDs for filtering
    const tierCardIds = new Set(tierCards.map(tc => tc.id));

    // Fetch user's tier cards from Firebase Data Connect using PUBLIC query
    // Note: GetCoachCards doesn't return cardType, so we filter by cardId matching tier card IDs
    let userTierCards: any[] = [];
    try {
      console.log('🔍 Fetching cards for username:', username);
      const allUserCards = await fetchCoachCards(username);
      console.log('🔍 GetCoachCards result:', JSON.stringify(allUserCards, null, 2));
      console.log('🔍 All user cards from Data Connect:', allUserCards.length, allUserCards.map((c: any) => ({ cardId: c.cardId, cardName: c.cardName })));
      console.log('🔍 Tier card IDs to match:', Array.from(tierCardIds));
      
      userTierCards = allUserCards
        .filter((card: any) => tierCardIds.has(card.cardId)) // Only include tier cards
        .map((card: any) => ({
          id: card.id,
          userId: userId,
          coachUsername: username,
          cardId: card.cardId,
          cardType: 'tier',
          cardName: card.cardName,
          cardImageUrl: card.cardImageUrl,
          isActive: card.isActive,
          unlockedAt: card.purchasedAt || null, // GetCoachCards returns purchasedAt (used for both purchased and unlocked)
          createdAt: null, // GetCoachCards doesn't return createdAt
        }));
      
      console.log('✅ Filtered tier cards:', userTierCards.length, userTierCards.map((c: any) => ({ cardId: c.cardId, cardName: c.cardName })));
    } catch (error) {
      console.error('❌ Error fetching user cards from Data Connect:', error);
      // Continue with empty array - cards will be unlocked if eligible
    }

    const ownedCardIds = new Set(userTierCards.map(c => c.cardId));
    console.log('📊 Owned card IDs:', Array.from(ownedCardIds));

    // Categorize all tier cards
    const unlockedCards = tierCards
      .filter(card => ownedCardIds.has(card.id))
      .map(card => {
        const userCard = userTierCards.find(uc => uc.cardId === card.id);
        return {
          id: userCard?.id || card.id,
          cardId: card.id,
          cardType: 'tier' as const,
          tierNumber: card.tierNumber,
          cardName: card.tierName,
          requiredXp: card.requiredXp,
          cardImageUrl: card.imageUrl,
          description: card.description,
          isActive: userCard?.isActive || false,
          unlockedAt: userCard?.unlockedAt || null,
        };
      });
    
    console.log('📊 Unlocked cards to return:', unlockedCards.length, unlockedCards.map(c => ({ cardId: c.cardId, cardName: c.cardName })));

    const eligibleToUnlock = tierCards.filter(
      card => !ownedCardIds.has(card.id) && card.requiredXp <= totalXP
    );

    const lockedCards = tierCards
      .filter(card => !ownedCardIds.has(card.id) && card.requiredXp > totalXP)
      .map(card => ({
        id: card.id,
        tierNumber: card.tierNumber,
        tierName: card.tierName,
        requiredXp: card.requiredXp,
        imageUrl: card.imageUrl,
        description: card.description,
      }));

    return NextResponse.json({
      success: true,
      totalXP,
      unlockedCards,
      eligibleToUnlock,
      lockedCards,
      tierCards: tierCards.map(card => ({
        ...card,
        isUnlocked: ownedCardIds.has(card.id),
      })),
    });
  } catch (error) {
    console.error('Error fetching tier cards:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch tier cards',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cards/tier/direct
 * Unlock eligible tier cards for a user and store them in the database
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, username, totalXP } = await request.json();

    if (!userId || !username || totalXP === undefined) {
      return NextResponse.json(
        { error: 'userId, username, and totalXP are required' },
        { status: 400 }
      );
    }

    // Use centralized tier cards and eligibility check from xp-service
    const tierCards = TIER_CARDS;
    const eligibleCards = getEligibleTierCards(totalXP);

    if (eligibleCards.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tier cards available yet',
        unlockedCards: [],
        totalXP,
      });
    }

    // Get user's currently owned tier cards from Firebase Data Connect using PUBLIC query
    // Filter by cardId matching tier card IDs since GetCoachCards doesn't return cardType
    const tierCardIdsSet = new Set(tierCards.map(tc => tc.id));
    let ownedCardIds = new Set<string>();
    try {
      const allUserCards = await fetchCoachCards(username);
      const ownedCards = allUserCards
        .filter((card: any) => tierCardIdsSet.has(card.cardId)) // Only tier cards
        .map((card: any) => card.cardId);
      ownedCardIds = new Set(ownedCards);
    } catch (error) {
      console.error('Error fetching owned cards:', error);
      // Continue with empty set - will try to unlock cards
    }

    // Find cards that should be unlocked (eligible but not yet owned)
    const cardsToUnlock = eligibleCards.filter(card => !ownedCardIds.has(card.id));

    if (cardsToUnlock.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All eligible tier cards already unlocked!',
        unlockedCards: [],
        totalXP,
      });
    }

    // Insert new cards into Firebase Data Connect
    const newlyUnlockedCards = [];
    for (const card of cardsToUnlock) {
      try {
        const userCardId = uuidv4();
        const nowIso = new Date().toISOString();
        await adminDb.collection('user_cards').doc(userCardId).set({
          id: userCardId,
          userId: userId,
          coachUsername: username,
          cardId: card.id,
          cardType: 'tier',
          cardName: card.tierName,
          cardImageUrl: card.imageUrl,
          isActive: false,
          unlockedAt: nowIso,
          purchasedAt: nowIso,
          createdAt: nowIso,
        });

        newlyUnlockedCards.push({
          id: card.id,
          tierName: card.tierName,
          tierNumber: card.tierNumber,
          imageUrl: card.imageUrl,
        });
        
        console.log(`✅ Unlocked tier card: ${card.tierName} for user ${username}`);
      } catch (error: any) {
        // Check if it's a duplicate/conflict error (card already exists)
        if (error?.message?.includes('already exists') || error?.message?.includes('unique constraint') || error?.message?.includes('duplicate')) {
          console.log(`ℹ️ Card ${card.id} already unlocked for user ${username}`);
        } else {
          console.warn(`⚠️ Error unlocking card ${card.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: newlyUnlockedCards.length > 0 
        ? `🎉 Unlocked ${newlyUnlockedCards.length} new tier card(s)!` 
        : 'All eligible cards already unlocked',
      unlockedCards: newlyUnlockedCards,
      totalXP,
      eligibleCount: eligibleCards.length,
    });
  } catch (error) {
    console.error('Error unlocking tier cards:', error);
    return NextResponse.json(
      {
        error: 'Failed to unlock tier cards',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
