import "dotenv/config";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("No ELEVENLABS_API_KEY found in environment");
  process.exit(1);
}

console.log("Fetching voices from ElevenLabs...\n");

// First check if there's a collections/groups API
const voicesResp = await fetch("https://api.elevenlabs.io/v1/voices", {
  headers: { "xi-api-key": key },
});
const voicesData = await voicesResp.json();

console.log(`Total voices: ${voicesData.voices?.length ?? 0}\n`);
voicesData.voices?.forEach((v) => {
  console.log(`ID: ${v.voice_id}`);
  console.log(`  Name: ${v.name}`);
  console.log(`  Category: ${v.category}`);
  console.log(`  Labels: ${JSON.stringify(v.labels)}`);
  console.log(`  Description: ${v.description ?? "none"}`);
  console.log("");
});

// Also check if there's a voice collections endpoint
console.log("\n--- Checking /v1/voice-collections ---");
const colResp = await fetch("https://api.elevenlabs.io/v1/voice-collections", {
  headers: { "xi-api-key": key },
});
console.log("Status:", colResp.status);
if (colResp.ok) {
  const colData = await colResp.json();
  console.log(JSON.stringify(colData, null, 2));
} else {
  const txt = await colResp.text();
  console.log("Response:", txt.slice(0, 200));
}
