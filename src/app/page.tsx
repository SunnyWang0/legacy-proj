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

const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content: 'You are a helpful and empathetic mental health assistant. Provide supportive and constructive responses while maintaining appropriate boundaries and encouraging professional help when necessary.'
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([SYSTEM_PROMPT]);
  const [isThinking, setIsThinking] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleClearChat = () => {
    setMessages([]);
    setChatHistory([SYSTEM_PROMPT]);
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
    setChatHistory(prev => [...prev, userMessage]);

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
          messages: chatHistory
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
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
          console.log('Stream completed');
          break;
        }

        // Decode the chunk and process it
        const text = new TextDecoder().decode(value);
        console.log('Received text chunk:', text);
        
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Parsed SSE data:', data);
              
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
                console.log('Adding text content:', textContent);
                accumulatedText += textContent;
                console.log('Updated accumulated text:', accumulatedText);
                
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
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Legacy Demo Project</h1>
          <p className="text-sm text-gray-600">Sunny Wang</p>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-medium text-gray-800">
              Welcome to Your Therapy Assistant
            </h2>
            <p className="mb-6 text-gray-600">
              Tell me about a patient you want to help.
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
                  className="block w-full rounded-lg bg-gray-100 px-4 py-3 text-left text-gray-700 transition-colors hover:bg-gray-200"
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
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.isUser
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-800 shadow-sm'
                  }`}
                >
                  <p>{message.text}</p>
                  <span
                    className={`mt-1 block text-xs ${
                      message.isUser ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="flex space-x-2 rounded-lg bg-white px-4 py-3 shadow-sm">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 delay-100" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 delay-200" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <button
              onClick={handleClearChat}
              disabled={messages.length === 0}
              className="absolute left-3 top-[45%] -translate-y-1/2 text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50"
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
              className="w-full resize-none rounded-lg border border-gray-300 bg-white pl-12 pr-16 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              rows={1}
              disabled={isThinking}
            />
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={isThinking || !inputValue.trim()}
              className="absolute right-2 top-[45%] -translate-y-1/2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
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