import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.log('No ELEVENLABS_API_KEY found'); process.exit(1); }

// Fetch all voices with labels
const resp = await fetch('https://api.elevenlabs.io/v1/voices?show_legacy=false', {
  headers: { 'xi-api-key': key }
});
const data = await resp.json();

console.log('Total voices:', data.voices?.length);
console.log('\n=== All voices with labels ===');
for (const v of (data.voices ?? [])) {
  console.log(`${v.name} | category: ${v.category} | labels: ${JSON.stringify(v.labels)} | id: ${v.voice_id}`);
}
