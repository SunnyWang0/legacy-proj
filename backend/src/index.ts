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

import { handleIngest } from './ingest';
import { searchSimilar } from './vectorize';

interface AIModel {
	run(model: string, options: { messages: Array<{ role: string; content: string }>, stream?: boolean }): Promise<ReadableStream | { response: string }>;
}

export interface Env {
	AI: AIModel;
	VECTORIZE_DB: Vectorize;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle different endpoints
		switch (url.pathname) {
			case '/ingest':
				return handleIngest(request, env);
			
			case '/chat':
				if (request.method !== 'POST') {
					return new Response('Method not allowed', { status: 405 });
				}

				try {
					const body = await request.json() as { messages: Array<{ role: string; content: string }> };
					const userMessage = body.messages.find(m => m.role === 'user')?.content;

					if (!userMessage) {
						return new Response('No user message found', { status: 400 });
					}

					// Get similar examples from the vector database
					const similar = await searchSimilar(env, userMessage);
					
					// Add the similar examples to the system message
					const messages = [
						{
							role: "system",
							content: `You are a helpful and empathetic mental health assistant. Here are some similar examples of how therapists have responded to similar situations:
${(similar.results || []).map(r => `Patient: ${r.context}\nTherapist: ${r.response}\n`).join('\n')}

Use these examples as guidance, but provide your own unique and personalized response.`
						},
						...body.messages
					];

					// Create a new TransformStream for streaming
					const stream = new TransformStream();
					const writer = stream.writable.getWriter();
					
					// Start the AI stream
					const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
						messages,
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
											// Check if it's a [DONE] message
											if (decoded.trim() === 'data: [DONE]') {
												continue;
											}
											
											// Parse the SSE data format
											if (decoded.startsWith('data: ')) {
												const jsonStr = decoded.slice(6);
												const parsed = JSON.parse(jsonStr);
												
												// Extract only the response text, ignore metadata
												if (parsed.response && typeof parsed.response === 'string') {
													textChunk = parsed.response;
												} else if (parsed.text && typeof parsed.text === 'string') {
													textChunk = parsed.text;
												}
											}
										} catch (e) {
											console.error('Error decoding chunk:', e);
											continue;
										}
									}

									if (textChunk) {
										// Format the SSE data properly
										const sseData = `data: ${JSON.stringify({ text: textChunk })}\n\n`;
										console.log('Sending text chunk:', textChunk);
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

			default:
				return new Response('Not found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
