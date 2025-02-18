import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    const response = await fetch("https://backend.unleashai-inquiries.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a helpful and empathetic mental health assistant. Provide supportive and constructive responses while maintaining appropriate boundaries and encouraging professional help when necessary."
          },
          {
            role: "user",
            content: message
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get AI response');
    }

    // Set up streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('Stream completed');
              controller.close();
              break;
            }

            // Debug the incoming chunks
            console.log('Received chunk:', new TextDecoder().decode(value));

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = line.slice(6);
                  console.log('Processing SSE data:', data);
                  // Forward the SSE data as is
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (e) {
                  console.error('Error processing SSE data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 