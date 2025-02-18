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
	run(model: string, options: { messages: Array<{ role: string; content: string }>, stream?: boolean } | { text: string[] }): Promise<ReadableStream | { response: string } | { data: number[][] }>;
}

interface Vectorize {
	insert(vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }>): Promise<void>;
	query(vector: number[], topK: number): Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>>;
	upsert(vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }>): Promise<void>;
	getByIds(ids: string[]): Promise<Array<{ id: string; values: number[]; metadata: Record<string, string> }>>;
}

export interface Env {
	AI: AIModel;
	VECTORIZE_DB: Vectorize;
}

// Function to encode text into embeddings using the AI model
async function getEmbeddings(text: string, env: Env): Promise<number[]> {
	const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
		text: [text]
	});
	
	if (response instanceof ReadableStream) {
		throw new Error('Unexpected streaming response for embeddings');
	}
	
	if ('data' in response) {
		return response.data[0];
	}
	
	throw new Error('Unexpected response format from embedding model');
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		const url = new URL(request.url);
		
		// Handle vector database ingestion
		if (url.pathname === '/api/ingest') {
			try {
				const { entries } = await request.json() as { entries: Array<{ context: string; response: string }> };
				
				// Process entries in batches to avoid overwhelming the system
				const BATCH_SIZE = 100;
				for (let i = 0; i < entries.length; i += BATCH_SIZE) {
					const batch = entries.slice(i, i + BATCH_SIZE);
					const vectors = await Promise.all(
						batch.map(async (entry, index) => {
							const contextEmbedding = await getEmbeddings(entry.context, env);
							return {
								id: `entry-${i + index}`,
								values: contextEmbedding,
								metadata: {
									context: entry.context,
									response: entry.response
								}
							};
						})
					);
					
					await env.VECTORIZE_DB.upsert(vectors);
				}
				
				return new Response(JSON.stringify({ success: true }), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error) {
				console.error('Error ingesting data:', error);
				return new Response(JSON.stringify({ error: 'Failed to ingest data' }), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Handle chat endpoint
		if (url.pathname === '/api/chat') {
			try {
				const body = await request.json() as { 
					message?: string; 
					messages?: Array<{ role: string; content: string }> 
				};
				
				let messages: Array<{ role: string; content: string }>;
				
				// Handle both formats: direct message string or messages array
				if (typeof body.message === 'string') {
					messages = [
						{
							role: "system",
							content: "You are a helpful and empathetic mental health assistant. Provide supportive and constructive responses while maintaining appropriate boundaries and encouraging professional help when necessary."
						},
						{
							role: "user",
							content: body.message
						}
					];
				} else if (Array.isArray(body.messages)) {
					messages = body.messages;
				} else {
					throw new Error('Invalid request format');
				}

				const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
					messages: messages,
					stream: true
				});

				if (response instanceof ReadableStream) {
					// Create a new TransformStream for streaming
					const stream = new TransformStream();
					const writer = stream.writable.getWriter();
					
					// Start the AI stream
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
				} else if ('response' in response) {
					return new Response(JSON.stringify({ response: response.response }), {
						headers: {
							'Content-Type': 'application/json'
						}
					});
				} else {
					throw new Error('Unexpected response format from chat model');
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
		}

		return new Response('Route not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
