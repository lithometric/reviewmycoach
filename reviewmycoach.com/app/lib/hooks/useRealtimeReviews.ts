import { useState, useEffect, useCallback } from 'react';

interface Review {
  id: string;
  studentId: string;
  studentName: string;
  rating: number;
  reviewText: string;
  createdAt: string | null;
  sport?: string;
}

interface RatingStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: { [key: number]: number };
}

// Compute rating stats client-side from the fetched reviews.
function calculateRatingStats(reviews: Review[]): RatingStats {
  const ratingDistribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (const review of reviews) {
    const rounded = Math.round(review.rating);
    if (ratingDistribution[rounded] !== undefined) {
      ratingDistribution[rounded] += 1;
    }
    sum += review.rating;
  }

  const totalReviews = reviews.length;
  return {
    averageRating: totalReviews > 0 ? sum / totalReviews : 0,
    totalReviews,
    ratingDistribution,
  };
}

interface UseRealtimeReviewsReturn {
  reviews: Review[];
  ratingStats: RatingStats;
  loading: boolean;
  error: string | null;
  refreshReviews: () => void;
}

export function useRealtimeReviews(coachId: string): UseRealtimeReviewsReturn {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ratingStats, setRatingStats] = useState<RatingStats>({
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load reviews from the reviews API
  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/coaches/${coachId}/reviews?limit=100`);
      if (!response.ok) {
        throw new Error(`Failed to fetch reviews (${response.status})`);
      }
      const data = await response.json();
      const reviewsData: any[] = data.reviews || [];

      // Convert to Review format
      const formattedReviews: Review[] = reviewsData.map((review: any) => ({
        id: review.id,
        studentId: review.studentId || review.userId || '',
        studentName: review.studentName,
        rating: review.rating,
        reviewText: review.reviewText,
        createdAt: review.createdAt || null,
        sport: review.sport,
      }));

      // Calculate new rating stats
      const newStats = calculateRatingStats(formattedReviews);

      // Update state
      setReviews(formattedReviews);
      setRatingStats(newStats);

      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError('Failed to load reviews');
      setLoading(false);
    }
  }, [coachId]);

  // Load reviews on mount and set up polling for updates
  useEffect(() => {
    if (!coachId) {
      setError('Coach ID is required');
      setLoading(false);
      return;
    }

    // Initial load
    loadReviews();

    // Poll for updates every 30 seconds (Data Connect doesn't have real-time subscriptions)
    const interval = setInterval(() => {
      loadReviews();
    }, 30000);

    return () => clearInterval(interval);
  }, [coachId, loadReviews]);

  // Manual refresh function
  const refreshReviews = useCallback(() => {
    loadReviews();
  }, [loadReviews]);

  return {
    reviews,
    ratingStats,
    loading,
    error,
    refreshReviews
  };
}

// Hook for real-time coach profile updates
interface CoachProfile {
  id: string;
  username?: string;
  userId: string;
  displayName: string;
  email?: string;
  phoneNumber?: string;
  bio: string;
  sports: string[];
  specialties: string[];
  certifications: string[];
  location: string;
  organization?: string;
  role?: string;
  gender?: string;
  ageGroup?: string[];
  availability: string[];
  languages: string[];
  website?: string;
  socialMedia?: {
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  hourlyRate: number;
  experience: number;
  averageRating: number;
  totalReviews: number;
  profileImage?: string;
  isVerified: boolean;
  isClaimed?: boolean;
  sourceUrl?: string;
  subscriptionStatus?: string;
  subscriptionTier?: number;
  longevityPlatformYears?: number;
  careerYears?: number;
  coursesCreated?: number;
  jobsCompleted?: number;
  consistencyMultiplier?: number;
  totalXp?: number;
  activeCardId?: string;
  activeCardImageUrl?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export function useRealtimeCoach(coachId: string) {
  const [coach, setCoach] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!coachId) {
      setError('Coach ID is required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch coach from Data Connect (poll every 30 seconds)
    const loadCoach = async () => {
      try {
        // For now, we'll fetch from the API which uses Data Connect
        const response = await fetch(`/api/coaches/${coachId}`);
        if (response.ok) {
          const data = await response.json();
          setCoach(data);
        } else {
          setError('Coach not found');
        }
        setLoading(false);
      } catch (err) {
        console.error('Error loading coach:', err);
        setError('Failed to load coach profile');
        setLoading(false);
      }
    };

    loadCoach();

    // Poll for updates every 30 seconds
    const interval = setInterval(loadCoach, 30000);

    return () => clearInterval(interval);
  }, [coachId]);

  return { coach, loading, error };
}
