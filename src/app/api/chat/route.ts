import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const response = await fetch("https://backend.unleashai-inquiries.workers.dev/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
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

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const rawData = line.slice(6);
                  // Try to parse the data and extract the text
                  const parsed = JSON.parse(rawData);
                  // Ensure we're forwarding a proper text string
                  let textContent = '';
                  if (typeof parsed.text === 'string') {
                    textContent = parsed.text;
                  } else if (parsed.text?.response) {
                    textContent = parsed.text.response;
                  } else if (typeof parsed.response === 'string') {
                    textContent = parsed.response;
                  }
                  
                  // Forward the properly formatted SSE data
                  if (textContent) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: textContent })}\n\n`));
                  }
                } catch (e) {
                  console.error('Error processing SSE data:', e, 'Raw line:', line);
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