'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Review {
  id: string;
  email: string;
  reviews: string;
  createdAt?: { toDate: () => Date };
}

export default function Dashboard() {
  const [userRole, setUserRole] = useState<'student' | 'coach' | 'admin' | null>(null);
  const [userReviews, setUserReviews] = useState<Review[]>([]);

  const [loadingReviews, setLoadingReviews] = useState(false);
  const router = useRouter();
  
  // Use Firebase Auth
  const { user, loading } = useAuth();

  const checkUserRole = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/auth/user-role?userId=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const userData = await response.json();
        setUserRole(userData.role || null);
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  }, []);

  const fetchUserReviews = useCallback(async (email: string) => {
    setLoadingReviews(true);
    try {
      // Fetch reviews from Data Connect API
      const response = await fetch(`/api/reviews?email=${encodeURIComponent(email)}`);
      if (response.ok) {
        const data = await response.json();
        setUserReviews(data.reviews || []);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      checkUserRole(user.uid);
      if (user.email) {
        fetchUserReviews(user.email);
      }
    } else if (!loading && !user) {
      router.push('/signin');
    }
  }, [user, loading, router, checkUserRole, fetchUserReviews]);

  const [stats, setStats] = useState([
    {
      name: 'Reviews Written',
      value: '0',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
    },
    {
      name: 'Coaches Bookmarked',
      value: '0',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      ),
    },
    {
      name: 'Profile Views',
      value: '0',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
    {
      name: 'Helpful Votes',
      value: '0',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
      ),
    },
  ]);

  useEffect(() => {
    const loadStats = async () => {
      if (!user) return;
      try {
        const [reviewsRes, bookmarksRes] = await Promise.all([
          fetch(`/api/reviews/written?userId=${encodeURIComponent(user.uid)}&email=${encodeURIComponent(user.email || '')}`),
          fetch(`/api/bookmarks/count?userId=${encodeURIComponent(user.uid)}&type=coach`),
        ]);
        const reviewsJson = await reviewsRes.json();
        const bookmarksJson = await bookmarksRes.json();
        setStats((prev) => prev.map((s) => {
          if (s.name === 'Reviews Written') return { ...s, value: String(reviewsJson.total || 0) };
          if (s.name === 'Coaches Bookmarked') return { ...s, value: String(bookmarksJson.total || 0) };
          return s;
        }));
      } catch (e) {
        console.error('Failed loading dashboard stats', e);
      }
    };
    loadStats();
  }, [user]);



  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'User'}!
        </h1>
        <p className="mt-2 text-gray-600">
          {userRole === 'admin'
            ? "Administrator dashboard - manage reviews and coaches"
            : userRole === 'coach' 
            ? "Manage your coaching profile and view your reviews"
            : "Here is what is happening with your ReviewMyCoach activity"
          }
        </p>
        <div className="mt-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            userRole === 'admin'
              ? 'bg-red-100 text-red-800'
              : userRole === 'coach' 
              ? 'bg-red-50 text-red-700' 
              : 'bg-green-100 text-green-800'
          }`}>
            {userRole === 'admin' ? 'Administrator' : userRole === 'coach' ? 'Coach' : 'Student'}
          </span>
        </div>
      </div>

      {/* Admin Panel Section */}
      {userRole === 'admin' && (
        <div className="mb-8">
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Administrator Access
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>You have administrator privileges. Access admin features to manage the platform.</p>
                </div>
                <div className="mt-4">
                  <div className="-mx-2 -my-1.5 flex space-x-2">
                    <Link
                      href="/admin"
                      className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                    >
                      Admin Panel
                    </Link>
                    <Link
                      href="/admin/coach-onboarding"
                      className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                    >
                      Add Coach
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-100 rounded-md flex items-center justify-center">
                  <div className="text-gray-600">
                    {stat.icon}
                  </div>
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

      {/* Reviews Section */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {userRole === 'coach' ? 'Reviews About You' : 'Your Reviews'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {userRole === 'coach' 
              ? 'See what students are saying about your coaching'
              : 'Reviews you have written about coaches'
            }
          </p>
        </div>
        <div className="p-6">
          {loadingReviews ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
              <span className="ml-2 text-gray-600">Loading reviews...</span>
            </div>
          ) : userReviews.length > 0 ? (
            <div className="space-y-4">
              {userReviews.map((review) => (
                <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-gray-900">{review.reviews}</p>
                      <p className="text-sm text-gray-600 mt-2">
                        By: {review.email}
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
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {userRole === 'coach' ? 'No reviews received yet' : 'No reviews written yet'}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {userRole === 'coach' 
                  ? 'Students have not reviewed you yet. Complete your profile to get discovered!'
                  : 'You have not written any reviews yet. Start by finding a coach to review.'
                }
              </p>
              <div className="mt-6">
                <Link
                  href={userRole === 'coach' ? '/profile' : '/coaches'}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-900 bg-white hover:bg-gray-50"
                >
                  {userRole === 'coach' ? 'Complete Profile' : 'Find Coaches'}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
} 

// Metadata cannot be exported from a client component; handled at a parent layout/route.