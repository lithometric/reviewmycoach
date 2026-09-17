import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '../../lib/firebase-admin';
import { toDateSafe } from '../../lib/pgdb';

// GET - Fetch messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const userId = searchParams.get('userId');
    const limitCount = parseInt(searchParams.get('limit') || '50');

    if (!conversationId && !userId) {
      return NextResponse.json({ error: 'conversationId or userId is required' }, { status: 400 });
    }

    if (conversationId) {
      // Fetch messages for a specific conversation
      const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
      const messagesQuery = messagesRef.orderBy('createdAt', 'desc').limit(limitCount);

      const snapshot = await messagesQuery.get();
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDateSafe(doc.data()?.createdAt)?.toISOString(),
      })).reverse(); // Reverse to show oldest first

      return NextResponse.json({ messages });
    } else {
      // Fetch all conversations for a user
      const conversationsRef = db.collection('conversations');
      const conversationsQuery = conversationsRef
        .where('participants', 'array-contains', userId)
        .orderBy('lastMessageAt', 'desc');

      const snapshot = await conversationsQuery.get();
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDateSafe(doc.data()?.createdAt)?.toISOString(),
        lastMessageAt: toDateSafe(doc.data()?.lastMessageAt)?.toISOString(),
      }));

      return NextResponse.json({ conversations });
    }

  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// POST - Send a new message
export async function POST(request: NextRequest) {
  try {
    const { recipientId, message, conversationId, idToken } = await request.json();

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

  const senderId = decodedToken.uid;

    // Validate required fields
    if (!recipientId || !message?.trim()) {
      return NextResponse.json({ error: 'recipientId and message are required' }, { status: 400 });
    }

    // Prevent self-messaging
    if (senderId === recipientId) {
      return NextResponse.json({ error: 'Cannot send messages to yourself' }, { status: 400 });
    }

    // Get sender profile
    const senderCoachesRef = db.collection('coaches');
    const senderQuery = senderCoachesRef.where('userId', '==', senderId);
    const senderSnapshot = await senderQuery.get();
    
    let senderProfile = null;
    if (!senderSnapshot.empty) {
      senderProfile = senderSnapshot.docs[0].data();
    }

    // If sender is not a coach, check if they're a user
    if (!senderProfile) {
      const userDoc = await db.doc(`users/${senderId}`).get();
      if (userDoc.exists) {
        senderProfile = userDoc.data();
      }
    }

    if (!senderProfile) {
      return NextResponse.json({ error: 'Sender profile not found' }, { status: 404 });
    }

    // Get or create conversation
    let currentConversationId = conversationId;
    
    if (!currentConversationId) {
      // Create conversation ID (consistent ordering)
      const participants = [senderId, recipientId].sort();
      currentConversationId = `${participants[0]}_${participants[1]}`;
      
      // Check if conversation already exists
      const conversationRef = db.doc(`conversations/${currentConversationId}`);
      const conversationDoc = await conversationRef.get();
      
      if (!conversationDoc.exists) {
        // Create new conversation
        await conversationRef.set({
          participants: [senderId, recipientId],
          createdAt: new Date(),
          lastMessageAt: new Date(),
          lastMessage: message.trim(),
          lastMessageSender: senderId,
          unreadCount: {
            [senderId]: 0,
            [recipientId]: 1
          }
        });
      }
    }

    // Add message to conversation
    const messagesRef = db.collection('conversations').doc(currentConversationId).collection('messages');
    const messageData = {
      senderId,
      senderName: senderProfile.displayName || senderProfile.username || 'Unknown',
      recipientId,
      message: message.trim(),
      createdAt: new Date(),
      read: false
    };

    const messageRef = await messagesRef.add(messageData);

    // Update conversation with last message
    const conversationRef = db.doc(`conversations/${currentConversationId}`);
    const conversationDoc = await conversationRef.get();
    
    if (!conversationDoc.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    const currentUnreadCount = conversationDoc.data()?.unreadCount?.[recipientId] || 0;
    
    await conversationRef.update({
      lastMessageAt: new Date(),
      lastMessage: message.trim(),
      lastMessageSender: senderId,
      [`unreadCount.${recipientId}`]: currentUnreadCount + 1
    });

    // Send email notification to recipient
    try {
      // Get recipient profile
      const recipientCoachesRef = db.collection('coaches');
      const recipientQuery = recipientCoachesRef.where('userId', '==', recipientId);
      const recipientSnapshot = await recipientQuery.get();
      
      let recipientProfile = null;
      if (!recipientSnapshot.empty) {
        recipientProfile = recipientSnapshot.docs[0].data();
      }

      // If recipient is not a coach, check if they're a user
      if (!recipientProfile) {
        const userDoc = await db.doc(`users/${recipientId}`).get();
        if (userDoc.exists) {
          recipientProfile = userDoc.data();
        }
      }

      if (recipientProfile && recipientProfile.email) {
        await fetch('/api/notifications/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'message_received',
            recipientEmail: recipientProfile.email,
            recipientName: recipientProfile.displayName || recipientProfile.username,
            data: {
              senderName: senderProfile.displayName || senderProfile.username,
              message: message.trim()
            },
            idToken: idToken
          }),
        });
      }
    } catch (error) {
      console.error('Error sending message notification email:', error);
      // Continue even if email fails
    }

    return NextResponse.json({
      success: true,
      messageId: messageRef.id,
      conversationId: currentConversationId,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending message:', error);
    
    // Provide more specific error information
    let errorMessage = 'Failed to send message';
    if (error instanceof Error) {
      console.error('Detailed error:', error.message);
      if (error.message.includes('NOT_FOUND')) {
        errorMessage = 'Conversation or recipient not found';
      } else if (error.message.includes('PERMISSION_DENIED')) {
        errorMessage = 'Permission denied. Check authentication.';
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// PUT - Mark messages as read
export async function PUT(request: NextRequest) {
  try {
    const { conversationId, userId, idToken } = await request.json();

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

  if (decodedToken.uid !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if conversation exists before updating
    const conversationRef = db.doc(`conversations/${conversationId}`);
    const conversationDoc = await conversationRef.get();
    
    if (!conversationDoc.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Reset unread count for user
    await conversationRef.update({
      [`unreadCount.${userId}`]: 0
    });

    // Mark all messages in conversation as read for this user
    const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
    const messagesQuery = messagesRef
      .where('recipientId', '==', userId)
      .where('read', '==', false);

    const snapshot = await messagesQuery.get();
    const updatePromises = snapshot.docs.map(doc => 
      doc.ref.update({ read: true })
    );

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    
    // Provide more specific error information
    let errorMessage = 'Failed to mark messages as read';
    if (error instanceof Error) {
      console.error('Detailed error:', error.message);
      if (error.message.includes('NOT_FOUND')) {
        errorMessage = 'Conversation not found';
      } else if (error.message.includes('PERMISSION_DENIED')) {
        errorMessage = 'Permission denied. Check authentication.';
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 