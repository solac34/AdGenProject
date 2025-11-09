export async function POST() {
  const runId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Use the provided agents service URL
  const agentsUrl = process.env.AGENTS_SERVICE_URL || 'https://adgen-agents-710876076445.us-central1.run.app/run';

  console.log(`[run api] Starting agent run ${runId}, forwarding to ${agentsUrl}`);

  try {
    const res = await fetch(agentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        ...(process.env.AGENTS_API_TOKEN ? { 'X-Api-Key': process.env.AGENTS_API_TOKEN } : {}),
      },
      body: JSON.stringify({
        prompt: 'Do your segmentation task. Process pending users and return appropriate status.',
        max_rounds: 8,
      }),
      // Set a reasonable timeout for the initial request
      signal: AbortSignal.timeout(30000), // 30 seconds
    });

    if (!res.ok) {
      console.error(`[run api] Agents service returned ${res.status}: ${res.statusText}`);
      return Response.json({
        runId,
        forwarded: false,
        error: `Agents service error: ${res.status}`
      });
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[run api] Agent run ${runId} initiated successfully`);

    return Response.json({
      runId,
      forwarded: true,
      result: data,
      agentsUrl
    });
  } catch (error) {
    console.error(`[run api] Error forwarding to agents service:`, error);
    return Response.json({
      runId,
      forwarded: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


