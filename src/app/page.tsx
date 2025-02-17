'use client';

import { useState } from 'react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';

interface Message {
  text: string;
  isUser: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSendMessage = async (message: string) => {
    // Add user message
    setMessages((prev) => [...prev, { text: message, isUser: true }]);

    // TODO: Add API call to get response
    // For now, we'll just add a mock response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          text: "I understand how you're feeling. Let me help you with that...",
          isUser: false,
        },
      ]);
    }, 1000);
  };

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-800">Mental Health Chat Assistant</h1>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-gray-500">
                Welcome! How can I help you today?
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatMessage
                key={index}
                message={message.text}
                isUser={message.isUser}
              />
            ))
          )}
        </div>

        {/* Chat Input */}
        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </main>
  );
} 