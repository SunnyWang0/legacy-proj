import { NextResponse } from 'next/server';

// Update this to match your deployed worker URL
const WORKER_URL = "https://backend.unleashai-inquiries.workers.dev";

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array cannot be empty' },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(`${WORKER_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { 
            error: 'Backend API error', 
            details: errorText,
            status: response.status,
            statusText: response.statusText
          },
          { status: response.status }
        );
      }

      // Verify the response has a body
      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Set up streaming response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = (response.body as ReadableStream).getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }

              const text = new TextDecoder().decode(value);
              const lines = text.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const rawData = line.slice(6);
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
                  } catch {
                    // Silently continue on parse errors
                    continue;
                  }
                }
              }
            }
          } catch (error) {
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
      });

    } catch (fetchError) {
      return NextResponse.json(
        { 
          error: 'Failed to communicate with backend',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'
        },
        { status: 502 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to process request', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
} 