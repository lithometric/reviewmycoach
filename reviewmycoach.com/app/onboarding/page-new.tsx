'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/hooks/useAuth';

type OnboardingStep = 'claim_account' | 'username' | 'role' | 'coach_options' | 'claim_check' | 'claim_profile' | 'identity_verify' | 'loading';

export default function Onboarding() {
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
        setCurrentStep('identity_verify');
      }
    } catch (error) {
      console.error('Error fetching claimable profiles:', error);
      setCurrentStep('identity_verify');
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
    if (!user) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();

      const userResponse = await fetch('/api/onboarding/user', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const userData = userResponse.ok ? await userResponse.json() : null;

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
          username: username || user.email?.split('@')[0],
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create coach profile');
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
      console.error('Error creating coach profile:', error);
      alert('Failed to create coach profile. Please try again.');
    } finally {
      setLoading(false);
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
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setCoachChoice('claim');
                  fetchClaimableProfiles();
                }}
                className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg"
              >
                <h2 className="text-2xl font-bold mb-2">Claim Profile</h2>
                <p className="text-gray-400">Claim an existing profile</p>
              </button>
              <button
                onClick={() => {
                  setCoachChoice('create');
                  handleCreateCoachProfile();
                }}
                className="p-8 bg-gray-900 hover:bg-gray-800 border-2 border-gray-700 hover:border-red-500 rounded-lg"
              >
                <h2 className="text-2xl font-bold mb-2">Create New</h2>
                <p className="text-gray-400">Start from scratch</p>
              </button>
            </div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

