'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import Link from 'next/link';

interface UserProfile {
  userId: string;
  displayName: string;
  username?: string;
  phoneNumber?: string;
  email?: string;
  emailVerified?: boolean;
  isPublic?: boolean;
}



export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [formData, setFormData] = useState<UserProfile>({
    userId: '',
    displayName: '',
    username: '',
    phoneNumber: '',
    isPublic: true
  });

  const router = useRouter();

  const loadCoachProfile = useCallback(async (userId: string) => {
    try {
      // First, get username + basic fields from the user profile API
      const userRes = await fetch(`/api/user/profile?userId=${encodeURIComponent(userId)}`);
      const userData = userRes.ok ? await userRes.json() : null;
      const usernameFromUsers = userData?.username || null;

      // Fetch coach profile from Data Connect API if username exists
      if (usernameFromUsers) {
        try {
          const response = await fetch(`/api/coaches/by-username/${usernameFromUsers.toLowerCase()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.coach) {
              setFormData({
                userId: userId,
                displayName: data.coach.displayName || user?.displayName || '',
                username: data.coach.username || usernameFromUsers || '',
                phoneNumber: data.coach.phoneNumber || '',
                email: data.coach.email || user?.email || '',
                emailVerified: user?.emailVerified || false,
                isPublic: true // Data Connect coaches are public by default
              });
              return;
            }
          }
        } catch (error) {
          console.error('Error fetching coach from Data Connect:', error);
        }
      }
      
      // Fallback: Initialize with user data from the user profile API
      setFormData(prev => ({
        ...prev,
        userId: userId,
        displayName: userData?.displayName || user?.displayName || '',
        username: userData?.username || usernameFromUsers || '',
        email: user?.email || '',
        emailVerified: user?.emailVerified || false,
        isPublic: true
      }));
    } catch (error) {
      console.error('Error loading coach profile:', error);
    }
  }, [user]);

  const checkUsernameAvailability = async (username: string) => {
    if (!username.trim()) {
      setUsernameError(null);
      return;
    }

    // Basic username validation
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      setUsernameError('Username must be 3-20 characters long and contain only letters, numbers, hyphens, and underscores');
      return;
    }

    setCheckingUsername(true);
    setUsernameError(null);

    try {
      const response = await fetch(`/api/coaches/username/${username}`);
      const data = await response.json();
      
      if (response.ok) {
        if (data.available) {
          setUsernameError(null);
        } else {
          setUsernameError('Username is already taken');
        }
      } else {
        setUsernameError('Error checking username availability');
      }
    } catch (error) {
      console.error('Error checking username:', error);
      setUsernameError('Error checking username availability');
    } finally {
      setCheckingUsername(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/signin');
      return;
    }

    loadCoachProfile(user.uid);
    setLoading(false);
  }, [user, authLoading, router, loadCoachProfile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check username availability when username changes
    if (name === 'username') {
      const timeoutId = setTimeout(() => {
        checkUsernameAvailability(value);
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (usernameError) {
      alert('Please fix the username error before saving');
      return;
    }

    setSaving(true);
    try {
      // Update user document via the user profile API
      const userToken = await user.getIdToken();
      await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          displayName: formData.displayName,
          username: formData.username?.trim() || null,
          phoneNumber: formData.phoneNumber,
        }),
      });

      // If user has a coach profile, update it via API
      if (formData.username) {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/coaches/by-username/' + formData.username.toLowerCase(), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              displayName: formData.displayName,
              phoneNumber: formData.phoneNumber,
            })
          });
          
          if (!response.ok) {
            console.warn('Could not update coach profile, but user profile was saved');
          }
        } catch (error) {
          console.warn('Error updating coach profile:', error);
        }
      }

      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!user) return;
    
    const newEmailInput = document.getElementById('newEmail') as HTMLInputElement;
    const newEmail = newEmailInput?.value?.trim();
    
    if (!newEmail) {
      alert('Please enter a new email address');
      return;
    }

    if (newEmail === user.email) {
      alert('New email must be different from current email');
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentEmail: user.email,
          newEmail: newEmail,
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        newEmailInput.value = '';
        // Refresh the page to update the user data
        window.location.reload();
      } else {
        alert(data.error || 'Failed to change email');
      }
    } catch (error) {
      console.error('Error changing email:', error);
      alert('Error changing email. Please try again.');
    }
  };

  const handleVerifyEmail = async () => {
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/account/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
      } else {
        alert(data.error || 'Failed to send verification email');
      }
    } catch (error) {
      console.error('Error sending verification email:', error);
      alert('Error sending verification email. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    
    const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;
    const newPassword = newPasswordInput?.value?.trim();
    
    if (!newPassword) {
      alert('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newPassword: newPassword,
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        newPasswordInput.value = '';
      } else {
        alert(data.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Error changing password. Please try again.');
    }
  };

  const handleProfileVisibilityChange = async (isPublic: boolean) => {
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/account/profile-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isPublic: isPublic,
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          isPublic: isPublic
        }));
        alert(data.message);
      } else {
        alert(data.error || 'Failed to update profile visibility');
      }
    } catch (error) {
      console.error('Error updating profile visibility:', error);
      alert('Error updating profile visibility. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data including:\n\n' +
      '• Your coach profile\n' +
      '• All your reviews\n' +
      '• All your bookings\n' +
      '• Your authentication account\n\n' +
      'Type "DELETE MY ACCOUNT" in the next prompt to confirm.'
    );

    if (!confirmed) return;

    const confirmText = window.prompt('Please type "DELETE MY ACCOUNT" to confirm:');
    
    if (confirmText !== 'DELETE MY ACCOUNT') {
      alert('Confirmation text does not match. Account deletion cancelled.');
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirmText: confirmText,
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        // Redirect to home page after successful deletion
        router.push('/');
      } else {
        alert(data.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error deleting account. Please try again.');
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your coach profile and account settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-silver-blue)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    onBlur={() => checkUsernameAvailability(formData.username || '')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-silver-blue)]"
                    placeholder="Enter username"
                  />
                  {checkingUsername && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--brand-silver-blue)] border-t-transparent"></div>
                    </div>
                  )}
                </div>
                {usernameError && (
                  <p className="mt-1 text-xs text-red-600">{usernameError}</p>
                )}
                {!usernameError && formData.username && !checkingUsername && (
                  <p className="mt-1 text-xs text-green-600">Username is available</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Your username will be used in your public profile URL (e.g., /coach/your-username)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-silver-blue)]"
                />
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-4">
                For coach-specific profile settings (sports, certifications, availability, etc.), please visit your{' '}
                <Link href="/dashboard/coach/profile/edit" className="text-[var(--brand-silver-blue)] hover:text-[#8fa3b1] font-medium">
                  coach dashboard
                </Link>.
              </p>
            </div>
          </div>

          {/* Account Management */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Account Management</h2>
            
            <div className="space-y-6">
              {/* Change Email */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Email</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Update your email address. You'll need to verify your new email address.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Email
                    </label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Email
                    </label>
                    <input
                      type="email"
                      id="newEmail"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-silver-blue)]"
                      placeholder="Enter new email"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleChangeEmail()}
                  className="mt-4 px-4 py-2 rounded-md text-sm btn-brand"
                >
                  Change Email
                </button>
              </div>

              {/* Email Verification */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Email Verification</h3>
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center space-x-2 ${user?.emailVerified ? 'text-green-600' : 'text-red-600'}`}>
                    <div className={`w-3 h-3 rounded-full ${user?.emailVerified ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-medium">
                      {user?.emailVerified ? 'Email Verified' : 'Email Not Verified'}
                    </span>
                  </div>
                </div>
                {!user?.emailVerified && (
                  <button
                    type="button"
                    onClick={() => handleVerifyEmail()}
                    className="mt-4 px-4 py-2 rounded-md text-sm btn-brand"
                  >
                    Send Verification Email
                  </button>
                )}
              </div>

              {/* Change Password */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Update your password to keep your account secure.
                </p>
                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-silver-blue)]"
                    placeholder="Enter new password"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleChangePassword()}
                  className="mt-4 px-4 py-2 rounded-md text-sm btn-brand"
                >
                  Change Password
                </button>
              </div>

              {/* Profile Visibility */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Visibility</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Control whether your profile appears in public search results.
                </p>
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={formData.isPublic !== false}
                    onChange={(e) => handleProfileVisibilityChange(e.target.checked)}
                    className="h-4 w-4 text-[var(--brand-silver-blue)] focus:ring-[var(--brand-silver-blue)] border-gray-300 rounded"
                  />
                  <label htmlFor="isPublic" className="text-sm font-medium text-gray-700">
                    Make my profile public
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  When disabled, your profile will not appear in search results, but students with direct links can still access it.
                </p>
              </div>

              {/* Delete Account */}
              <div>
                <h3 className="text-lg font-medium text-red-600 mb-4">Delete Account</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={() => handleDeleteAccount()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium btn-brand disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 

// Metadata cannot be exported from a client component; handled at a parent layout/route.