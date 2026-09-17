import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin-server';
import { auth } from '../../../lib/firebase-admin';
// Predefined tags data
const PREDEFINED_TAGS = {
  sports: [
    'Basketball', 'Soccer', 'Tennis', 'Swimming', 'Baseball', 'Football', 
    'Volleyball', 'Golf', 'Track & Field', 'Gymnastics', 'Wrestling', 
    'Boxing', 'Martial Arts', 'Hockey', 'Lacrosse', 'Softball', 'Cricket'
  ],
  specialties: [
    'Youth Development', 'Elite Performance', 'Injury Recovery', 
    'Mental Coaching', 'Strength Training', 'Endurance Training',
    'Technical Skills', 'Team Strategy', 'Individual Training',
    'Competition Prep', 'Fitness Training', 'Beginner Friendly'
  ],
  certifications: [
    'NASM Certified', 'ACSM Certified', 'USA Coaching Certified',
    'Olympic Coaching License', 'SafeSport Certified', 'CPR Certified',
    'First Aid Certified', 'Youth Sports Certified'
  ]
};

// POST - Initialize tags collection with predefined values (admin only)
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin access (you might want to add proper admin role checking)
    await auth.verifyIdToken(token);
    
    const tagsRef = adminDb.collection('tags');
    let createdCount = 0;
    let skippedCount = 0;

    // Check if tags already exist to avoid duplicates
    const existingTagsSnapshot = await tagsRef.get();
    const existingTagNames = new Set(
      existingTagsSnapshot.docs.map(doc => doc.data()?.name.toLowerCase())
    );

    // Initialize sports tags
    for (const sport of PREDEFINED_TAGS.sports) {
      if (!existingTagNames.has(sport.toLowerCase())) {
        await tagsRef.add({
          name: sport,
          category: 'sport',
          count: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdCount++;
      } else {
        skippedCount++;
      }
    }

    // Initialize specialty tags
    for (const specialty of PREDEFINED_TAGS.specialties) {
      if (!existingTagNames.has(specialty.toLowerCase())) {
        await tagsRef.add({
          name: specialty,
          category: 'specialty',
          count: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdCount++;
      } else {
        skippedCount++;
      }
    }

    // Initialize certification tags
    for (const certification of PREDEFINED_TAGS.certifications) {
      if (!existingTagNames.has(certification.toLowerCase())) {
        await tagsRef.add({
          name: certification,
          category: 'certification',
          count: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdCount++;
      } else {
        skippedCount++;
      }
    }

    return NextResponse.json({ 
      success: true,
      message: `Tags initialization completed. Created: ${createdCount}, Skipped: ${skippedCount}`,
      created: createdCount,
      skipped: skippedCount
    });

  } catch (error) {
    console.error('Error initializing tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 