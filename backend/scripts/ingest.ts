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

    // Send the data to the ingest endpoint in batches
    const BATCH_SIZE = 10; // Reduced batch size to avoid overwhelming the server
    const API_URL = 'https://backend.unleashai-inquiries.workers.dev';
    
    console.log(`Found ${transformedRecords.length} records to process`);
    
    for (let i = 0; i < transformedRecords.length; i += BATCH_SIZE) {
      const batch = transformedRecords.slice(i, Math.min(i + BATCH_SIZE, transformedRecords.length));
      console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(transformedRecords.length / BATCH_SIZE)}`);
      
      try {
        const response = await fetch(`${API_URL}/api/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            entries: batch
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server response:', errorText);
          throw new Error(`Failed to ingest batch: ${errorText}`);
        }
        
        console.log(`Successfully processed batch ${i / BATCH_SIZE + 1}`);
        
        // Add a small delay between batches to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay to 2 seconds
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
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