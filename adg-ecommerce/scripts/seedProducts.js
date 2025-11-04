// Simple helper script: triggers Next.js admin endpoint to seed products
// Requires the dev server to be running on localhost:3000
// Usage: SEED_SECRET=dev node scripts/seedProducts.js

async function main() {
  const secret = process.env.SEED_SECRET || "dev";
  const base = process.env.SEED_BASE_URL || "http://localhost:3000";
  const url = `${base}/api/admin/seed-products?secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    console.error("Seed failed", res.status, text);
    process.exit(1);
  }
  const json = await res.json();
  console.log("Seeded:", json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


