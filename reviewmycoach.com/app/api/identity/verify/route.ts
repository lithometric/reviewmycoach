import { NextRequest, NextResponse } from 'next/server';
import { toDateSafe } from '../../../lib/pgdb';

// Function to get Firebase instances
async function getFirebaseInstances() {
  try {
    const firebaseAdminModule = await import('../../../lib/firebase-admin');
    return {
      auth: firebaseAdminModule.auth,
      db: firebaseAdminModule.db
    };
  } catch (error) {
    console.error('Failed to load Firebase Admin in identity verify route:', error);
    return { auth: null, db: null };
  }
}

// POST - Submit identity verification with driver's license
export async function POST(req: NextRequest) {
  const { auth, db } = await getFirebaseInstances();
  
  if (!db || !auth) {
    return NextResponse.json({
      error: 'Service temporarily unavailable'
    }, { status: 503 });
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email || 'unknown@email.com';

    const formData = await req.formData();
    const driversLicenseFile = formData.get('driversLicense') as File;
    const coachUsername = formData.get('coachUsername') as string;
    const personalInfo = JSON.parse(formData.get('personalInfo') as string || '{}');

    if (!driversLicenseFile || !coachUsername) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['driversLicense', 'coachUsername']
      }, { status: 400 });
    }

    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(driversLicenseFile.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type',
        message: 'Only JPEG, PNG, and PDF files are allowed'
      }, { status: 400 });
    }

    if (driversLicenseFile.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large',
        message: 'File size must be less than 10MB'
      }, { status: 400 });
    }

    // Verify user owns the coach profile
    const coachRef = db.collection('coaches').doc(coachUsername);
    const coachDoc = await coachRef.get();

    if (!coachDoc.exists) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
    }

    const coachData = coachDoc.data();
    if (!coachData || coachData.userId !== userId) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        message: 'You do not own this coach profile'
      }, { status: 403 });
    }

    // Convert file to base64 for storage (in production, use cloud storage)
    const bytes = await driversLicenseFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = buffer.toString('base64');

    // Create verification record
    const verificationData = {
      userId: userId,
      userEmail: userEmail,
      coachUsername: coachUsername,
      personalInfo: {
        fullName: personalInfo.fullName || '',
        dateOfBirth: personalInfo.dateOfBirth || '',
        address: personalInfo.address || '',
        phoneNumber: personalInfo.phoneNumber || coachData.phoneNumber || ''
      },
      driversLicense: {
        fileName: driversLicenseFile.name,
        fileType: driversLicenseFile.type,
        fileSize: driversLicenseFile.size,
        fileData: base64File, // In production, store in Firebase Storage/AWS S3
        uploadedAt: new Date()
      },
      status: 'submitted',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: '',
      verificationMethod: 'drivers_license'
    };

    // Store verification in separate collection
    const verificationRef = db.collection('identity_verifications').doc(userId);
    await verificationRef.set(verificationData);

    // Update coach profile verification status
    await coachRef.update({
      verificationStatus: 'in_review',
      verificationSubmittedAt: new Date(),
      updatedAt: new Date()
    });

    // Log the verification submission
    console.log(`Identity verification submitted for user ${userId}, coach ${coachUsername}`);

    // Send notification to admin (implement your notification system)
    await notifyAdminOfVerification({
      userId,
      coachUsername,
      userEmail,
      submittedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Identity verification submitted successfully',
      verificationId: userId,
      status: 'submitted',
      estimatedReviewTime: '2-3 business days'
    });

  } catch (error) {
    console.error('Error processing identity verification:', error);
    return NextResponse.json({
      error: 'Failed to process verification',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - Check verification status
export async function GET(req: NextRequest) {
  const { auth, db } = await getFirebaseInstances();
  
  if (!db || !auth) {
    return NextResponse.json({
      error: 'Service temporarily unavailable'
    }, { status: 503 });
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get verification status
    const verificationRef = db.collection('identity_verifications').doc(userId);
    const verificationDoc = await verificationRef.get();

    if (!verificationDoc.exists) {
      return NextResponse.json({
        status: 'not_submitted',
        message: 'No verification submitted'
      });
    }

    const verificationData = verificationDoc.data();

    if (!verificationData) {
      return NextResponse.json({
        status: 'not_submitted',
        message: 'No verification data found'
      });
    }

    return NextResponse.json({
      status: verificationData.status,
      submittedAt: toDateSafe(verificationData.submittedAt)?.toISOString(),
      reviewedAt: toDateSafe(verificationData.reviewedAt)?.toISOString() || null,
      reviewNotes: verificationData.reviewNotes || '',
      coachUsername: verificationData.coachUsername
    });

  } catch (error) {
    console.error('Error checking verification status:', error);
    return NextResponse.json({
      error: 'Failed to check verification status'
    }, { status: 500 });
  }
}

// Helper function to notify admin of new verification (implement based on your notification system)
async function notifyAdminOfVerification(data: {
  userId: string;
  coachUsername: string;
  userEmail: string;
  submittedAt: Date;
}) {
  try {
    // This could send an email, Slack notification, or create an admin task
    console.log(`New identity verification to review:`, data);
    
    // Example: Store in admin notifications collection
    const { db } = await getFirebaseInstances();
    if (db) {
      await db.collection('admin_notifications').add({
        type: 'identity_verification',
        title: `New Identity Verification: ${data.coachUsername}`,
        message: `User ${data.userEmail} has submitted identity verification for coach profile ${data.coachUsername}`,
        userId: data.userId,
        coachUsername: data.coachUsername,
        priority: 'normal',
        status: 'unread',
        createdAt: new Date()
      });
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
}