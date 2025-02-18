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
	run(model: string, options: { messages: Array<{ role: string; content: string }> }): Promise<{ response: string }>;
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

			// Call the Cloudflare AI model
			const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
				messages: body.messages
			});

			return new Response(JSON.stringify({ response: response.response }), {
				headers: {
					'Content-Type': 'application/json'
				}
			});
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
