import { insertData } from './vectorize';
import { Vectorize } from '@cloudflare/workers-types';

interface IngestEnv {
  VECTORIZE_DB: Vectorize;
}

export async function handleIngest(request: Request, env: IngestEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n');
    
    // Skip header row
    const data = lines.slice(1);
    let successCount = 0;
    let errorCount = 0;

    for (const line of data) {
      try {
        // Parse CSV line (handling potential quotes and commas in the text)
        const [context, response] = line.split(',').map(field => 
          field.trim().replace(/^"|"$/g, '')
        );

        if (context && response) {
          const result = await insertData(env, context, response);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
      } catch (error) {
        console.error('Error processing line:', error);
        errorCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${successCount} entries successfully, ${errorCount} errors`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing file:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 