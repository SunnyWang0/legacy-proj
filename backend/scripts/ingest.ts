import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface CSVRecord {
  Context: string;
  Response: string;
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

    // Send the data to the ingest endpoint in smaller batches
    const BATCH_SIZE = 10; // Reduced batch size
    const API_URL = 'https://backend.unleashai-inquiries.workers.dev';
    
    console.log(`Found ${transformedRecords.length} records to process`);
    
    for (let i = 0; i < transformedRecords.length; i += BATCH_SIZE) {
      const batch = transformedRecords.slice(i, Math.min(i + BATCH_SIZE, transformedRecords.length));
      console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(transformedRecords.length / BATCH_SIZE)}`);
      
      try {
        // Log the first entry of each batch for debugging
        console.log('First entry in batch:', JSON.stringify(batch[0], null, 2));
        
        const response = await fetch(`${API_URL}/api/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            entries: batch
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server response:', errorText);
          console.error('Response status:', response.status);
          console.error('Response headers:', Object.fromEntries(response.headers.entries()));
          throw new Error(`Failed to ingest batch: ${errorText}`);
        }
        
        console.log(`Successfully processed batch ${i / BATCH_SIZE + 1}`);
        
        // Add a delay between batches to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
          console.error('Error stack:', error.stack);
        }
        process.exit(1);
      }
    }
    
    console.log('Successfully ingested all data!');
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

ingestData(); 