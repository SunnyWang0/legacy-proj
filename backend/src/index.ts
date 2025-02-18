/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface AIModel {
	run(model: string, options: { messages: Array<{ role: string; content: string }>, stream?: boolean }): Promise<ReadableStream | { response: string }>;
}

export interface Env {
	AI: AIModel;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const body = await request.json() as { messages: Array<{ role: string; content: string }> };

			// Create a new TransformStream for streaming
			const stream = new TransformStream();
			const writer = stream.writable.getWriter();
			
			// Start the AI stream
			const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
				messages: body.messages,
				stream: true
			});

			// Process the streaming response
			if (response instanceof ReadableStream) {
				const reader = response.getReader();
				(async () => {
					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) {
								console.log('Stream completed');
								await writer.close();
								break;
							}
							
							// Debug the incoming value
							console.log('Received chunk:', value);
							
							// Ensure we have the correct structure and handle it properly
							let textChunk = '';
							if (typeof value === 'string') {
								textChunk = value;
							} else if (value?.response) {
								textChunk = value.response;
							} else if (value && typeof value === 'object') {
								// Handle case where value might be a Uint8Array or similar
								const decoder = new TextDecoder();
								try {
									const decoded = decoder.decode(value);
									const parsed = JSON.parse(decoded);
									textChunk = parsed.response || parsed.text || decoded;
								} catch (e) {
									console.error('Error decoding chunk:', e);
									textChunk = decoder.decode(value);
								}
							}

							if (textChunk) {
								// Format the SSE data properly
								const sseData = `data: ${JSON.stringify({ text: textChunk })}\n\n`;
								console.log('Sending SSE data:', sseData);
								await writer.write(new TextEncoder().encode(sseData));
							}
						}
					} catch (error) {
						console.error('Streaming error:', error);
						await writer.abort(error);
					}
				})();

				// Return the response as a server-sent event stream
				return new Response(stream.readable, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive'
					}
				});
			} else {
				// Handle non-streaming response
				return new Response(JSON.stringify({ response: response.response }), {
					headers: {
						'Content-Type': 'application/json'
					}
				});
			}
		} catch (error) {
			console.error('Error:', error);
			return new Response(JSON.stringify({ error: 'Failed to process request' }), {
				status: 500,
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}
	},
} satisfies ExportedHandler<Env>;
