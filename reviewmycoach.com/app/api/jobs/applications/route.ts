import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '../../../lib/firebase-admin';
import { toDateSafe } from '../../../lib/pgdb';

// GET - Fetch job applications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const jobId = searchParams.get('jobId');
    const status = searchParams.get('status');

    if (!userId && !jobId) {
      return NextResponse.json({ error: 'Either userId or jobId is required' }, { status: 400 });
    }

    const applicationsRef = db.collection('job_applications');
    let applicationsQuery: any;

    if (userId) {
      // Get applications by coach
      applicationsQuery = applicationsRef
        .where('coachId', '==', userId)
        .orderBy('createdAt', 'desc');
    } else {
      // Get applications for a specific job
      applicationsQuery = applicationsRef
        .where('jobId', '==', jobId!)
        .orderBy('createdAt', 'desc');
    }

    if (status) {
      applicationsQuery = applicationsQuery.where('status', '==', status);
    }

    const snapshot = await applicationsQuery.get();
    const applications = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDateSafe(doc.data().createdAt)?.toISOString(),
      updatedAt: toDateSafe(doc.data().updatedAt)?.toISOString(),
    }));

    return NextResponse.json({ applications });

  } catch (error) {
    console.error('Error fetching job applications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}

// POST - Create a new job application
export async function POST(request: NextRequest) {
  try {
    const { jobId, coverLetter, message, hourlyRate, estimatedHours, availability, idToken } = await request.json();

    // Verify authentication
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // Check if user is a coach and has active subscription
    const coachesRef = db.collection('coaches');
    const coachQuery = coachesRef.where('userId', '==', userId);
    const coachSnapshot = await coachQuery.get();

    if (coachSnapshot.empty) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
    }

    const coachDoc = coachSnapshot.docs[0];
    const coachData = coachDoc.data() as Record<string, any>;

    // Check Coach Pro subscription status
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userDoc.data();
    const subscription = userData?.subscription;
    
    // Check if user has active Coach Pro subscription
    let hasCoachPro = false;
    if (subscription) {
      const now = new Date();
      const expiresAt = toDateSafe(subscription.expiresAt);
      hasCoachPro = subscription.isActive === true && 
                   subscription.plan === 'pro' && 
                   (!expiresAt || expiresAt > now);
    }
    
    if (!hasCoachPro) {
      return NextResponse.json({ 
        error: 'Coach Pro subscription required to apply for jobs. Upgrade your account to access the job board.' 
      }, { status: 403 });
    }

    // Check if job exists
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const jobData = jobDoc.data();
    if (!jobData) {
      return NextResponse.json({ error: 'Job data not found' }, { status: 404 });
    }

    // Check if coach has already applied
    const existingApplicationQuery = db.collection('job_applications')
      .where('jobId', '==', jobId)
      .where('coachId', '==', userId);
    const existingSnapshot = await existingApplicationQuery.get();

    if (!existingSnapshot.empty) {
      return NextResponse.json({ error: 'You have already applied for this job' }, { status: 400 });
    }

    // Validate required fields - only message is required for our simplified form
    if (!message && !coverLetter) {
      return NextResponse.json({ error: 'Application message is required' }, { status: 400 });
    }

    // Create application
    const applicationData = {
      jobId,
      coachId: userId,
      coachName: coachData.displayName,
      coachUsername: coachData.username,
      coachEmail: decodedToken.email,
      jobTitle: jobData.title,
      jobPostedBy: jobData.postedBy,
      message: message || coverLetter || '',
      coverLetter: coverLetter || message || '',
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      availability: availability || 'Not specified',
      status: 'pending',
      appliedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const applicationRef = await db.collection('job_applications').add(applicationData);

    // Update job applicant count
    await jobRef.update({
      applicants: (jobData.applicants || 0) + 1,
      updatedAt: new Date(),
    });

    // Log email notification instead of sending (to avoid internal API call issues)
    try {
      const jobPosterEmail = jobData.posterEmail;
      if (jobPosterEmail) {
        console.log('Job application email notification would be sent to:', jobPosterEmail);
        console.log('Application details:', {
          jobTitle: jobData.title,
          applicantName: coachData.displayName,
          message: message || coverLetter,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : 'Not specified',
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : 'Not specified',
          availability: availability || 'Not specified'
        });
      }
    } catch (error) {
      console.error('Error logging job application email:', error);
      // Continue even if logging fails
    }

    return NextResponse.json({
      success: true,
      applicationId: applicationRef.id,
      message: 'Application submitted successfully'
    });

  } catch (error) {
    console.error('Error creating job application:', error);
    return NextResponse.json(
      { error: 'Failed to submit application' },
      { status: 500 }
    );
  }
}

// PUT - Update job application status
export async function PUT(request: NextRequest) {
  try {
    const { applicationId, status, feedback, idToken } = await request.json();

    // Verify authentication
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

      let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
  }

    const userId = decodedToken.uid;

    // Get application
    const applicationRef = db.collection('job_applications').doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const applicationData = applicationDoc.data();
    if (!applicationData) {
      return NextResponse.json({ error: 'Application data not found' }, { status: 404 });
    }

    // Check if user is the job poster (can accept/reject applications)
    if (applicationData.jobPostedBy !== userId) {
      return NextResponse.json({ error: 'Unauthorized to update this application' }, { status: 403 });
    }

    // Update application
    await applicationRef.update({
      status,
      feedback: feedback || '',
      updatedAt: new Date(),
    });

    // Log email notification instead of sending (to avoid internal API call issues)
    try {
      const coachesRef = db.collection('coaches');
      const coachQuery = coachesRef.where('userId', '==', applicationData.coachId);
      const coachSnapshot = await coachQuery.get();

      if (!coachSnapshot.empty) {
        const coachDoc = coachSnapshot.docs[0];
        const coachData = coachDoc.data() as Record<string, any>;
        const coachEmail = coachData.email;

        if (coachEmail) {
          console.log('Application status email notification would be sent to:', coachEmail);
          console.log('Status update details:', {
            jobTitle: applicationData.jobTitle,
            status,
            feedback: feedback || ''
          });
        }
      }
    } catch (error) {
      console.error('Error logging application status email:', error);
      // Continue even if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'Application updated successfully'
    });

  } catch (error) {
    console.error('Error updating job application:', error);
    return NextResponse.json(
      { error: 'Failed to update application' },
      { status: 500 }
    );
  }
} 