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
	const response = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
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

// Function to search for relevant context
async function searchRelevantContext(query: string, env: Env): Promise<string> {
	try {
		// Generate embeddings for the query
		const queryEmbedding = await getEmbeddings(query, env);
		
		// Search the vector database for similar contexts
		const results = await env.VECTORIZE_DB.query(queryEmbedding, 3);
		
		// Combine the relevant contexts
		const contexts = results.map(result => result.metadata.context).join('\n\n');
		return contexts;
	} catch (error) {
		console.error('Error searching for relevant context:', error);
		return '';
	}
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
				console.log('Starting ingest process...');
				const { entries } = await request.json() as { entries: Array<{ context: string; response: string }> };
				
				if (!Array.isArray(entries) || entries.length === 0) {
					console.error('Invalid entries format:', entries);
					return new Response(JSON.stringify({ error: 'Invalid entries format or empty array' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				console.log(`Processing ${entries.length} entries...`);
				
				try {
					console.log('Starting to generate embeddings...');
					const vectors = await Promise.all(
						entries.map(async (entry, index) => {
							try {
								console.log(`Generating embedding for entry ${index}...`);
								const contextEmbedding = await getEmbeddings(entry.context, env);
								console.log(`Successfully generated embedding for entry ${index}`);
								return {
									id: `entry-${Date.now()}-${index}`,
									values: contextEmbedding,
									metadata: {
										context: entry.context,
										response: entry.response
									}
								};
							} catch (error) {
								console.error(`Error generating embedding for entry ${index}:`, error);
								throw new Error(error instanceof Error ? error.message : 'Unknown error generating embedding');
							}
						})
					);
					
					console.log('All embeddings generated, upserting to vectorize...');
					await env.VECTORIZE_DB.upsert(vectors);
					console.log(`Successfully processed ${entries.length} entries`);
					
					return new Response(JSON.stringify({ success: true, count: entries.length }), {
						headers: { 'Content-Type': 'application/json' }
					});
				} catch (error) {
					console.error('Error processing vectors:', error);
					return new Response(JSON.stringify({ 
						error: `Error processing vectors: ${error instanceof Error ? error.message : 'Unknown error'}`
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			} catch (error) {
				console.error('Error parsing request:', error);
				return new Response(JSON.stringify({ 
					error: `Error parsing request: ${error instanceof Error ? error.message : 'Invalid request format'}`
				}), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Handle chat endpoint
		if (url.pathname === '/api/chat') {
			try {
				const { messages } = await request.json() as { 
					messages: Array<{ role: string; content: string }> 
				};

				// Validate messages array
				if (!Array.isArray(messages) || messages.length === 0) {
					throw new Error('Invalid messages format');
				}

				// Get the user's latest message
				const userMessage = messages[messages.length - 1].content;
				
				// Search for relevant context using RAG
				const relevantContext = await searchRelevantContext(userMessage, env);

				// Ensure the first message is a system prompt
				if (messages[0].role !== 'system') {
					messages.unshift({
						role: 'system',
						content: `You are an AI assistant designed to help mental health professionals provide better care to their patients. Your role is to:
1. Analyze the therapist's description of their patient's situation
2. Consider the relevant historical context and similar cases provided
3. Provide specific, actionable suggestions for how to help the patient
4. Maintain professional boundaries and emphasize the importance of clinical judgment
5. Highlight any potential red flags or areas requiring immediate attention
6. Suggest evidence-based therapeutic approaches when appropriate

Here is some relevant context from similar cases to consider:
${relevantContext}

Remember to always:
- Frame suggestions as professional recommendations rather than direct patient advice
- Encourage appropriate referrals when cases exceed your scope
- Maintain patient confidentiality and privacy
- Emphasize that your suggestions should be evaluated within the therapist's clinical judgment`
					});
				}

				// Add the relevant context as a system message right before the response
				messages.push({
					role: 'system',
					content: `Consider these similar cases and their outcomes while formulating your response: ${relevantContext}`
				});

				const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
					messages,
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
