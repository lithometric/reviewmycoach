'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../../../lib/firebase-client';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
import Link from 'next/link';

interface CoachProfile {
  userId: string;
  displayName: string;
  bio: string;
  sports: string[];
  experience: number;
  certifications: string[];
  hourlyRate: number;
  location: string;
  availability: string[];
  specialties: string[];
  languages: string[];
  organization?: string;
  school?: string;
  role?: string;
  gender?: string;
  ageGroup?: string[];
  sourceUrl?: string;
  profileImage?: string;
  phoneNumber?: string;
  website?: string;
  email?: string;
  emailVerified?: boolean;
  isPublic?: boolean;
  socialMedia: {
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
}

const availableSports = [
  'Basketball', 'Football', 'Soccer', 'Tennis', 'Baseball', 'Volleyball',
  'Swimming', 'Track & Field', 'Golf', 'Wrestling', 'Boxing', 'MMA',
  'Fitness Training', 'Yoga', 'Pilates', 'CrossFit', 'Personal Training'
];

const availabilityOptions = [
  'Monday Morning', 'Monday Afternoon', 'Monday Evening',
  'Tuesday Morning', 'Tuesday Afternoon', 'Tuesday Evening',
  'Wednesday Morning', 'Wednesday Afternoon', 'Wednesday Evening',
  'Thursday Morning', 'Thursday Afternoon', 'Thursday Evening',
  'Friday Morning', 'Friday Afternoon', 'Friday Evening',
  'Saturday Morning', 'Saturday Afternoon', 'Saturday Evening',
  'Sunday Morning', 'Sunday Afternoon', 'Sunday Evening'
];

export default function EditCoachProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CoachProfile>({
    userId: '',
    displayName: '',
    bio: '',
    sports: [],
    experience: 0,
    certifications: [],
    hourlyRate: 0,
    location: '',
    availability: [],
    specialties: [],
    languages: ['English'],
    organization: '',
    school: '',
    role: '',
    gender: '',
    ageGroup: [],
    sourceUrl: '',
    socialMedia: {}
  });
  const [newCertification, setNewCertification] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [userCards, setUserCards] = useState<any[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const router = useRouter();

  const loadCoachProfile = useCallback(async (userId: string) => {
    try {
      // Resolve the coach's username, then load the coach profile from the API
      const userRes = await fetch(`/api/user/profile?userId=${encodeURIComponent(userId)}`);
      const username = userRes.ok ? (await userRes.json()).username : null;

      let data: Partial<CoachProfile> | null = null;
      if (username) {
        const coachRes = await fetch(`/api/coaches/by-username/${String(username).toLowerCase()}`);
        if (coachRes.ok) {
          const payload = await coachRes.json();
          data = payload.coach || null;
        }
      }

      if (data) {
        setFormData(prev => ({
          ...prev,
          ...data,
          userId: data.userId || userId,
          sports: data.sports || [],
          certifications: data.certifications || [],
          availability: data.availability || [],
          specialties: data.specialties || [],
          languages: data.languages || [],
          ageGroup: data.ageGroup || [],
          socialMedia: data.socialMedia || {}
        }));
      } else {
        // Initialize with user data if coach profile doesn't exist
        setFormData(prev => ({
          ...prev,
          userId: userId,
          displayName: user?.displayName || '',
        }));
      }
    } catch (error) {
      console.error('Error loading coach profile:', error);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        await loadCoachProfile(user.uid);
        await loadUserCards(user.uid);
      } else {
        router.push('/signin');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, loadCoachProfile]);

  const loadUserCards = async (userId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setLoadingCards(true);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(
        `/api/cards/user?userId=${userId}&idToken=${encodeURIComponent(idToken)}`
      );
      if (response.ok) {
        const data = await response.json();
        setUserCards(data.cards || []);

        // Get active card from user profile
        const userRes = await fetch(`/api/user/profile?userId=${encodeURIComponent(userId)}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setActiveCardId(userData?.activeProfileCard || null);
        }
      }
    } catch (error) {
      console.error('Error loading user cards:', error);
    } finally {
      setLoadingCards(false);
    }
  };

  const handleSetActiveCard = async (cardId: string) => {
    if (!user) return;
    
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/cards/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          cardId,
          idToken,
        }),
      });

      if (response.ok) {
        setActiveCardId(cardId);
        alert('Active card updated successfully!');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update active card');
      }
    } catch (error) {
      console.error('Error setting active card:', error);
      alert('Error updating active card. Please try again.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name.startsWith('socialMedia.')) {
      const socialField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        socialMedia: {
          ...prev.socialMedia,
          [socialField]: value
        }
      }));
    } else if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: parseFloat(value) || 0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Simple client-side image compression using Canvas
  const compressImage = (file: File, maxDim: number, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Compression failed'));
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle profile image upload with compression and Firebase Storage
  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      setUploading(true);
      // Basic client-side validation
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }

      // Compress image on client
      const compressedBlob = await compressImage(file, 1200, 0.8);

      // Upload to Firebase Storage under coaches/{userId}/profile.jpg
      const objectRef = storageRef(storage, `coaches/${user.uid}/profile.jpg`);
      const uploadRes = await uploadBytes(objectRef, compressedBlob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(uploadRes.ref);

      // Update local preview immediately
      setLocalPreview(url);

      // Save URL to Data Connect via API
      const token = await user.getIdToken();
      const fallbackUsername = user.displayName?.toLowerCase().replace(/\s+/g, '_') || user.uid;

      // Try to get coach username from the user profile API first
      const userRes = await fetch(`/api/user/profile?userId=${encodeURIComponent(user.uid)}`);
      const coachUsername = (userRes.ok ? (await userRes.json()).username : null) || fallbackUsername;

      const updateResponse = await fetch(`/api/coaches/by-username/${coachUsername}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          profileImage: url
        })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to save profile image to database');
      }

      // Reflect in form state
      setFormData(prev => ({ ...prev, profileImage: url }));
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Failed to upload image. Please try a different file.');
    } finally {
      setUploading(false);
    }
  };

