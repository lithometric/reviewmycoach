'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/hooks/useAuth';

type OnboardingStep = 'claim_account' | 'username' | 'role' | 'coach_options' | 'claim_check' | 'claim_profile' | 'no_profiles_found' | 'identity_verify' | 'loading';

function OnboardingContent() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('loading');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'student' | 'coach' | null>(null);
  const [coachChoice, setCoachChoice] = useState<'claim' | 'create' | null>(null);
  const [loading, setLoading] = useState(false);
  const [fadeClass, setFadeClass] = useState('opacity-100');
  const [claimableProfiles, setClaimableProfiles] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [claimInProgress, setClaimInProgress] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use Firebase Auth hook
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        setCurrentStep('username');
      } else {
        router.push('/signin?redirect=/onboarding');
      }
    }
  }, [user, authLoading, router]);

  const checkUsernameAvailability = useCallback(async (usernameToCheck: string) => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    setUsernameError('');

    try {
      const response = await fetch(`/api/coaches/username/${usernameToCheck.toLowerCase()}`);
      const data = await response.json();

      setUsernameAvailable(data.available);
      if (!data.available) {
        setUsernameError('Username is already taken');
      }
    } catch (error) {
      console.error('Error checking username:', error);
      setUsernameError('Error checking username availability');
    } finally {
      setCheckingUsername(false);
    }
  }, []);

  const debouncedUsernameCheck = useCallback((value: string) => {
    const handler = setTimeout(() => {
      checkUsernameAvailability(value);
    }, 500);

    return () => clearTimeout(handler);
  }, [checkUsernameAvailability]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(value);
    setUsernameError('');
    setUsernameAvailable(null);
    
    if (value.length >= 3) {
      debouncedUsernameCheck(value);
    }
  };

  const handleUsernameSubmit = async () => {
    if (!username || !usernameAvailable || !user) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/onboarding/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ username: username.toLowerCase() }),
      });

      if (!response.ok) {
        throw new Error('Failed to save username');
      }

      goToNextStep();
    } catch (error: any) {
      console.error('Error saving username:', error);
      setUsernameError(error.message || 'Failed to save username');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async (role: 'student' | 'coach') => {
    setSelectedRole(role);
    setLoading(true);

    try {
      if (!user) return;

      const token = await user.getIdToken();
      await fetch('/api/onboarding/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });

      if (role === 'student') {
        await fetch('/api/onboarding/user', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ role, onboardingCompleted: true }),
        });

        router.push('/dashboard');
      } else {
        goToNextStep();
      }
    } catch (error) {
      console.error('Error saving role:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClaimableProfiles = async () => {
    if (!user?.email) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/account/claim', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();

      if (data.claimableProfiles && data.claimableProfiles.length > 0) {
        setClaimableProfiles(data.claimableProfiles);
        setCurrentStep('claim_profile');
      } else {
        // No profiles to claim - show UI message
        setCurrentStep('no_profiles_found');
      }
    } catch (error) {
      console.error('Error fetching claimable profiles:', error);
      setCurrentStep('no_profiles_found');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimProfile = async () => {
    if (!selectedProfile || !user) return;

    setClaimInProgress(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/coaches/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          coachId: selectedProfile.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to claim profile');
      }

      await fetch('/api/onboarding/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ onboardingCompleted: true, role: 'coach' }),
      });

      router.push('/dashboard/coach');
    } catch (error) {
      console.error('Error claiming profile:', error);
      alert('Failed to claim profile. Please try again.');
    } finally {
      setClaimInProgress(false);
    }
  };

  const handleCreateCoachProfile = async () => {
    if (!user) {
      console.error('❌ No user found');
      return;
    }

    setCreatingProfile(true);
    setLoading(true);
    
    try {
      const token = await user.getIdToken();

      const userResponse = await fetch('/api/onboarding/user', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const userData = userResponse.ok ? await userResponse.json() : null;

      // Get username from state or user data
      const finalUsername = username || userData?.username || user.email?.split('@')[0];

      if (!finalUsername) {
        throw new Error('Username is required. Please go back and set a username.');
      }

      console.log('📝 Creating coach profile for:', {
        userId: user.uid,
        username: finalUsername,
        email: user.email
      });

      const response = await fetch('/api/coaches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          displayName: userData?.displayName || user.displayName || user.email?.split('@')[0],
          username: finalUsername.toLowerCase(),
        })
      });

      console.log('📡 API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ API error:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to create coach profile');
      }

      const responseData = await response.json();
      console.log('✅ Coach profile created:', responseData);

      // Update user document with username and coach role
      await fetch('/api/onboarding/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: finalUsername.toLowerCase(),
          onboardingCompleted: true,
          role: 'coach',
        }),
      });

      console.log('✅ User document updated');

      // Wait a bit to ensure everything is saved
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Redirect to dashboard
      console.log('🚀 Redirecting to dashboard...');
      window.location.href = '/dashboard/coach';
    } catch (error: any) {
      console.error('❌ Error creating coach profile:', error);
      setUsernameError(error.message || 'Failed to create coach profile. Please try again.');
      setCurrentStep('coach_options');
    } finally {
      setLoading(false);
      setCreatingProfile(false);
    }
  };

  const goToNextStep = () => {
    setFadeClass('opacity-0');
    setTimeout(() => {
      const steps: OnboardingStep[] = ['username', 'role', 'coach_options', 'claim_check', 'claim_profile', 'identity_verify'];
      const currentIndex = steps.indexOf(currentStep);
      if (currentIndex < steps.length - 1) {
        setCurrentStep(steps[currentIndex + 1]);
      }
      setFadeClass('opacity-100');
    }, 300);
  };

  const goToPreviousStep = () => {
    setFadeClass('opacity-0');
    setTimeout(() => {
      const steps: OnboardingStep[] = ['username', 'role', 'coach_options', 'claim_check', 'claim_profile', 'identity_verify'];
      const currentIndex = steps.indexOf(currentStep);
      if (currentIndex > 0) {
        setCurrentStep(steps[currentIndex - 1]);
      }
      setFadeClass('opacity-100');
    }, 300);
  };

  if (authLoading || currentStep === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className={`max-w-2xl mx-auto py-12 transition-opacity duration-300 ${fadeClass}`}>
        {currentStep === 'username' && (
          <div>
            <h1 className="text-4xl font-bold mb-8 text-center">Choose Your Username</h1>
            <div className="space-y-4">
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="username"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500"
              />
              {checkingUsername && <p className="text-gray-400">Checking availability...</p>}
              {usernameError && <p className="text-red-500">{usernameError}</p>}
              {usernameAvailable && <p className="text-green-500">Username available!</p>}
              <button
                onClick={handleUsernameSubmit}
                disabled={!usernameAvailable || loading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded-lg font-bold"
              >
                {loading ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'role' && (
          <div>
            <h1 className="text-4xl font-bold mb-8 text-center">Select Your Role</h1>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleRoleSelection('student')}
                className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg"
              >
                <h2 className="text-2xl font-bold mb-2">Student</h2>
                <p className="text-gray-400">Find and book coaches</p>
              </button>
              <button
                onClick={() => handleRoleSelection('coach')}
                className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg"
              >
                <h2 className="text-2xl font-bold mb-2">Coach</h2>
                <p className="text-gray-400">Create your profile</p>
              </button>
            </div>
          </div>
        )}

        {currentStep === 'coach_options' && (
          <div>
            <h1 className="text-4xl font-bold mb-8 text-center">Coach Setup</h1>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-gray-400">Setting up your profile...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setCoachChoice('claim');
                    fetchClaimableProfiles();
                  }}
                  disabled={loading}
                  className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <h2 className="text-2xl font-bold mb-2">Claim Profile</h2>
                  <p className="text-gray-400">Claim an existing profile</p>
                </button>
                <button
                  onClick={() => {
                    setCoachChoice('create');
                    handleCreateCoachProfile();
                  }}
                  disabled={loading}
                  className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <h2 className="text-2xl font-bold mb-2">Create New</h2>
                  <p className="text-gray-400">Start from scratch</p>
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 'claim_profile' && claimableProfiles.length > 0 && (
          <div>
            <h1 className="text-4xl font-bold mb-8 text-center">Claim Your Profile</h1>
            <div className="space-y-4">
              {claimableProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile)}
                  className={`w-full p-6 bg-gray-900 border-2 rounded-lg text-left ${
                    selectedProfile?.id === profile.id ? 'border-red-500' : 'border-gray-700'
                  }`}
                >
                  <h3 className="text-xl font-bold">{profile.displayName || profile.display_name}</h3>
                  <p className="text-gray-400">{profile.organization}</p>
                  <p className="text-sm text-gray-500">{profile.sports?.join(', ')}</p>
                </button>
              ))}
              <button
                onClick={handleClaimProfile}
                disabled={!selectedProfile || claimInProgress}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded-lg font-bold"
              >
                {claimInProgress ? 'Claiming...' : 'Claim Profile'}
              </button>
              <button
                onClick={() => setCurrentStep('coach_options')}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {currentStep === 'no_profiles_found' && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold mb-4">No Existing Profile Found</h1>
              <p className="text-gray-400 mb-6">
                We couldn't find any coach profiles associated with <span className="text-white font-medium">{user?.email}</span>
              </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-3">What happens next?</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  We'll create a new coach profile for you
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You can customize it in your dashboard
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Start receiving reviews from students
                </li>
              </ul>
            </div>

            {usernameError && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-4">
                <p className="text-red-400 text-sm">{usernameError}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleCreateCoachProfile}
                disabled={creatingProfile}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center"
              >
                {creatingProfile ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Your Profile...
                  </>
                ) : (
                  'Create My Coach Profile'
                )}
              </button>
              <button
                onClick={() => setCurrentStep('coach_options')}
                disabled={creatingProfile}
                className="w-full py-3 bg-transparent border border-gray-700 hover:bg-gray-800 disabled:opacity-50 rounded-lg font-semibold"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Fallback for unexpected steps */}
        {!['username', 'role', 'coach_options', 'claim_profile', 'no_profiles_found', 'loading'].includes(currentStep) && (
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-8">Something went wrong</h1>
            <p className="text-gray-400 mb-8">We encountered an unexpected error.</p>
            <button
              onClick={() => setCurrentStep('username')}
              className="py-3 px-8 bg-red-600 hover:bg-red-700 rounded-lg font-bold"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Onboarding() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading...</div></div>}>
      <OnboardingContent />
    </Suspense>
  );
}

