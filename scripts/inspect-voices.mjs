import "dotenv/config";

const key = process.env.ELEVENLABS_API_KEY;
const r = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
  headers: { "xi-api-key": key },
});
const d = await r.json();
console.log("Total:", d.total_count);

// Print all keys of the first voice to understand the structure
if (d.voices.length > 0) {
  console.log("\nFirst voice keys:", Object.keys(d.voices[0]));
  console.log("\nFirst voice full data:");
  console.log(JSON.stringify(d.voices[0], null, 2));
}

// Print all voices with name and category
console.log("\n--- All voices ---");
d.voices.forEach((v) => {
  console.log(`${v.voice_id} | ${v.name} | ${v.category}`);
});

// Check for a collections endpoint
console.log("\n--- Checking collections endpoints ---");
for (const path of [
  "/v1/voice-collections",
  "/v1/voices/collections",
  "/v1/user/voices",
]) {
  const resp = await fetch(`https://api.elevenlabs.io${path}`, {
    headers: { "xi-api-key": key },
  });
  console.log(`${path}: ${resp.status}`);
  if (resp.ok) {
    const data = await resp.json();
    console.log(JSON.stringify(data, null, 2).slice(0, 500));
  }
}
