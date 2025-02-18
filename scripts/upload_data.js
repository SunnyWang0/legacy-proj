import { createReadStream, existsSync } from 'fs';
import { resolve } from 'path';
import { FormData } from 'form-data';
import fetch from 'node-fetch';

const BACKEND_URL = 'https://backend.unleashai-inquiries.workers.dev';

async function uploadFile(filePath) {
  const formData = new FormData();
  formData.append('file', createReadStream(filePath));

  try {
    const response = await fetch(`${BACKEND_URL}/ingest`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('Upload result:', result);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

// Get the CSV file path from command line arguments
const csvFile = process.argv[2];
if (!csvFile) {
  console.error('Please provide the path to the CSV file as an argument');
  process.exit(1);
}

const filePath = resolve(csvFile);
if (!existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

console.log('Uploading file:', filePath);
uploadFile(filePath); 