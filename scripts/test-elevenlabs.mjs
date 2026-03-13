const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('No ELEVENLABS_API_KEY'); process.exit(1); }

const res = await fetch('https://api.elevenlabs.io/v1/voices', {
  headers: { 'xi-api-key': key }
});
const data = await res.json();
if (data.voices) {
  console.log('OK - ElevenLabs API key valid, found', data.voices.length, 'voices');
} else {
  console.error('Unexpected response:', JSON.stringify(data).slice(0, 200));
  process.exit(1);
}
