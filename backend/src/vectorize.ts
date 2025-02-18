import { Vectorize } from '@cloudflare/workers-types';

interface VectorizeEnv {
  VECTORIZE_DB: Vectorize;
}

type VectorData = {
  text: string;
  response: string;
};

export async function insertData(env: VectorizeEnv, context: string, response: string) {
  try {
    // Generate embeddings for the text
    const values = new Float32Array(1536); // Default dimension for text embeddings
    // TODO: Replace with actual embedding generation once we have access to the embedding model
    
    await env.VECTORIZE_DB.upsert([
      {
        id: crypto.randomUUID(),
        values: Array.from(values),
        metadata: {
          text: context,
          response: response
        }
      }
    ]);

    return { success: true };
  } catch (error) {
    console.error('Error inserting data:', error instanceof Error ? error.message : String(error));
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function searchSimilar(env: VectorizeEnv, query: string, limit: number = 5) {
  try {
    // Generate embeddings for the query
    const values = new Float32Array(1536); // Default dimension for text embeddings
    // TODO: Replace with actual embedding generation once we have access to the embedding model
    
    const results = await env.VECTORIZE_DB.query(Array.from(values), {
      topK: limit
    });

    return {
      success: true,
      results: results.matches.map(match => ({
        score: match.score,
        context: match.metadata?.text as string,
        response: match.metadata?.response as string
      }))
    };
  } catch (error) {
    console.error('Error searching similar entries:', error instanceof Error ? error.message : String(error));
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
} 