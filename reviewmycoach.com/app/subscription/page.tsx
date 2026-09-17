'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '../components/LoadingSpinner';
import Link from 'next/link';

interface CoachProfile {
  userId: string;
  displayName: string;
  isCoach?: boolean;
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
  subscriptionPlan?: 'monthly' | 'yearly';
  subscriptionId?: string;
}

const SUBSCRIPTION_PLANS = {
  monthly: {
    name: 'Coach Pro',
    price: 10,
    priceId: process.env.NEXT_PUBLIC_COACH_PRO_MONTHLY_PRICE_ID || 'price_monthly_default',
    interval: 'month',
    features: [
      'Access to job board and unlimited job applications',
      'Featured placement on coaches page',
      'Earn 2x XP (2000 XP vs 1000 XP per subscription tier)',
      'Unlock higher tier profile cards faster',
      'Support platform development'
    ]
  },
  yearly: {
    name: 'Coach Pro',
    price: 96,
    priceId: process.env.NEXT_PUBLIC_COACH_PRO_YEARLY_PRICE_ID || 'price_yearly_default',
    interval: 'year',
    savings: 24,
    monthlyEquivalent: 8,
    features: [
      'Access to job board and unlimited job applications',
      'Featured placement on coaches page',
      'Earn 2x XP (2000 XP vs 1000 XP per subscription tier)',
      'Unlock higher tier profile cards faster',
      'Support platform development',
      'Save $24 annually'
    ]
  }
};

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [subscribing, setSubscribing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const loadCoachProfile = useCallback(async () => {
    if (!user) return;

    try {
      // Resolve the coach's subscription state via the API (user doc -> coach doc)
      const token = await user.getIdToken();
      const response = await fetch('/api/user/coach-subscription', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.found && data.coach) {
          setCoachProfile(data.coach as CoachProfile);
        } else {
          // No username or coach profile found, redirect to onboarding
          router.push('/onboarding');
          return;
        }
      } else {
        // Could not load profile, redirect to onboarding to be safe
        router.push('/onboarding');
        return;
      }
    } catch (error) {
      console.error('Error loading coach profile:', error);
      // On error, redirect to onboarding to be safe
      router.push('/onboarding');
    } finally {
      setLoading(false);
    }
  }, [user, router]);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/signin');
      return;
    }

    loadCoachProfile();
  }, [user, authLoading, router, loadCoachProfile]);

  const handlePlanChange = (plan: 'monthly' | 'yearly') => {
    if (plan === selectedPlan || isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Fade out current content
    setTimeout(() => {
      setSelectedPlan(plan);
      // Fade in new content
      setTimeout(() => {
        setIsTransitioning(false);
      }, 150);
    }, 150);
  };

  const handleSubscribe = async () => {
    if (!user || !coachProfile) return;

    setSubscribing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          priceId: SUBSCRIPTION_PLANS[selectedPlan].priceId,
          userId: user.uid,
          plan: selectedPlan,
          idToken: idToken
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Error starting subscription. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!coachProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-3xl p-12">
            <div className="w-16 h-16 bg-[color:rgb(255_0_2_/_.15)] border border-[var(--brand-red)]/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[var(--brand-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Coach Profile Required</h1>
            <p className="text-gray-400 mb-8 leading-relaxed">You need to be a registered coach to access Coach Pro subscriptions.</p>
            <Link
              href="/onboarding"
              className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-semibold hover:bg-gray-800 transition-all transform hover:scale-105 shadow-lg inline-block"
            >
              Complete Coach Onboarding
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Check if already subscribed
  const isSubscribed = coachProfile.subscriptionStatus === 'active';

  if (isSubscribed) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="inline-flex items-center px-6 py-3 bg-neutral-800/40 border border-neutral-700 text-neutral-300 rounded-full text-sm font-medium mb-8 backdrop-blur-sm">Coach Pro Active</div>
            <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
              You're all set with Coach Pro
            </h1>
            <p className="text-xl text-neutral-400 mb-12">
              Current Plan: <span className="text-white font-semibold">{coachProfile.subscriptionPlan === 'yearly' ? 'Annual' : 'Monthly'}</span>
            </p>
            
            <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8 mb-12">
              <h2 className="text-2xl font-semibold text-neutral-100 mb-8">Your Pro Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {SUBSCRIPTION_PLANS.monthly.features.map((feature, index) => (
                  <div key={index} className="flex items-center group">
                    <div className="w-6 h-6 bg-neutral-700/40 border border-neutral-700 rounded-full flex items-center justify-center mr-4 group-hover:bg-neutral-700/60 transition-colors">
                      <svg className="h-3 w-3 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-neutral-300 group-hover:text-white transition-colors">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/dashboard"
                className="bg-neutral-900 text-neutral-100 px-8 py-4 rounded-xl font-semibold hover:bg-neutral-800 transition-all transform hover:scale-105 shadow-lg"
              >
                Go to Dashboard
              </Link>
              <button
                onClick={() => router.push('/profile')}
                className="bg-neutral-900 border border-neutral-800 text-neutral-300 px-8 py-4 rounded-xl font-semibold hover:bg-neutral-800 hover:text-white transition-all"
              >
                Manage Subscription
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl sm:text-6xl font-bold text-neutral-100 mb-6 tracking-tight">
            Unlock Your
            <br />
            <span className="bg-gradient-to-r from-neutral-100 via-neutral-400 to-neutral-200 bg-clip-text text-transparent">Coaching Potential</span>
          </h1>
          <p className="text-xl text-neutral-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            Get access to premium features and grow your coaching business with Coach Pro
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-neutral-800/40 border border-neutral-700 text-neutral-300 rounded-full text-sm font-medium backdrop-blur-sm">Welcome, {coachProfile.displayName}</div>
        </div>

        {/* Plan Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-2">
            <button
              onClick={() => handlePlanChange('monthly')}
              disabled={isTransitioning}
              className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all ${
                selectedPlan === 'monthly'
                  ? 'bg-neutral-100 text-neutral-900 shadow-lg'
                  : 'text-neutral-400 hover:text-white'
              } ${isTransitioning ? 'pointer-events-none' : ''}`}
            >
              Monthly
            </button>
            <button
              onClick={() => handlePlanChange('yearly')}
              disabled={isTransitioning}
              className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all relative ${
                selectedPlan === 'yearly'
                  ? 'bg-neutral-100 text-neutral-900 shadow-lg'
                  : 'text-neutral-400 hover:text-white'
              } ${isTransitioning ? 'pointer-events-none' : ''}`}
            >
              Annual
              <span className="absolute -top-2 -right-2 bg-neutral-700 text-neutral-100 text-xs px-2 py-1 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-lg mx-auto">
          <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-neutral-200 px-8 py-12 text-neutral-900 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-neutral-200/40 backdrop-blur-sm"></div>
              <div className={`relative z-10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                <h3 className="text-2xl font-bold mb-4">
                  {SUBSCRIPTION_PLANS[selectedPlan].name}
                </h3>
                <div className="flex items-baseline justify-center mb-4">
                  <span className="text-6xl font-bold tracking-tight">
                    ${selectedPlan === 'yearly' ? SUBSCRIPTION_PLANS.yearly.monthlyEquivalent : SUBSCRIPTION_PLANS[selectedPlan].price}
                  </span>
                   <span className="text-xl font-medium ml-2 text-neutral-700">
                    /month
                  </span>
                </div>
                {selectedPlan === 'yearly' && (
                  <div className="space-y-1">
                    <div className="text-neutral-700 text-sm">
                      ${SUBSCRIPTION_PLANS.yearly.price} billed annually
                    </div>
                    <div className="text-neutral-800 font-medium">
                      Save ${SUBSCRIPTION_PLANS.yearly.savings} per year
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="px-8 py-10">
              <div className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                 <ul className="space-y-5 mb-10">
                  {SUBSCRIPTION_PLANS[selectedPlan].features.map((feature, index) => (
                    <li key={index} className="flex items-start group">
                      <div className="w-6 h-6 bg-neutral-700/40 border border-neutral-700 rounded-full flex items-center justify-center mr-4 mt-0.5 group-hover:bg-neutral-700/60 transition-colors">
                        <svg className="h-3 w-3 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-neutral-300 group-hover:text-white transition-colors leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing || isTransitioning}
                  className="w-full bg-neutral-900 text-neutral-100 py-4 px-8 rounded-2xl font-semibold hover:bg-neutral-800 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                >
                  {subscribing ? (
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </div>
                  ) : (
                    `Start Your Coach Pro Journey`
                  )}
                </button>
                
                <p className="text-xs text-neutral-500 text-center mt-4">
                  Cancel anytime. No long-term commitments.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-neutral-100 text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8 hover:bg-neutral-900/80 transition-colors">
              <h3 className="font-semibold text-neutral-100 mb-3 text-lg">
                What's the difference between Coach Pro and regular coaching?
              </h3>
              <p className="text-neutral-400 leading-relaxed">
                Coach Pro gives you access to the job board for unlimited applications, featured placement on the coaches page, and 2x XP to help you level up and unlock higher tier profile cards faster.
              </p>
            </div>
            
            <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8 hover:bg-neutral-900/80 transition-colors">
              <h3 className="font-semibold text-neutral-100 mb-3 text-lg">
                Can I cancel my subscription anytime?
              </h3>
              <p className="text-neutral-400 leading-relaxed">
                Yes, you can cancel your Coach Pro subscription at any time. You'll continue to have access to Pro features until the end of your current billing period.
              </p>
            </div>
            
            <div className="bg-neutral-900/60 backdrop-blur-sm border border-neutral-800 rounded-2xl p-8 hover:bg-neutral-900/80 transition-colors">
              <h3 className="font-semibold text-neutral-100 mb-3 text-lg">
                How is this different from Stripe Connect earnings?
              </h3>
              <p className="text-neutral-400 leading-relaxed">
                Coach Pro is a subscription for enhanced platform features, while Stripe Connect handles your coaching session payments. They're separate systems that work together.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 