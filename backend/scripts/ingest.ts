import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface CSVRecord {
  Context: string;
  Response: string;
}

// Function to truncate text while preserving meaning
function truncateText(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  
  // Try to truncate at a sentence boundary
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let result = '';
  for (const sentence of sentences) {
    const newResult = result + sentence;
    if (encoder.encode(newResult).length > maxBytes) break;
    result = newResult;
  }
  
  // If still too long or no sentences found, truncate at word boundary
  if (!result || encoder.encode(result).length > maxBytes) {
    result = text;
    while (encoder.encode(result).length > maxBytes) {
      result = result.substring(0, result.lastIndexOf(' '));
    }
  }
  
  return result.trim();
}

// Function to retry failed requests
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      console.log(`Attempt ${attempt} failed, retrying in ${attempt * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error('All retry attempts failed');
}

async function ingestData() {
  try {
    // Read the CSV file
    const csvPath = path.join(__dirname, '../../train.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse the CSV content
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    }) as CSVRecord[];

    // Transform the records to match the expected format
    const transformedRecords = records.map((record: CSVRecord) => ({
      context: record.Context,
      response: record.Response
    }));

    // Send the data to the ingest endpoint in batches
    const BATCH_SIZE = 5;
    const API_URL = 'https://backend.unleashai-inquiries.workers.dev';
    const START_BATCH = 599; // Start from the failed batch
    
    console.log(`Found ${transformedRecords.length} records to process`);
    console.log(`Starting from batch ${START_BATCH}`);
    
    for (let i = (START_BATCH - 1) * BATCH_SIZE; i < transformedRecords.length; i += BATCH_SIZE) {
      const batch = transformedRecords.slice(i, Math.min(i + BATCH_SIZE, transformedRecords.length));
      const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
      console.log(`Processing batch ${currentBatch} of ${Math.ceil(transformedRecords.length / BATCH_SIZE)}`);
      
      // Truncate long texts to fit within metadata limits
      const processedBatch = batch.map(entry => ({
        context: truncateText(entry.context, 4000),
        response: truncateText(entry.response, 4000)
      }));
      
      console.log('First entry in batch:', JSON.stringify(processedBatch[0], null, 2));
      
      try {
        const response = await fetchWithRetry(`${API_URL}/api/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            entries: processedBatch
          })
        });
        
        const responseText = await response.text();
        console.log(`Server response for batch ${currentBatch}:`, responseText);
        
        if (!response.ok) {
          throw new Error(`Failed to ingest batch: ${responseText}`);
        }
        
        console.log(`Successfully processed batch ${currentBatch}`);
        
        // Add a longer delay between batches to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
      } catch (error) {
        console.error(`Error processing batch ${currentBatch}:`, error);
        process.exit(1);
      }
    }
    
    console.log('Successfully ingested all data!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

ingestData(); 