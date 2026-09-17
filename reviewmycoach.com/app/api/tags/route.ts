import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '../../lib/firebase-admin-server';
import { auth } from '../../lib/firebase-admin';
import { toDateSafe } from '../../lib/pgdb';

interface TagData {
  id: string;
  name: string;
  category: 'sport' | 'specialty' | 'certification' | 'skill';
  count: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  [key: string]: unknown;
}

// GET - Fetch all tags
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get('category');
    const activeOnlyParam = searchParams.get('activeOnly') === 'true';

    const tagsSnapshot = await adminDb.collection('tags').orderBy('name', 'asc').get();
    let tags: TagData[] = tagsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDateSafe(doc.data()?.createdAt)?.toISOString() || null,
      updatedAt: toDateSafe(doc.data()?.updatedAt)?.toISOString() || null,
    } as TagData));

    // Filter by category if specified
    if (categoryParam) {
      tags = tags.filter(tag => tag.category === categoryParam);
    }

    // Filter active only if specified
    if (activeOnlyParam) {
      tags = tags.filter(tag => tag.isActive);
    }

    return NextResponse.json({ tags });

  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new tag (admin only)
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin access
    await auth.verifyIdToken(token);
    // Note: In production, you'd check if user has admin role
    
    const body = await request.json();
    const { name, category } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.length < 2) {
      return NextResponse.json({ 
        error: 'Tag name must be at least 2 characters long' 
      }, { status: 400 });
    }

    if (!category || !['sport', 'specialty', 'certification', 'skill'].includes(category)) {
      return NextResponse.json({ 
        error: 'Category must be one of: sport, specialty, certification, skill' 
      }, { status: 400 });
    }

    const tagData = {
      name: name.trim(),
      category,
      count: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const tagRef = await adminDb.collection('tags').add(tagData);

    return NextResponse.json({ 
      success: true, 
      tagId: tagRef.id,
      message: 'Tag created successfully' 
    });

  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update tag count (internal use)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { tagId, increment: incrementValue } = body;

    if (!tagId) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    await adminDb.collection('tags').doc(tagId).update({
      count: incrementValue || 1,
      updatedAt: new Date()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Tag updated successfully' 
    });

  } catch (error) {
    console.error('Error updating tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

 