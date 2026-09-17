'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MessagingModal from '../../components/MessagingModal';

interface Review {
  id: string;
  studentId: string;
  studentName: string;
  rating: number;
  reviewText: string;
  createdAt?: { toDate: () => Date };
}

interface Class {
  id: string;
  title: string;
  sport: string;
  participants: number;
  maxParticipants: number;
  schedule: string;
  price: number;
}

interface CoachProfile {
  id: string;
  username?: string;
  displayName: string;
  bio: string;
  sports: string[];
  experience: number;
  certifications: string[];
  hourlyRate: number;
  averageRating: number;
  totalReviews: number;
  profileImage?: string;
  isVerified: boolean;
  organization?: string;
  role?: string;
  gender?: string;
  ageGroup?: string[];
  sourceUrl?: string;
}

interface Conversation {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt?: string;
  unreadCount?: Record<string, number>;
}

export default function CoachDashboard() {
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState<string>('');
  const router = useRouter();
  
  // Use Firebase Auth
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchCoachData(user.uid);
        fetchConversations(user.uid);
      } else {
        router.push('/signin?redirect=/dashboard/coach');
      }
      setLoading(false);
    }
  }, [user, authLoading, router]);

  const fetchCoachData = async (userId: string) => {
    setStatsLoading(true);
    console.log('🔍 Fetching coach data for user:', userId);
    
    try {
      // First, get the user's username from their user profile via the API
      const userRes = await fetch(`/api/auth/user-role?userId=${encodeURIComponent(userId)}`);
      let username = null;

      console.log('📄 User document found:', userRes.ok);

      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData.username;
        console.log('👤 Username from user profile:', username);

        if (username) {
          console.log('🔍 Fetching coach profile from Data Connect for username:', username);
          
          // Fetch coach profile from Data Connect via API
          try {
            const response = await fetch(`/api/coaches/by-username/${username.toLowerCase()}`);
            console.log('📡 API response status:', response.status);
            
            if (response.ok) {
              const data = await response.json();
              console.log('📦 Coach data received:', data);
              
              if (data.coach) {
                console.log('✅ Coach profile found, setting state');
                setCoachProfile({
                  id: data.coach.id,
                  username: username,
                  displayName: data.coach.displayName,
                  bio: data.coach.bio,
                  sports: data.coach.sports || [],
                  experience: data.coach.experience || 0,
                  certifications: data.coach.certifications || [],
                  hourlyRate: data.coach.hourlyRate || 0,
                  averageRating: data.coach.averageRating || 0,
                  totalReviews: data.coach.totalReviews || 0,
                  profileImage: data.coach.profileImage,
                  isVerified: data.coach.isVerified || false,
                  organization: data.coach.organization,
                  role: data.coach.role,
                  gender: data.coach.gender,
                  ageGroup: data.coach.ageGroup || [],
                  sourceUrl: data.coach.sourceUrl,
                });
              } else {
                console.warn('⚠️ No coach data in API response');
              }
            } else {
              console.warn('⚠️ API call failed with status:', response.status);
              const errorText = await response.text();
              console.error('Error response:', errorText);
            }
          } catch (error) {
            console.error('❌ Error fetching coach profile:', error);
          }
        } else {
          console.warn('⚠️ No username found in Firestore user data');
        }
      } else {
        console.error('❌ User profile not found in Firestore');
      }

      // Fetch reviews from Data Connect
      if (username) {
        try {
          const reviewsResponse = await fetch(`/api/reviews?coachUsername=${username.toLowerCase()}&limit=5`);
          if (reviewsResponse.ok) {
            const reviewsData = await reviewsResponse.json();
            if (reviewsData.reviews) {
              setReviews(reviewsData.reviews.map((r: any) => ({
                id: r.id,
                studentId: r.userId,
                studentName: r.studentName,
                rating: r.rating,
                reviewText: r.reviewText,
                createdAt: r.createdAt ? { toDate: () => new Date(r.createdAt) } : undefined,
              })));
            }
          }
        } catch (reviewError) {
          console.log('No reviews found or error fetching reviews:', reviewError);
        }
      }

      // Classes - keeping empty for now as they're not in Data Connect yet
      setClasses([]);

    } catch (error) {
      console.error('Error fetching coach data:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchConversations = async (userId: string) => {
    try {
      const res = await fetch(`/api/messages?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const resolveDisplayName = async (targetUserId: string): Promise<string> => {
    // Try user profile first via the user-role API
    try {
      const res = await fetch(`/api/auth/user-role?userId=${encodeURIComponent(targetUserId)}`);
      if (res.ok) {
        const u = await res.json();
        return u.displayName || u.username || u.email || 'User';
      }
    } catch {}
    return 'User';
  };

  const openConversationModal = async (conversation: Conversation) => {
    if (!user) return;
    const currentUserId = user.uid;
    const otherId = conversation.participants.find((p) => p !== currentUserId) || '';
    setRecipientId(otherId);
    setRecipientName(await resolveDisplayName(otherId));
    setMessagesOpen(true);
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? 'text-yellow-400' : 'text-gray-300'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        ))}
        <span className="ml-2 text-sm text-gray-300">
          {rating.toFixed(1)} ({coachProfile?.totalReviews || 0} reviews)
        </span>
      </div>
    );
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Not authenticated</h2>
          <p className="text-gray-600 mb-4">Please sign in to view your dashboard.</p>
          <a href="/signin" className="text-red-600 hover:text-red-700 font-medium">
            Go to Sign In →
          </a>
        </div>
      </div>
    );
  }

  if (!coachProfile && !statsLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Coach Profile Found</h2>
          <p className="text-gray-600 mb-4">
            We couldn't find your coach profile. This might be because:
          </p>
          <ul className="text-left text-sm text-gray-600 mb-6 space-y-2">
            <li>• Your profile is still being set up</li>
            <li>• You haven't completed onboarding</li>
            <li>• There was an issue creating your profile</li>
          </ul>
          <div className="space-x-4">
            <a href="/onboarding" className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
              Complete Onboarding
            </a>
            <a href="/" className="inline-block px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium">
              Go Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Generate profile URL using username if available, fallback to UID
  const profileUrl = coachProfile?.username ? `/coach/${coachProfile.username.toLowerCase()}` : null;
  const fullProfileUrl = profileUrl && typeof window !== 'undefined' ? `${window.location.origin}${profileUrl}` : null;

  const stats = [
    {
      name: 'Average Rating',
      value: coachProfile?.averageRating?.toFixed(1) || '0.0',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      color: 'bg-yellow-100 text-yellow-600',
    },
    {
      name: 'Total Reviews',
      value: coachProfile?.totalReviews || 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      color: 'bg-neutral-800 text-gray-300',
    },
    {
      name: 'Active Classes',
      value: classes.length,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      color: 'bg-green-100 text-green-600',
    },
    {
      name: 'Hourly Rate',
      value: coachProfile?.hourlyRate ? `$${coachProfile.hourlyRate}` : 'Not set',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      color: 'bg-purple-100 text-purple-600',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
            <p className="mt-2 text-gray-600">Manage your profile, conversations, classes and reviews</p>
            <div className="mt-2 flex items-center space-x-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                Coach
              </span>
              {coachProfile?.isVerified && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  <svg className="w-3 h-3 mr-1 text-neutral-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified
                </span>
              )}
            </div>
          </div>
          <div className="flex space-x-3">
            <Link
              href="/dashboard/coach/profile/edit"
              className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-gray-900 bg-white border border-gray-300 hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Profile
            </Link>
            {profileUrl ? (
              <>
                <Link
                  href={profileUrl}
                  className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-gray-900 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Public Profile
                </Link>
                <button
                  onClick={() => navigator.clipboard.writeText(fullProfileUrl || '')}
                  className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium text-gray-900 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Profile Link
                </button>
              </>
            ) : (
              <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-2">
                Add a username to get a public profile link
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Completion Alert */}
      {coachProfile && !coachProfile.bio && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-neutral-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-gray-900">Complete Your Profile</h3>
              <div className="mt-2 text-sm text-gray-600">
                <p>Your public profile is live but incomplete. Add a bio, sports, and other details to attract more students.</p>
              </div>
              <div className="mt-4">
                <div className="flex space-x-3">
                  <Link
                    href="/dashboard/coach/profile/edit"
                    className="text-sm bg-white text-gray-900 rounded-full px-3 py-2 font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Complete Profile
                  </Link>
                  {profileUrl && (
                    <Link
                      href={profileUrl}
                      className="text-sm text-gray-600 underline hover:text-gray-900"
                    >
                      Preview Public Profile →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                  {stat.icon}
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Reviews */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Reviews</h2>
            <p className="text-sm text-gray-600 mt-1">
              What students are saying about your coaching
            </p>
          </div>
          <div className="p-6">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
              </div>
            ) : reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          {renderStarRating(review.rating)}
                        </div>
                        <p className="text-gray-900 mb-2">{review.reviewText}</p>
                        <p className="text-sm text-gray-600">
                          By: {review.studentName}
                        </p>
                        {review.createdAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(review.createdAt.toDate()).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="text-center">
                  <Link
                    href="/dashboard/coach/reviews"
                    className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                  >
                    View all reviews →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No reviews yet</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Complete your profile to start getting reviews from students.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Active Classes */}
        <div className="bg-neutral-900/60 backdrop-blur rounded-2xl border border-neutral-800 shadow">
          <div className="px-6 py-4 border-b border-neutral-800">
            <h2 className="text-xl font-semibold text-neutral-100">Active Classes</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Manage your current coaching sessions
            </p>
          </div>
          <div className="p-6">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-700"></div>
              </div>
            ) : classes.length > 0 ? (
              <div className="space-y-4">
                {classes.map((classItem) => (
                  <div key={classItem.id} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950/50">
                    <h4 className="font-medium text-neutral-100">{classItem.title}</h4>
                    <p className="text-sm text-neutral-400 mt-1">{classItem.sport}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-neutral-500">
                        {classItem.participants}/{classItem.maxParticipants} participants
                      </span>
                      <span className="text-sm font-medium text-neutral-300">
                        ${classItem.price}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="text-center">
                  <Link
                    href="/dashboard/coach/classes"
                    className="text-neutral-300 hover:text-white text-sm font-medium"
                  >
                    Manage all classes →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-neutral-100">No active classes</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Create your first class to start accepting students.
                </p>
                <div className="mt-6">
                  <Link
                    href="/dashboard/coach/classes/new"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-full text-gray-900 bg-white hover:bg-gray-50"
                  >
                    Create Class
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Profile URL Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Public Profile</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profile URL
              </label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-sm text-gray-700 font-mono break-all">
                  {fullProfileUrl || 'N/A'}
                </code>
                <button
                  onClick={() => {
                    if (fullProfileUrl) {
                      navigator.clipboard.writeText(fullProfileUrl);
                    }
                  }}
                  className="p-2 text-gray-500 hover:text-gray-900 transition-colors"
                  title="Copy URL"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex space-x-2">
              {profileUrl ? (
                <Link
                  href={profileUrl}
                  target="_blank"
                  className="flex-1 text-center px-3 py-2 bg-white text-gray-900 text-sm rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  View Profile
                </Link>
              ) : (
                <div className="flex-1 text-center px-3 py-2 bg-gray-100 border border-gray-200 text-gray-500 text-sm rounded-full">
                  Add username to view profile
                </div>
              )}
              <Link
                href="/dashboard/coach/profile/edit"
                className="flex-1 text-center px-3 py-2 border border-gray-300 text-gray-900 text-sm rounded-full hover:bg-gray-50 transition-colors"
              >
                Edit Profile
              </Link>
            </div>

            {coachProfile && (
            <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Profile Status:</span>
                  <span className={`font-medium text-gray-900`}>
                    {coachProfile.bio && coachProfile.sports.length > 0 
                      ? 'Complete' 
                      : 'Needs Attention'
                    }
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Services & Payment Setup */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Services & Payments</h3>
          <div className="space-y-3">
            <Link
              href="/dashboard/coach/stripe"
              className="flex items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-gray-900">Payment Setup</h4>
                <p className="text-xs text-gray-600">Connect Stripe to receive payments</p>
              </div>
              <div className="ml-auto">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/coach/services"
              className="flex items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-gray-900">My Services</h4>
                <p className="text-xs text-gray-600">Create and manage services</p>
              </div>
              <div className="ml-auto">
                <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/coach/cards"
              className="flex items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-gray-900">Profile Cards</h4>
                <p className="text-xs text-gray-600">Unlock tier cards & browse marketplace</p>
              </div>
              <div className="ml-auto">
                <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/coach/jobs"
              className="flex items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h8zM16 10h.01" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h4 className="text-sm font-medium text-gray-900">Job Board</h4>
                <p className="text-xs text-gray-600">Browse coaching opportunities</p>
              </div>
              <div className="flex items-center">
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full border border-gray-200 mr-2">PRO</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <div className="text-xs text-gray-600 mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="flex items-start">
                <svg className="w-4 h-4 text-neutral-200 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900 mb-1">Start earning from coaching:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-700">
                    <li>Connect Stripe to accept payments</li>
                    <li>Create your coaching services</li>
                    <li>Students book and pay automatically</li>
                    <li>Get paid when you complete sessions</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-2xl border border-gray-200 lg:col-span-2">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Messages</h2>
              <p className="text-sm text-gray-600 mt-1">Conversations with students and clients</p>
            </div>
            <Link href="/dashboard/coach/messages" className="text-sm text-gray-600 hover:text-gray-900">
              Open full inbox →
            </Link>
          </div>
          <div className="p-0">
            {conversations.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {conversations.slice(0, 6).map((c) => {
                  const unread = c.unreadCount?.[user?.uid || ''] || 0;
                  const other = c.participants.find((p) => p !== user?.uid) || 'Conversation';
                  return (
                    <button
                      key={c.id}
                      onClick={() => openConversationModal(c)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 mr-3">
                        <div className="text-sm text-gray-900 truncate">{other}</div>
                        <div className="text-xs text-gray-600 truncate">{c.lastMessage}</div>
                      </div>
                      {unread > 0 && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{unread}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 text-center">
                <div className="w-8 h-8 mx-auto mb-2 rounded-full border-2 border-dashed border-neutral-700 flex items-center justify-center text-neutral-400">💬</div>
                <div className="text-sm font-medium text-neutral-300">No conversations yet</div>
                <div className="text-xs text-neutral-500 mt-1">You will see new messages here.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messaging Modal */}
      <MessagingModal
        isOpen={messagesOpen && !!recipientId}
        onClose={() => setMessagesOpen(false)}
        recipientId={recipientId || ''}
        recipientName={recipientName}
        user={user}
      />
    </div>
  );
} 