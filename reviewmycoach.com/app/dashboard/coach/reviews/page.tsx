'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/hooks/useAuth';

interface Review {
  id: string;
  studentId: string;
  studentName: string;
  rating: number;
  reviewText: string;
  createdAt?: string;
}

export default function CoachReviewsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [coachDocId, setCoachDocId] = useState<string | null>(null);
  
  // Use Firebase Auth
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/signin');
      return;
    }

    const fetchReviews = async () => {
      try {
        // Get username + role from the user-role API
        const roleRes = await fetch(`/api/auth/user-role?userId=${encodeURIComponent(user.uid)}`);

        let resolvedCoachDocId: string = user.uid;
        if (roleRes.ok) {
          const data = await roleRes.json();
          if (data.role !== 'coach') {
            router.push('/dashboard');
            return;
          }
          if (data.username) {
            resolvedCoachDocId = String(data.username).toLowerCase();
          }
        }

        setCoachDocId(resolvedCoachDocId);

        // Fetch reviews from Data Connect API
        const response = await fetch(`/api/reviews?coachUsername=${resolvedCoachDocId}`);
        if (response.ok) {
          const data = await response.json();
          setReviews((data.reviews || []).map((r: any) => ({
            id: r.id,
            studentId: r.userId,
            studentName: r.studentName,
            rating: r.rating,
            reviewText: r.reviewText,
            createdAt: r.createdAt
          })));
        }
      } catch (err) {
        console.error('Failed to load reviews:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [user, authLoading, router]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-100 tracking-tight">Your Reviews</h1>
          <p className="mt-1 text-neutral-400">All reviews students have left for your coaching</p>
        </div>
        <div className="flex items-center space-x-3">
          <Link href="/dashboard/coach" className="text-sm text-neutral-300 hover:text-white">Back to Dashboard →</Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-700"></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 border border-neutral-800 rounded-2xl bg-neutral-900/60">
          <svg className="mx-auto h-12 w-12 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-neutral-100">No reviews yet</h3>
          <p className="mt-1 text-sm text-neutral-500">Share your profile to start receiving reviews.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${star <= (r.rating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    ))}
                    <span className="ml-2 text-sm text-gray-300">{(r.rating || 0).toFixed(1)}</span>
                  </div>
                  <p className="text-neutral-100 mb-2">{r.reviewText}</p>
                  <p className="text-sm text-neutral-400">By: {r.studentName || 'Student'}</p>
                  {r.createdAt && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Helpful links */}
      <div className="mt-8 text-sm text-neutral-400">
        {coachDocId && (
          <Link href={`/coach/${coachDocId}`} className="hover:text-white underline">
            View your public profile
          </Link>
        )}
      </div>
    </div>
  );
}


