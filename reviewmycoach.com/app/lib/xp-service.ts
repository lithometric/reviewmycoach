/**
 * XP Service - Unified XP calculation, storage, and card unlock logic
 *
 * This service provides a single source of truth for XP management:
 * 1. Calculate XP from coach profile fields
 * 2. Store totalXp in coach record
 * 3. Auto-unlock eligible tier cards
 */

import {
  calculateCoachXP,
  getCoachTier,
  type XPCalculationInputs,
} from './xp-calculator';

// Tier card definitions - single source of truth
export const TIER_CARDS = [
  { id: 'tier-1', tierNumber: 1, tierName: 'Rookie Coach', requiredXp: 0,
    imageUrl: '/cards/tier-1.png', description: 'Starting tier for all coaches' },
  { id: 'tier-2', tierNumber: 2, tierName: 'Professional Coach', requiredXp: 3000,
    imageUrl: '/cards/tier-2.png', description: 'Earned at 3,000 XP' },
  { id: 'tier-3', tierNumber: 3, tierName: 'Elite Coach', requiredXp: 7000,
    imageUrl: '/cards/tier-3.png', description: 'Earned at 7,000 XP' },
  { id: 'tier-4', tierNumber: 4, tierName: 'Veteran Coach', requiredXp: 12000,
    imageUrl: '/cards/tier-4.png', description: 'Earned at 12,000 XP' },
  { id: 'tier-5', tierNumber: 5, tierName: 'Legendary Coach', requiredXp: 20000,
    imageUrl: '/cards/tier-5.png', description: 'Earned at 20,000 XP' },
] as const;

export type TierCard = typeof TIER_CARDS[number];

/**
 * Get eligible tier cards based on XP
 */
export function getEligibleTierCards(totalXp: number): TierCard[] {
  return TIER_CARDS.filter(card => totalXp >= card.requiredXp);
}

/**
 * Get the highest tier card a coach qualifies for
 */
export function getHighestTierCard(totalXp: number): TierCard {
  const eligible = getEligibleTierCards(totalXp);
  return eligible[eligible.length - 1] || TIER_CARDS[0];
}

/**
 * Get next tier card to unlock (if any)
 */
export function getNextTierCard(totalXp: number): TierCard | null {
  const nextCard = TIER_CARDS.find(card => card.requiredXp > totalXp);
  return nextCard || null;
}

/**
 * Calculate XP progress to next tier
 */
export function getXpProgress(totalXp: number): {
  currentTier: TierCard;
  nextTier: TierCard | null;
  xpToNext: number;
  progressPercent: number;
} {
  const currentTier = getHighestTierCard(totalXp);
  const nextTier = getNextTierCard(totalXp);

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      xpToNext: 0,
      progressPercent: 100,
    };
  }

  const xpToNext = nextTier.requiredXp - totalXp;
  const tierRange = nextTier.requiredXp - currentTier.requiredXp;
  const xpInTier = totalXp - currentTier.requiredXp;
  const progressPercent = Math.min(100, Math.round((xpInTier / tierRange) * 100));

  return {
    currentTier,
    nextTier,
    xpToNext,
    progressPercent,
  };
}

/**
 * Calculate XP from coach profile data
 */
export function calculateXpFromCoach(coach: {
  subscriptionTier?: number | null;
  longevityPlatformYears?: number | null;
  careerYears?: number | null;
  coursesCreated?: number | null;
  jobsCompleted?: number | null;
  averageRating?: number | null;
  consistencyMultiplier?: number | null;
}): number {
  const inputs: XPCalculationInputs = {
    subscription_tier: Number(coach.subscriptionTier) || 0,
    longevity_platform_years: Number(coach.longevityPlatformYears) || 0,
    career_years: Number(coach.careerYears) || 0,
    courses_created: Number(coach.coursesCreated) || 0,
    jobs_completed: Number(coach.jobsCompleted) || 0,
    review_score: Number(coach.averageRating) || 0,
    consistency_multiplier: Number(coach.consistencyMultiplier) || 1.0,
  };

  const result = calculateCoachXP(inputs);
  return result.total_xp;
}

/**
 * XP-affecting fields that should trigger recalculation when changed
 */
export const XP_AFFECTING_FIELDS = [
  'subscriptionTier',
  'longevityPlatformYears',
  'careerYears',
  'coursesCreated',
  'jobsCompleted',
  'averageRating',
  'consistencyMultiplier',
] as const;

/**
 * Check if any XP-affecting fields are being updated
 */
export function hasXpAffectingChanges(updates: Record<string, any>): boolean {
  return XP_AFFECTING_FIELDS.some(field => field in updates);
}
