'use client';

import { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '../lib/firebase-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setAuthToken } from '../lib/auth-cookie';

// Extend Window interface for reCAPTCHA
declare global {
  interface Window {
    grecaptcha: {
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      ready: (callback: () => void) => void;
    };
  }
}

export default function SignUp() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Disable reCAPTCHA on localhost for development
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' || 
       window.location.hostname === '');

    if (isLocalhost) {
      setRecaptchaLoaded(true);
      return;
    }

    // Load reCAPTCHA v3 script for production
    const loadRecaptcha = () => {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      if (!siteKey) {
        console.error('reCAPTCHA site key not configured');
        return;
      }

      if (typeof window !== 'undefined' && !window.grecaptcha) {
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.onload = () => setRecaptchaLoaded(true);
        document.head.appendChild(script);
      } else if (window.grecaptcha) {
        setRecaptchaLoaded(true);
      }
    };

    loadRecaptcha();
  }, []);

  const getRecaptchaToken = async (): Promise<string | null> => {
    // Skip reCAPTCHA on localhost for development
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' || 
       window.location.hostname === '');

    if (isLocalhost) {
      console.log('Development mode: Skipping reCAPTCHA verification');
      return 'dev-bypass-token';
    }

    if (!recaptchaLoaded || !window.grecaptcha) {
      return null;
    }

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!siteKey) {
      console.error('reCAPTCHA site key not configured');
      return null;
    }

    try {
      const token = await window.grecaptcha.execute(siteKey, {
        action: 'signup'
      });
      return token;
    } catch (error) {
      console.error('reCAPTCHA error:', error);
      return null;
    }
  };

  const verifyRecaptcha = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/verify-recaptcha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          action: 'signup'
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      return false;
    }
  };


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.firstName.trim()) {
      setError('First name is required');
      return false;
    }
    if (!formData.lastName.trim()) {
      setError('Last name is required');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (!acceptTerms) {
      setError('You must accept the terms and conditions');
      return false;
    }
    return true;
  };

  const createUserDocument = async (user: { uid: string; email: string | null }, additionalData: any = {}) => {
    if (!user) return;

    const displayName = `${formData.firstName} ${formData.lastName}`.trim();

    const userData = {
      email: user.email,
      displayName: displayName,
      username: null, // Username will be set in onboarding
      firstName: formData.firstName || additionalData.firstName || '',
      lastName: formData.lastName || additionalData.lastName || '',
      role: 'user',
      onboardingCompleted: false,
      isVerified: false,
      createdAt: new Date().toISOString(),
      ...additionalData
    };

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        throw new Error('Failed to create user document');
      }
    } catch (error) {
      console.error('Error creating user document:', error);
      throw error;
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      // Get reCAPTCHA token
      const recaptchaToken = await getRecaptchaToken();
      if (!recaptchaToken) {
        setError('reCAPTCHA verification failed. Please try again.');
        setLoading(false);
        return;
      }

      // Verify reCAPTCHA token
      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        setError('reCAPTCHA verification failed. You may be identified as a bot.');
        setLoading(false);
        return;
      }

      // Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      if (!userCredential.user) throw new Error('User creation failed');

      // Create user document in Firestore
      await createUserDocument(userCredential.user, {});

      // Send email verification
      await sendEmailVerification(userCredential.user, {
        url: `${window.location.origin}/verify-email?email=${encodeURIComponent(formData.email)}`,
      });

      // Get ID token for authentication
      const token = await userCredential.user.getIdToken();
      await setAuthToken(token);

      // Redirect to verification page
      router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError('');

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      
      const result = await signInWithPopup(auth, provider);
      
      if (!result.user) throw new Error('Google sign up failed');

      // Get ID token
      const token = await result.user.getIdToken();

      // Create user document via the user profile API
      await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: result.user.email,
          displayName: result.user.displayName || '',
          firstName: result.user.displayName?.split(' ')[0] || '',
          lastName: result.user.displayName?.split(' ').slice(1).join(' ') || '',
          role: 'user',
          onboardingCompleted: false,
          isVerified: result.user.emailVerified,
          createdAt: new Date().toISOString(),
        }),
      });

      await setAuthToken(token);
      
      // Redirect to onboarding
      router.push('/onboarding');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred during Google sign up');
    } finally {
      // Reset loading state - will be called even if redirect happens
      // Small delay to allow redirect to start before resetting (if successful)
      setTimeout(() => {
      setLoading(false);
      }, 100);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Card Container */}
        <div className="bg-neutral-900/60 backdrop-blur rounded-2xl border border-neutral-800 p-8 space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-neutral-900 ring-1 ring-neutral-800">
              <svg className="h-8 w-8 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight text-neutral-100">
              Create your account
            </h1>
            <p className="mt-3 text-center text-sm text-neutral-400">
              Already have an account?{' '}
              <Link href="/signin" className="font-medium text-neutral-200 underline hover:text-white">
                Sign in
              </Link>
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={handleEmailSignUp}>
            {error && (
              <div className="rounded-xl bg-red-900/30 border border-red-800/50 p-4 animate-in slide-in-from-top-2 duration-300">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-300">
                      Unable to create account
                    </h3>
                    <div className="mt-1 text-sm text-red-200">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-neutral-300 mb-2">
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-neutral-300 mb-2">
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none"
                    placeholder="Athlete"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none"
                  placeholder="champion@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none"
                  placeholder="Create a strong password"
                />
                <p className="mt-2 text-xs text-neutral-500">Must be at least 6 characters long</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-300 mb-2">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none"
                  placeholder="Confirm your password"
                />
              </div>
          </div>

            <div className="flex items-start">
              <input
                id="accept-terms"
                name="accept-terms"
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="h-4 w-4 text-neutral-100 focus:ring-0 border-neutral-700 bg-neutral-900 rounded mt-1"
              />
              <label htmlFor="accept-terms" className="ml-3 block text-sm text-neutral-400 leading-relaxed">
                I agree to the
                <a href="#" className="ml-1 text-neutral-200 underline hover:text-white">Terms & Conditions</a>
                <span className="mx-1">and</span>
                <a href="#" className="text-neutral-200 underline hover:text-white">Privacy Policy</a>
              </label>
            </div>

            {/* reCAPTCHA Notice */}
            <div className="text-xs text-neutral-500 text-center leading-relaxed">
              Protected by reCAPTCHA • Google
              <a href="https://policies.google.com/privacy" className="ml-1 text-neutral-300 underline hover:text-white">Privacy</a>
              <span className="mx-1">&</span>
              <a href="https://policies.google.com/terms" className="text-neutral-300 underline hover:text-white">Terms</a>
              apply
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 rounded-full text-sm font-medium text-neutral-900 bg-neutral-100 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && (
                  <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {loading ? 'CREATING ACCOUNT...' : 'JOIN THE CHAMPIONS!'}
              </button>
            </div>

            <div>
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-800" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 py-1 bg-neutral-950 text-neutral-400 text-xs rounded-full border border-neutral-800">
                    Or sign up with
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={loading}
                className="w-full inline-flex justify-center items-center py-3 px-4 border border-neutral-800 rounded-full bg-neutral-900 text-neutral-100 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="text-center pt-6">
            <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 

// Metadata cannot be exported from a client component; handled at a parent layout/route.