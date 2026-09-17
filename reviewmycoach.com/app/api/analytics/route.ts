import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '../../lib/firebase-admin';
import { toDateSafe } from '../../lib/pgdb';

interface AnalyticsData {
  bookings: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    totalRevenue: number;
    monthlyRevenue: Array<{ month: string; revenue: number; bookings: number }>;
  };
  applications: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    monthlyApplications: Array<{ month: string; applications: number }>;
  };
  messages: {
    totalConversations: number;
    totalMessages: number;
    unreadMessages: number;
    responseRate: number;
  };
  reviews: {
    total: number;
    averageRating: number;
    ratingDistribution: Record<string, number>;
    monthlyReviews: Array<{ month: string; reviews: number; averageRating: number }>;
  };
  profileViews: {
    total: number;
    monthlyViews: Array<{ month: string; views: number }>;
  };
}

// GET - Fetch analytics data for a coach
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const timeRange = searchParams.get('timeRange') || '12'; // months
    const idToken = searchParams.get('idToken');

    if (!userId || !idToken) {
      return NextResponse.json({ error: 'userId and idToken are required' }, { status: 400 });
    }

    // Verify authentication
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    if (decodedToken.uid !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if user is a coach
    const coachesRef = db.collection('coaches');
    const coachQuery = coachesRef.where('userId', '==', userId);
    const coachSnapshot = await coachQuery.get();

    if (coachSnapshot.empty) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(timeRange));

    // Fetch analytics data
    const analyticsData = await fetchAnalyticsData(userId, startDate, endDate);

    return NextResponse.json({ analytics: analyticsData });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}

async function fetchAnalyticsData(userId: string, startDate: Date, endDate: Date): Promise<AnalyticsData> {
  const [bookingsData, applicationsData, messagesData, reviewsData] = await Promise.all([
    fetchBookingsAnalytics(userId, startDate, endDate),
    fetchApplicationsAnalytics(userId, startDate, endDate),
    fetchMessagesAnalytics(userId, startDate, endDate),
    fetchReviewsAnalytics(userId, startDate, endDate),
  ]);

  const profileViews = await fetchProfileViewsAnalytics(userId, startDate, endDate);

  return {
    bookings: bookingsData,
    applications: applicationsData,
    messages: messagesData,
    reviews: reviewsData,
    profileViews: profileViews,
  };
}

async function fetchBookingsAnalytics(userId: string, startDate: Date, endDate: Date) {
  const bookingsRef = db.collection('bookings');
  const bookingsQuery = bookingsRef
    .where('coachId', '==', userId)
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate);

  const snapshot = await bookingsQuery.get();
  const bookings = snapshot.docs.map(doc => doc.data() as Record<string, any>);

  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'pending' || b.status === 'pending_payment').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const cancelled = bookings.filter(b => b.status === 'cancelled').length;

  const totalRevenue = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  // Monthly revenue breakdown
  const monthlyRevenue = generateMonthlyData(bookings, startDate, endDate, (items) => {
    const completedBookings = items.filter(b => b.status === 'completed');
    return {
      revenue: completedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
      bookings: completedBookings.length
    };
  });

  return {
    total,
    pending,
    completed,
    cancelled,
    totalRevenue,
    monthlyRevenue,
  };
}

async function fetchApplicationsAnalytics(userId: string, startDate: Date, endDate: Date) {
  const applicationsRef = db.collection('job_applications');
  const applicationsQuery = applicationsRef
    .where('coachId', '==', userId)
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate);

  const snapshot = await applicationsQuery.get();
  const applications = snapshot.docs.map(doc => doc.data() as Record<string, any>);

  const total = applications.length;
  const pending = applications.filter(a => a.status === 'pending').length;
  const accepted = applications.filter(a => a.status === 'accepted').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;

  const monthlyApplications = generateMonthlyData(applications, startDate, endDate, (items) => ({
    applications: items.length
  }));

  return {
    total,
    pending,
    accepted,
    rejected,
    monthlyApplications,
  };
}

async function fetchMessagesAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Fetch conversations where user is a participant
  const conversationsRef = db.collection('conversations');
  const conversationsQuery = conversationsRef.where('participants', 'array-contains', userId);

  const conversationsSnapshot = await conversationsQuery.get();
  const conversations = conversationsSnapshot.docs.map(doc => doc.data() as Record<string, any>);

  const totalConversations = conversations.length;
  const unreadMessages = conversations.reduce((sum, conv) => 
    sum + (conv.unreadCount?.[userId] || 0), 0);

  // Fetch total messages sent by user
  let totalMessages = 0;
  for (const conversation of conversationsSnapshot.docs) {
    const messagesRef = db.collection('conversations').doc(conversation.id).collection('messages');
    const messagesQuery = messagesRef
      .where('senderId', '==', userId)
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate);
    
    const messagesSnapshot = await messagesQuery.get();
    totalMessages += messagesSnapshot.size;
  }

  // Simple response rate calculation (messages sent / conversations)
  const responseRate = totalConversations > 0 ? (totalMessages / totalConversations) * 100 : 0;

  return {
    totalConversations,
    totalMessages,
    unreadMessages,
    responseRate: Math.round(responseRate),
  };
}

async function fetchReviewsAnalytics(userId: string, startDate: Date, endDate: Date) {
  const reviewsRef = db.collection('coaches').doc(userId).collection('reviews');
  const reviewsQuery = reviewsRef
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate);

  const snapshot = await reviewsQuery.get();
  const reviews = snapshot.docs.map(doc => doc.data() as Record<string, any>);

  const total = reviews.length;
  const averageRating = total > 0 ? 
    reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

  const ratingDistribution = reviews.reduce((dist, r) => {
    const rating = r.rating.toString();
    dist[rating] = (dist[rating] || 0) + 1;
    return dist;
  }, {} as Record<string, number>);

  const monthlyReviews = generateMonthlyData(reviews, startDate, endDate, (items) => ({
    reviews: items.length,
    averageRating: items.length > 0 ? 
      items.reduce((sum, r) => sum + r.rating, 0) / items.length : 0
  }));

  return {
    total,
    averageRating: Math.round(averageRating * 100) / 100,
    ratingDistribution,
    monthlyReviews,
  };
}

async function fetchProfileViewsAnalytics(userId: string, startDate: Date, endDate: Date) {
  // This would require implementing profile view tracking
  // For now, return mock data
  const monthlyViews = generateMonthlyData([], startDate, endDate, () => ({
    views: Math.floor(Math.random() * 100) + 50 // Mock data
  }));

  return {
    total: monthlyViews.reduce((sum, mv) => sum + mv.views, 0),
    monthlyViews,
  };
}

function generateMonthlyData<T>(
  items: any[],
  startDate: Date,
  endDate: Date,
  aggregator: (items: any[]) => T
): Array<{ month: string } & T> {
  const months = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const monthKey = current.toISOString().slice(0, 7); // YYYY-MM format
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    
    const monthItems = items.filter(item => {
      const itemDate = toDateSafe(item.createdAt) || new Date(item.createdAt);
      return itemDate >= monthStart && itemDate <= monthEnd;
    });

    months.push({
      month: monthKey,
      ...aggregator(monthItems)
    });

    current.setMonth(current.getMonth() + 1);
  }

  return months;
} 