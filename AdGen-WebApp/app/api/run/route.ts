export async function POST() {
  // In production: call Cloud Run service or Agents backend (Python) here.
  // This stub returns a mock run id.
  const runId = Math.random().toString(36).slice(2);
  return Response.json({ runId });
}


