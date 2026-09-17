'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '../../components/LoadingSpinner';

interface CoachRequest {
  id: string;
  submittedByUserId?: string;
  submittedByName?: string;
  coachName: string;
  school: string;
  sport: string;
  status: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdCoachId?: string;
  createdAt: string;
  updatedAt?: string;
}

export default function CoachRequestsAdmin() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/signin');
      return;
    }

    checkAdminAccess(user.uid);
  }, [user, authLoading, router]);

  const checkAdminAccess = async (userId: string) => {
    try {
      const response = await fetch(`/api/auth/user-role?userId=${userId}`);

      if (response.status === 404) {
        router.push('/onboarding');
        return;
      }

      if (!response.ok) {
        router.push('/dashboard');
        return;
      }

      const userData = await response.json();
      if (userData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      setUserRole(userData.role);
      await fetchRequests();
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      if (!user) return;

      const token = await user.getIdToken();
      const response = await fetch('/api/coach-requests', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      } else {
        console.error('Failed to fetch coach requests');
      }
    } catch (error) {
      console.error('Error fetching coach requests:', error);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!user) return;

    setActionLoading(requestId);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/coach-requests/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Coach request approved! Coach "${data.username}" has been created.`);
        await fetchRequests();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user || !rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    setActionLoading(requestId);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/coach-requests/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: rejectionReason.trim(),
        }),
      });

      if (response.ok) {
        alert('Coach request rejected');
        setShowRejectModal(null);
        setRejectionReason('');
        await fetchRequests();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredRequests = requests.filter(req => {
    if (filter === 'all') return true;
    return req.status === filter;
  });

  if (loading || authLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Coach Requests
            </h1>
            <button
              onClick={() => router.push('/admin')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              ← Back to Admin Dashboard
            </button>
          </div>
          <p className="text-gray-600">
            Review and approve coach submission requests from users
          </p>
        </div>

        {/* Filter tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-8">
            {[
              { id: 'pending', label: 'Pending' },
              { id: 'approved', label: 'Approved' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'all', label: 'All' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as typeof filter)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  filter === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.id !== 'all' && (
                  <span className="ml-2 py-0.5 px-2 rounded-full bg-gray-100 text-gray-600 text-xs">
                    {requests.filter(r => r.status === tab.id).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Requests list */}
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="w-16 h-16 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-500">No {filter !== 'all' ? filter : ''} coach requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <div
                key={request.id}
                className="border border-gray-200 rounded-lg p-6 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {request.coachName}
                    </h3>
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span>🏫 {request.school}</span>
                      <span>🏃 {request.sport}</span>
                      {request.submittedByName && (
                        <span>👤 Submitted by: {request.submittedByName}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      request.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : request.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {request.status}
                  </span>
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  Submitted: {new Date(request.createdAt).toLocaleString()}
                </div>

                {request.status === 'pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={actionLoading === request.id}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {actionLoading === request.id ? 'Processing...' : 'Approve & Create Coach'}
                    </button>
                    <button
                      onClick={() => setShowRejectModal(request.id)}
                      disabled={actionLoading === request.id}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {request.status === 'rejected' && request.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-sm text-red-800">
                      <strong>Rejection reason:</strong> {request.rejectionReason}
                    </p>
                  </div>
                )}

                {request.status === 'approved' && request.createdCoachId && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-sm text-green-800">
                      <strong>Coach created:</strong> ID {request.createdCoachId}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rejection modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Reject Coach Request
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this coach request:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showRejectModal && handleReject(showRejectModal)}
                disabled={!rejectionReason.trim() || actionLoading === showRejectModal}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === showRejectModal ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
