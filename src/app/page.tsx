'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleClearChat = () => {
    setMessages([]);
    setChatHistory([]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const newMessage = {
      text: message,
      isUser: true,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setIsThinking(true);

    // Add user message to chat history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message
    };
    
    // Create new chat history with the user's message
    const updatedChatHistory = [...chatHistory, userMessage];
    setChatHistory(updatedChatHistory);

    // Add a placeholder message for the AI response
    const placeholderMessage = {
      text: '',
      isUser: false,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: updatedChatHistory // Use the updated chat history
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          data: errorData
        });
        throw new Error(errorData.details || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let accumulatedText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Add assistant's complete message to chat history
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: accumulatedText
          };
          setChatHistory(prev => [...prev, assistantMessage]);
          break;
        }

        // Decode the chunk and process it
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Extract the text content properly
              let textContent = '';
              if (typeof data.text === 'string') {
                textContent = data.text;
              } else if (data.text?.response) {
                textContent = data.text.response;
              } else if (typeof data.response === 'string') {
                textContent = data.response;
              }
              
              if (textContent) {
                accumulatedText += textContent;
                
                // Update the last message with the accumulated text
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    text: accumulatedText,
                  };
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e, 'Line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = {
        text: "I apologize, but I'm having trouble responding right now. Please try again later.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-[#42A573] bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <img src="/logo.png" alt="Legacy Logo" className="h-12 w-auto" />
          <div>
            <h1 className="text-xl font-semibold text-[#42A573]">Clinical Consultation Assistant</h1>
            <p className="text-sm text-gray-600">Professional Mental Health Support</p>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm border border-[#42A573]/20">
            <h2 className="mb-4 text-xl font-medium text-[#42A573]">
              Welcome to Your Clinical Consultation Assistant
            </h2>
            <p className="mb-6 text-gray-600">
              Describe your patient&apos;s situation and I&apos;ll help you develop effective therapeutic strategies.
            </p>
            <div className="space-y-2">
              {[
                "I have a patient showing signs of treatment-resistant depression, looking for alternative approaches",
                "Need strategies for a patient with social anxiety who's struggling with work interactions",
                "Patient experiencing panic attacks but resistant to medication - seeking CBT techniques"
              ].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSendMessage(suggestion)}
                  className="block w-full rounded-lg bg-[#42A573]/5 px-4 py-3 text-left text-gray-700 transition-colors hover:bg-[#42A573]/10 border border-[#42A573]/20"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-6 py-4 ${
                    message.isUser
                      ? 'bg-[#42A573] text-white'
                      : 'bg-white text-gray-800 shadow-sm border border-[#42A573]/20'
                  }`}
                >
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap">
                      {message.text.split('**').map((part, i) => {
                        // Every odd index is bold text
                        if (i % 2 === 1) {
                          return <strong key={i} className={message.isUser ? 'text-white' : 'text-gray-900'}>{part}</strong>;
                        }
                        // Process the text content
                        return part.split('\n').map((line, lineIndex) => {
                          const numberedListMatch = line.match(/^(\d+)\.\s+(.*)/);
                          if (numberedListMatch) {
                            return (
                              <div key={`${i}-${lineIndex}`} className="flex items-start gap-2">
                                <span className="flex-shrink-0 font-medium">{numberedListMatch[1]}.</span>
                                <span className="flex-1">{numberedListMatch[2]}</span>
                              </div>
                            );
                          }
                          // Only add a div for non-empty lines
                          return line.trim() ? (
                            <div key={`${i}-${lineIndex}`} className="mb-1 last:mb-0">{line}</div>
                          ) : null;
                        }).filter(Boolean);
                      })}
                    </div>
                  </div>
                  <span
                    className={`mt-3 block text-xs ${
                      message.isUser ? 'text-white/80' : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="flex space-x-2 rounded-lg bg-white px-4 py-3 shadow-sm border border-[#42A573]/20">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-[#42A573]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-[#42A573] delay-100" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-[#42A573] delay-200" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-[#42A573]/20 bg-white p-4">
        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <button
              onClick={handleClearChat}
              disabled={messages.length === 0}
              className="absolute left-3 top-[45%] -translate-y-1/2 text-gray-400 hover:text-[#42A573] focus:outline-none disabled:opacity-50"
              title="Reset conversation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="h-5 w-5"
                strokeWidth={2}
              >
                <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0-0.44-8.49" />
              </svg>
            </button>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="w-full resize-none rounded-lg border border-[#42A573]/20 bg-white pl-12 pr-16 py-2 text-gray-900 placeholder-gray-500 focus:border-[#42A573] focus:outline-none focus:ring-2 focus:ring-[#42A573]/20"
              rows={1}
              disabled={isThinking}
            />
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={isThinking || !inputValue.trim()}
              className="absolute right-2 top-[45%] -translate-y-1/2 rounded-md bg-[#42A573] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#42A573]/90 disabled:bg-gray-400"
            >
              Send
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Press Enter to send, Shift + Enter for a new line
          </p>
        </div>
      </div>
    </div>
  );
} 