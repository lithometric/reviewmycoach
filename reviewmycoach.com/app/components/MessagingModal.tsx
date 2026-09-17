'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  message: string;
  createdAt: string;
  read: boolean;
}



interface MessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  user: User | null;
}

export default function MessagingModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  user
}: MessagingModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate consistent conversation ID
  const generateConversationId = (userId: string, recipientId: string) => {
    const participants = [userId, recipientId].sort();
    return `${participants[0]}_${participants[1]}`;
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch messages for the current conversation from the API
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const response = await fetch(
        `/api/messages?conversationId=${encodeURIComponent(convId)}&limit=100`
      );
      if (!response.ok) return;
      const data = await response.json();
      const messagesData: Message[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        recipientId: m.recipientId,
        message: m.message,
        createdAt: m.createdAt || new Date().toISOString(),
        read: m.read,
      }));
      setMessages(messagesData);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, []);

  // Load messages when opened, then poll for new ones while the modal is open
  useEffect(() => {
    if (!isOpen || !user) return;

    const convId = generateConversationId(user.uid, recipientId);
    setConversationId(convId);

    fetchMessages(convId);
    const intervalId = setInterval(() => fetchMessages(convId), 5000);

    return () => clearInterval(intervalId);
  }, [isOpen, user, recipientId, fetchMessages]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark messages as read when opening conversation
  useEffect(() => {
    if (!isOpen || !user || !conversationId) return;

    const markAsRead = async () => {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/messages', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId,
            userId: user.uid,
            idToken
          }),
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    };

    markAsRead();
  }, [isOpen, user, conversationId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !newMessage.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientId,
          message: newMessage.trim(),
          conversationId,
          idToken
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setNewMessage('');
        if (conversationId) {
          await fetchMessages(conversationId);
        }
      } else {
        setError(data.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900/70 backdrop-blur border border-neutral-800 rounded-2xl w-full max-w-md h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-200 font-medium ring-1 ring-neutral-700">
              {recipientName.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3">
              <h3 className="text-base font-medium text-neutral-100">{recipientName}</h3>
              <p className="text-xs text-neutral-500">Conversation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-950/40">
          {messages.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                    message.senderId === user?.uid
                      ? 'bg-neutral-200 text-neutral-900'
                      : 'bg-neutral-900/80 border border-neutral-800 text-neutral-200'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.message}</p>
                  <p className={`text-[10px] mt-1 ${
                    message.senderId === user?.uid ? 'text-neutral-700' : 'text-neutral-500'
                  }`}>
                    {formatMessageTime(message.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-900/60">
          {error && (
            <div className="mb-3 p-2 bg-red-950/40 border border-red-900/40 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={sendMessage} className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-full text-neutral-100 placeholder-neutral-500 focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !newMessage.trim()}
              className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
} 