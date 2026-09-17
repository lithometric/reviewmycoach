'use client';

import { useState, useEffect, Suspense } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../lib/firebase-client';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface MarketplaceCard {
  id: string;
  name: string;
  description?: string;
  imageUrl: string;
  price: number;
  isActive: boolean;
}

interface UserCard {
  id: string;
  cardId: string;
  name: string;
  imageUrl: string;
  purchasedAt: any;
}

function CardsMarketplaceContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [marketplaceCards, setMarketplaceCards] = useState<MarketplaceCard[]>([]);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        loadCards();
      }
      // Middleware handles authentication redirects
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Check for purchase success
    if (searchParams.get('purchase') === 'success') {
      const cardId = searchParams.get('cardId');
      if (cardId) {
        alert('Card purchased successfully! It has been added to your collection.');
        loadCards();
        // Clean up URL
        router.replace('/cards-marketplace');
      }
    }
  }, [searchParams, router]);

  const loadCards = async () => {
    if (!user) return;

    try {
      // Load coach profile image
      try {
        const roleResponse = await fetch(`/api/auth/user-role?userId=${user.uid}`);
        if (roleResponse.ok) {
          const userData = await roleResponse.json();
          const username = userData.username;

          if (username) {
            const coachResponse = await fetch(`/api/coaches/by-username/${username.toLowerCase()}`);
            if (coachResponse.ok) {
              const coachData = await coachResponse.json();
              setProfileImage(coachData.coach?.profileImage || null);
            }
          }
        }
      } catch (error) {
        console.error('Error loading profile image:', error);
      }

      // Load marketplace cards
      const marketplaceResponse = await fetch('/api/cards/marketplace');
      if (marketplaceResponse.ok) {
        const marketplaceData = await marketplaceResponse.json();
        setMarketplaceCards(marketplaceData.cards || []);
      }

      // Load user's owned cards
      const idToken = await user.getIdToken();
      const userCardsResponse = await fetch(
        `/api/cards/user?userId=${user.uid}&idToken=${encodeURIComponent(idToken)}`
      );
      if (userCardsResponse.ok) {
        const userCardsData = await userCardsResponse.json();
        setUserCards(userCardsData.cards || []);
      }
    } catch (error) {
      console.error('Error loading cards:', error);
    }
  };

  const handlePurchase = async (cardId: string) => {
    if (!user) {
      router.push('/signin');
      return;
    }

    setPurchasing(cardId);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/cards/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardId,
          userId: user.uid,
          idToken,
        }),
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start purchase. Please try again.');
        setPurchasing(null);
      }
    } catch (error) {
      console.error('Error purchasing card:', error);
      alert('Error starting purchase. Please try again.');
      setPurchasing(null);
    }
  };

  const isOwned = (cardId: string) => {
    return userCards.some((card) => card.cardId === cardId);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Profile Cards Marketplace</h1>
        <p className="text-gray-600">
          Customize your coach profile with unique profile cards. Each card is a one-time purchase.
        </p>
      </div>

      {/* Cards Owned Badge */}
      {userCards.length > 0 && (
        <div className="mb-6">
          <div className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            {userCards.length} Card{userCards.length !== 1 ? 's' : ''} Owned
          </div>
        </div>
      )}

      {/* Cards Grid */}
      {marketplaceCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {marketplaceCards.map((card) => {
            const owned = isOwned(card.id);
            return (
              <div
                key={card.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Card Image with Profile Picture Behind */}
                <div className="relative w-full aspect-[4/5] bg-gray-100 overflow-hidden">
                  {/* Profile Picture (Behind - Static/Relative) */}
                  {profileImage ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={profileImage}
                        alt="Profile"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="relative w-full h-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {/* Card Image (On Top - Absolute Position) */}
                  {card.imageUrl ? (
                    <div className="absolute inset-0 z-10">
                      <Image
                        src={card.imageUrl}
                        alt={card.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center text-white">
                      No Card Image
                    </div>
                  )}
                  {owned && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium z-20">
                      Owned
                    </div>
                  )}
                </div>

                {/* Card Info */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{card.name}</h3>
                  {card.description && (
                    <p className="text-sm text-gray-600 mb-3">{card.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-gray-900">${card.price}</span>
                    {owned ? (
                      <Link
                        href="/dashboard/coach/profile/edit"
                        className="px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-black transition-colors text-sm font-medium"
                      >
                        Use Card
                      </Link>
                    ) : (
                      <button
                        onClick={() => handlePurchase(card.id)}
                        disabled={purchasing === card.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {purchasing === card.id ? 'Processing...' : 'Purchase'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No cards available</h3>
          <p className="mt-2 text-sm text-gray-600">
            Check back soon for new profile cards!
          </p>
        </div>
      )}
    </div>
  );
}

export default function CardsMarketplace() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading...</div></div>}>
      <CardsMarketplaceContent />
    </Suspense>
  );
}

