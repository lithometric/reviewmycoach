'use client';

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../../lib/firebase-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CoachFormData {
  displayName: string;
  email: string;
  username: string;
  bio: string;
  sports: string[];
  experience: number;
  certifications: string[];
  hourlyRate: number;
  location: string;
  specialties: string[];
  languages: string[];
  phoneNumber: string;
  website: string;
  organization: string;
  role: string;
  gender: string;
  ageGroup: string[];
  sourceUrl: string;
  socialMedia: {
    instagram: string;
    twitter: string;
    linkedin: string;
  };
}

interface ExistingCoach {
  id: string;
  displayName: string;
  email: string;
  sports: string[];
  role: string;
  organization: string;
  isClaimed: boolean;
  createdAt: any;
}

interface Tag {
  id: string;
  name: string;
  category: string;
}

export default function CoachOnboarding() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [mode, setMode] = useState<'create' | 'edit' | 'browse'>('browse');
  const [existingCoaches, setExistingCoaches] = useState<ExistingCoach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSport, setFilterSport] = useState('');
  const [formData, setFormData] = useState<CoachFormData>({
    displayName: '',
    email: '',
    username: '',
    bio: '',
    sports: [],
    experience: 0,
    certifications: [],
    hourlyRate: 0,
    location: '',
    specialties: [],
    languages: ['English'],
    phoneNumber: '',
    website: '',
    organization: '',
    role: '',
    gender: '',
    ageGroup: [],
    sourceUrl: '',
    socialMedia: {
      instagram: '',
      twitter: '',
      linkedin: ''
    }
  });

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        await checkAdminAccess(user);
      } else {
        router.push('/signin');
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const checkAdminAccess = async (user: User) => {
    try {
      const response = await fetch(`/api/auth/user-role?userId=${user.uid}`);

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
      await fetchTags();
      await fetchExistingCoaches();
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      if (response.ok) {
        const data = await response.json();
        setAvailableTags((data.tags || []) as Tag[]);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchExistingCoaches = async () => {
    try {
      const response = await fetch('/api/coaches?limit=200');
      if (response.ok) {
        const data = await response.json();
        const coaches: ExistingCoach[] = ((data.coaches || []) as any[]).map((c) => ({
          id: c.id,
          displayName: c.displayName || '',
          email: c.email || '',
          sports: c.sports || [],
          role: c.role || '',
          organization: c.organization || '',
          isClaimed: c.isClaimed || false,
          createdAt: c.createdAt,
        }));
        setExistingCoaches(coaches.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      }
    } catch (error) {
      console.error('Error fetching coaches:', error);
    }
  };

  const loadCoachForEditing = async (coachId: string) => {
    try {
      const response = await fetch(`/api/coaches/${coachId}`);

      if (response.ok) {
        const payload = await response.json();
        const data = payload.coach || payload;
        setFormData({
          displayName: data.displayName || '',
          email: data.email || '',
          username: data.username || '',
          bio: data.bio || '',
          sports: data.sports || [],
          experience: data.experience || 0,
          certifications: data.certifications || [],
          hourlyRate: data.hourlyRate || 0,
          location: data.location || '',
          specialties: data.specialties || [],
          languages: data.languages || ['English'],
          phoneNumber: data.phoneNumber || '',
          website: data.website || '',
          organization: data.organization || '',
          role: data.role || '',
          gender: data.gender || '',
          ageGroup: data.ageGroup || [],
          sourceUrl: data.sourceUrl || '',
          socialMedia: data.socialMedia || {
            instagram: '',
            twitter: '',
            linkedin: ''
          }
        });
        setSelectedCoachId(coachId);
        setMode('edit');
      }
    } catch (error) {
      console.error('Error loading coach for editing:', error);
      alert('Error loading coach data');
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof CoachFormData] as object),
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleArrayChange = (field: 'sports' | 'certifications' | 'specialties' | 'languages' | 'ageGroup', value: string) => {
    setFormData(prev => {
      const currentArray = prev[field];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      
      if (field === 'sports') {
        return { ...prev, sports: newArray };
      } else if (field === 'certifications') {
        return { ...prev, certifications: newArray };
      } else if (field === 'specialties') {
        return { ...prev, specialties: newArray };
      } else if (field === 'languages') {
        return { ...prev, languages: newArray };
      } else if (field === 'ageGroup') {
        return { ...prev, ageGroup: newArray };
      }
      return prev;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        username: formData.username,
        displayName: formData.displayName,
        email: formData.email,
        bio: formData.bio,
        sports: formData.sports,
        experience: formData.experience,
        certifications: formData.certifications,
        hourlyRate: formData.hourlyRate,
        location: formData.location,
        specialties: formData.specialties,
        languages: formData.languages,
        organization: formData.organization,
        role: formData.role,
        gender: formData.gender,
        ageGroup: formData.ageGroup,
        sourceUrl: formData.sourceUrl,
        phoneNumber: formData.phoneNumber,
        website: formData.website,
        socialMedia: formData.socialMedia,
      };

      const isEdit = mode === 'edit' && !!selectedCoachId;
      const response = await fetch(
        isEdit ? `/api/admin/coaches/${encodeURIComponent(selectedCoachId as string)}` : '/api/admin/coaches',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      alert(`Coach profile ${isEdit ? 'updated' : 'created'} successfully!`);
      await fetchExistingCoaches();
      setMode('browse');
      resetForm();
    } catch (error) {
      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} coach profile:`, error);
      alert(`Error ${mode === 'edit' ? 'updating' : 'creating'} coach profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      displayName: '',
      email: '',
      username: '',
      bio: '',
      sports: [],
      experience: 0,
      certifications: [],
      hourlyRate: 0,
      location: '',
      specialties: [],
      languages: ['English'],
      phoneNumber: '',
      website: '',
      organization: '',
      role: '',
      gender: '',
      ageGroup: [],
      sourceUrl: '',
      socialMedia: {
        instagram: '',
        twitter: '',
        linkedin: ''
      }
    });
    setSelectedCoachId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">You don't have admin privileges.</p>
        </div>
      </div>
    );
  }

  const sportTags = availableTags.filter(tag => tag.category === 'sport');
  const specialtyTags = availableTags.filter(tag => tag.category === 'specialty');
  const certificationTags = availableTags.filter(tag => tag.category === 'certification');

  // Filter coaches based on search and sport filter
  const filteredCoaches = existingCoaches.filter(coach => {
    const matchesSearch = searchTerm === '' || 
      coach.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coach.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coach.role.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSport = filterSport === '' || coach.sports.includes(filterSport);
    
    return matchesSearch && matchesSport;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {mode === 'browse' ? 'Manage Coaches' : mode === 'edit' ? 'Edit Coach' : 'Add New Coach'}
              </h1>
              <p className="text-sm text-gray-600">
                {mode === 'browse' ? 'Browse and edit existing coaches or create new ones' : 
                 mode === 'edit' ? 'Update coach profile information' : 
                 'Create a new coach profile manually'}
              </p>
            </div>
            <div className="flex space-x-3">
              {mode !== 'browse' && (
                <button
                  onClick={() => {
                    setMode('browse');
                    resetForm();
                  }}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
                >
                  Back to Browse
                </button>
              )}
              <Link
                href="/admin"
                className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
              >
                Back to Admin
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Browse Coaches */}
      {mode === 'browse' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Controls */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <div>
                  <input
                    type="text"
                    placeholder="Search coaches..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <select
                    value={filterSport}
                    onChange={(e) => setFilterSport(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Sports</option>
                    {sportTags.map((sport) => (
                      <option key={sport.id} value={sport.name}>{sport.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => setMode('create')}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Add New Coach
              </button>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Found {filteredCoaches.length} of {existingCoaches.length} coaches
            </div>
          </div>

          {/* Coaches List */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Existing Coaches</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {filteredCoaches.length > 0 ? (
                filteredCoaches.map((coach) => (
                  <div key={coach.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{coach.displayName}</p>
                            <p className="text-sm text-gray-500">{coach.email}</p>
                          </div>
                          {coach.isClaimed && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Claimed
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>{coach.role}</span>
                          <span>•</span>
                          <span>{coach.organization}</span>
                          <span>•</span>
                          <span>{coach.sports.join(', ') || 'No sports listed'}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => loadCoachForEditing(coach.id)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="text-gray-500">No coaches found matching your criteria</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {(mode === 'create' || mode === 'edit') && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
              <div className="md:col-span-1">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Basic Information</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Essential coach details and contact information.
                </p>
              </div>
              <div className="mt-5 md:mt-0 md:col-span-2">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="displayName"
                      id="displayName"
                      required
                      value={formData.displayName}
                      onChange={(e) => handleInputChange('displayName', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Username *
                    </label>
                    <input
                      type="text"
                      name="username"
                      id="username"
                      required
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="unique_username"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      3-20 characters, lowercase letters, numbers, and underscores only
                    </p>
                  </div>

                  <div className="col-span-6">
                    <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                      Bio / Description
                    </label>
                    <textarea
                      id="bio"
                      name="bio"
                      rows={4}
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="Tell us about this coach's background and expertise..."
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      id="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                      Website
                    </label>
                    <input
                      type="url"
                      name="website"
                      id="website"
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="https://"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Professional Details */}
          <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
              <div className="md:col-span-1">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Professional Details</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Coaching experience, rates, and location information.
                </p>
              </div>
              <div className="mt-5 md:mt-0 md:col-span-2">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="experience" className="block text-sm font-medium text-gray-700">
                      Years of Experience
                    </label>
                    <input
                      type="number"
                      name="experience"
                      id="experience"
                      min="0"
                      value={formData.experience}
                      onChange={(e) => handleInputChange('experience', parseInt(e.target.value) || 0)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="hourlyRate" className="block text-sm font-medium text-gray-700">
                      Hourly Rate ($)
                    </label>
                    <input
                      type="number"
                      name="hourlyRate"
                      id="hourlyRate"
                      min="0"
                      step="0.01"
                      value={formData.hourlyRate}
                      onChange={(e) => handleInputChange('hourlyRate', parseFloat(e.target.value) || 0)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="col-span-6">
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                      Location
                    </label>
                    <input
                      type="text"
                      name="location"
                      id="location"
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="City, State"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Coach Information */}
          <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
              <div className="md:col-span-1">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Additional Information</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Organization, role, and demographic information.
                </p>
              </div>
              <div className="mt-5 md:mt-0 md:col-span-2">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="organization" className="block text-sm font-medium text-gray-700">
                      Organization / School / Club
                    </label>
                    <input
                      type="text"
                      name="organization"
                      id="organization"
                      value={formData.organization}
                      onChange={(e) => handleInputChange('organization', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="e.g. XYZ High School, ABC Athletic Club"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Coaching Role
                    </label>
                    <select
                      id="role"
                      name="role"
                      value={formData.role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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

                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
                      Gender
                    </label>
                    <select
                      id="gender"
                      name="gender"
                      value={formData.gender}
                      onChange={(e) => handleInputChange('gender', e.target.value)}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>

                  <div className="col-span-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Age Groups</label>
                    <p className="text-sm text-gray-500 mb-3">Select all age groups you coach</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['Youth (Under 12)', 'Junior (12-16)', 'High School (14-18)', 'College (18-22)', 'Adult (22+)', 'Senior (55+)', 'All Ages'].map((ageGroup) => (
                        <label key={ageGroup} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.ageGroup.includes(ageGroup)}
                            onChange={() => handleArrayChange('ageGroup', ageGroup)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{ageGroup}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-6">
                    <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-700">
                      Source URL
                    </label>
                    <input
                      type="url"
                      name="sourceUrl"
                      id="sourceUrl"
                      value={formData.sourceUrl}
                      onChange={(e) => handleInputChange('sourceUrl', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="https://example.com/coach-profile"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Optional URL where this coach profile was sourced from
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sports & Specialties */}
          <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
              <div className="md:col-span-1">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Sports & Specialties</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select the sports and specialties this coach offers.
                </p>
              </div>
              <div className="mt-5 md:mt-0 md:col-span-2">
                <div className="space-y-6">
                  {/* Sports */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sports</label>
                    <div className="grid grid-cols-2 gap-2">
                      {sportTags.map((sport) => (
                        <label key={sport.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.sports.includes(sport.name)}
                            onChange={() => handleArrayChange('sports', sport.name)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{sport.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Specialties */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Specialties</label>
                    <div className="grid grid-cols-2 gap-2">
                      {specialtyTags.map((specialty) => (
                        <label key={specialty.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.specialties.includes(specialty.name)}
                            onChange={() => handleArrayChange('specialties', specialty.name)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{specialty.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Certifications */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Certifications</label>
                    <div className="grid grid-cols-2 gap-2">
                      {certificationTags.map((cert) => (
                        <label key={cert.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.certifications.includes(cert.name)}
                            onChange={() => handleArrayChange('certifications', cert.name)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{cert.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Social Media */}
          <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
              <div className="md:col-span-1">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Social Media</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Optional social media profiles for the coach.
                </p>
              </div>
              <div className="mt-5 md:mt-0 md:col-span-2">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-2">
                    <label htmlFor="instagram" className="block text-sm font-medium text-gray-700">
                      Instagram
                    </label>
                    <input
                      type="text"
                      name="instagram"
                      id="instagram"
                      value={formData.socialMedia.instagram}
                      onChange={(e) => handleInputChange('socialMedia.instagram', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="@username"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label htmlFor="twitter" className="block text-sm font-medium text-gray-700">
                      Twitter
                    </label>
                    <input
                      type="text"
                      name="twitter"
                      id="twitter"
                      value={formData.socialMedia.twitter}
                      onChange={(e) => handleInputChange('socialMedia.twitter', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="@username"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700">
                      LinkedIn
                    </label>
                    <input
                      type="text"
                      name="linkedin"
                      id="linkedin"
                      value={formData.socialMedia.linkedin}
                      onChange={(e) => handleInputChange('socialMedia.linkedin', e.target.value)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="linkedin.com/in/username"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {mode === 'edit' ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                mode === 'edit' ? 'Update Coach Profile' : 'Create Coach Profile'
              )}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  );
} 

// Metadata cannot be exported from a client component; handled at a parent layout/route.