  const handleSportToggle = (sport: string) => {
    setFormData(prev => {
      const currentSports = prev.sports || [];
      return {
        ...prev,
        sports: currentSports.includes(sport)
          ? currentSports.filter(s => s !== sport)
          : [...currentSports, sport]
      };
    });
  };

  const handleAvailabilityToggle = (slot: string) => {
    setFormData(prev => {
      const currentAvailability = prev.availability || [];
      return {
        ...prev,
        availability: currentAvailability.includes(slot)
          ? currentAvailability.filter(s => s !== slot)
          : [...currentAvailability, slot]
      };
    });
  };

  const addCertification = () => {
    const currentCerts = formData.certifications || [];
    if (newCertification.trim() && !currentCerts.includes(newCertification.trim())) {
      setFormData(prev => ({
        ...prev,
        certifications: [...currentCerts, newCertification.trim()]
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (certification: string) => {
    setFormData(prev => ({
      ...prev,
      certifications: (prev.certifications || []).filter(c => c !== certification)
    }));
  };

  const addSpecialty = () => {
    const currentSpecialties = formData.specialties || [];
    if (newSpecialty.trim() && !currentSpecialties.includes(newSpecialty.trim())) {
      setFormData(prev => ({
        ...prev,
        specialties: [...currentSpecialties, newSpecialty.trim()]
      }));
      setNewSpecialty('');
    }
  };

  const removeSpecialty = (specialty: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: (prev.specialties || []).filter(s => s !== specialty)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      // Get coach username from the user profile API
      const userRes = await fetch(`/api/user/profile?userId=${encodeURIComponent(user.uid)}`);
      const coachUsername = userRes.ok ? (await userRes.json()).username : null;

      if (!coachUsername) {
        alert('Coach username not found. Please complete onboarding first.');
        setSaving(false);
        return;
      }

      // Save to Data Connect via API
      const token = await user.getIdToken();
      const updateResponse = await fetch(`/api/coaches/by-username/${coachUsername}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: formData.displayName,
          bio: formData.bio,
          location: formData.location,
          hourlyRate: formData.hourlyRate,
          phoneNumber: formData.phoneNumber,
          profileImage: formData.profileImage || localPreview,
          school: formData.school,
        })
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(error.error || 'Failed to save profile');
      }

      router.push('/dashboard/coach');
    } catch (error) {
      console.error('Error saving coach profile:', error);
      alert('Error saving profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };



  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Edit Coach Profile</h1>
        <p className="mt-2 text-gray-600">
          Complete your profile to attract more students and showcase your expertise.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Profile photo uploader */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Profile Photo</label>
              <div className="flex items-start gap-4">
                <div className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-800 border border-gray-700">
                  {localPreview || formData.profileImage ? (
                    <img src={(localPreview || formData.profileImage)!} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">No photo</div>
                  )}
                </div>
                <div>
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} className="block text-sm text-white" />
                  <p className="text-xs text-gray-400 mt-2">JPG/PNG, auto-compressed before upload.</p>
                  {uploading && <p className="text-xs text-gray-300 mt-1">Uploading...</p>}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Display Name
              </label>
              <input
                type="text"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Location
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="City, State"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Years of Experience
              </label>
              <input
                type="number"
                name="experience"
                value={formData.experience}
                onChange={handleInputChange}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Hourly Rate ($)
              </label>
              <input
                type="number"
                name="hourlyRate"
                value={formData.hourlyRate}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-white mb-2">
              Bio
            </label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              rows={4}
              placeholder="Tell students about your coaching philosophy, background, and what makes you unique..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>
        </div>

        {/* Sports & Specialties */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sports & Specialties</h2>
          
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Sports You Coach
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableSports.map(sport => (
                <label key={sport} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={(formData.sports || []).includes(sport)}
                    onChange={() => handleSportToggle(sport)}
                    className="mr-2 h-4 w-4 text-white focus:ring-gray-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-white">{sport}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-white mb-2">
              Specialties
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.specialties.map(specialty => (
                <span
                  key={specialty}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-800 text-white"
                >
                  {specialty}
                  <button
                    type="button"
                    onClick={() => removeSpecialty(specialty)}
                    className="ml-1 text-white hover:text-gray-300"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                placeholder="Add a specialty..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
              <button
                type="button"
                onClick={addSpecialty}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Certifications */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Certifications</h2>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.certifications.map(cert => (
              <span
                key={cert}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
              >
                {cert}
                <button
                  type="button"
                  onClick={() => removeCertification(cert)}
                  className="ml-1 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCertification}
              onChange={(e) => setNewCertification(e.target.value)}
              placeholder="Add a certification..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
            <button
              type="button"
              onClick={addCertification}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Add
            </button>
          </div>
        </div>

        {/* Availability */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Availability</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {availabilityOptions.map(slot => (
              <label key={slot} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.availability.includes(slot)}
                  onChange={() => handleAvailabilityToggle(slot)}
                  className="mr-2 h-4 w-4 text-white focus:ring-gray-500 border-gray-300 rounded"
                />
                <span className="text-sm text-white">{slot}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Additional Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Organization / Club
              </label>
              <input
                type="text"
                name="organization"
                value={formData.organization || ''}
                onChange={handleInputChange}
                placeholder="e.g. ABC Athletic Club, Local YMCA"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                School / University
              </label>
              <input
                type="text"
                name="school"
                value={formData.school || ''}
                onChange={handleInputChange}
                placeholder="e.g. Princeton University, XYZ High School"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Coaching Role
              </label>
              <select
                name="role"
                value={formData.role || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value="">Select Role</option>
                <option value="Head Coach">Head Coach</option>
                <option value="Assistant Coach">Assistant Coach</option>
                <option value="Strength & Conditioning Coach">Strength & Conditioning Coach</option>
                <option value="Skills Coach">Skills Coach</option>
                <option value="Goalkeeper Coach">Goalkeeper Coach</option>
                <option value="Position Coach">Position Coach</option>
                <option value="Private Instructor">Private Instructor</option>
                <option value="Team Coach">Team Coach</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Gender
              </label>
              <select
                name="gender"
                value={formData.gender || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Source URL
              </label>
              <input
                type="url"
                name="sourceUrl"
                value={formData.sourceUrl || ''}
                onChange={handleInputChange}
                placeholder="https://example.com/coach-profile"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Optional URL where this coach profile was sourced from
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-white mb-3">
              Age Groups You Coach
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {['Youth (Under 12)', 'Junior (12-16)', 'High School (14-18)', 'College (18-22)', 'Adult (22+)', 'Senior (55+)', 'All Ages'].map(ageGroup => (
                <label key={ageGroup} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={(formData.ageGroup || []).includes(ageGroup)}
                    onChange={() => {
                      const currentAgeGroups = formData.ageGroup || [];
                      const newAgeGroups = currentAgeGroups.includes(ageGroup)
                        ? currentAgeGroups.filter(ag => ag !== ageGroup)
                        : [...currentAgeGroups, ageGroup];
                      setFormData(prev => ({ ...prev, ageGroup: newAgeGroups }));
                    }}
                    className="mr-2 h-4 w-4 text-white focus:ring-gray-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-white">{ageGroup}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Contact & Social Media */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Contact & Social Media</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Website
              </label>
              <input
                type="url"
                name="website"
                value={formData.website || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Instagram
              </label>
              <input
                type="text"
                name="socialMedia.instagram"
                value={formData.socialMedia.instagram || ''}
                onChange={handleInputChange}
                placeholder="@username"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Twitter
              </label>
              <input
                type="text"
                name="socialMedia.twitter"
                value={formData.socialMedia.twitter || ''}
                onChange={handleInputChange}
                placeholder="@username"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Profile Cards */}
        <div className="bg-neutral-900 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Profile Cards</h2>
              <p className="text-sm text-gray-500 mt-1">
                Customize your coach profile with unique profile cards
              </p>
            </div>
            <Link
              href="/cards-marketplace"
              className="px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Browse Marketplace
            </Link>
          </div>

          {loadingCards ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
            </div>
          ) : userCards.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {userCards.map((card) => {
                const isActive = activeCardId === card.cardId;
                return (
                  <div
                    key={card.id}
                    className={`relative border-2 rounded-xl overflow-hidden transition-all ${
                      isActive
                        ? 'border-red-600 ring-2 ring-red-200'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {/* Card Image with Profile Picture Behind */}
                    <div className="relative w-full aspect-[4/5] bg-gray-100 overflow-hidden">
                      {/* Profile Picture (Behind - Static/Relative) */}
                      {formData.profileImage ? (
                        <div className="relative w-full h-full">
                          <NextImage
                            src={formData.profileImage}
                            alt="Profile"
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="relative w-full h-full bg-gray-200 flex items-center justify-center">
                          <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      {/* Card Image (On Top - Absolute Position) */}
                      {card.imageUrl ? (
                        <div className="absolute inset-0 z-10">
                          <NextImage
                            src={card.imageUrl}
                            alt={card.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-0 z-10 bg-black bg-opacity-50 flex items-center justify-center text-white text-xs">
                          No Card Image
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium z-20">
                          Active
                        </div>
                      )}
                    </div>

                    {/* Card Info */}
                    <div className="p-3 bg-white">
                      <h4 className="text-sm font-medium text-gray-900 truncate mb-1">
                        {card.name}
                      </h4>
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActiveCard(card.cardId)}
                          className="w-full px-3 py-1.5 bg-gray-900 text-white rounded-md hover:bg-black transition-colors text-xs font-medium"
                        >
                          Set as Active
                        </button>
                      )}
                      {isActive && (
                        <div className="w-full px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium text-center">
                          Currently Active
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 border border-gray-200 rounded-xl">
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
              <h3 className="mt-4 text-sm font-medium text-gray-900">No cards yet</h3>
              <p className="mt-2 text-sm text-gray-600">
                Visit the marketplace to purchase your first profile card!
              </p>
              <Link
                href="/cards-marketplace"
                className="mt-4 inline-block px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Browse Marketplace
              </Link>
            </div>
          )}
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
} 