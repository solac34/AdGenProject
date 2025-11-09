export async function POST(request: Request) {
  const runId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Parse request body for custom prompt and max_rounds
  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }

  const prompt = requestBody.prompt || 'Do your segmentation task. Process pending users and return appropriate status.';
  const maxRounds = requestBody.max_rounds || requestBody.maxRounds || 8;

  // Use the provided agents service URL
  const agentsUrl = process.env.AGENTS_SERVICE_URL || 'https://adgen-agents-710876076445.us-central1.run.app/run';

  console.log(`[run api] Starting agent run ${runId}, forwarding to ${agentsUrl}`);
  console.log(`[run api] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
  console.log(`[run api] Max rounds: ${maxRounds}`);

  // Construct webhook URL for the agent service
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  const webhookUrl = `${protocol}://${host}/api/agent-events`;
  const webhookSecret = process.env.WEBHOOK_SECRET || 'dev-secret-123';

  console.log(`[run api] Webhook URL: ${webhookUrl}`);

  try {
    const res = await fetch(agentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Api-Key': process.env.AGENTS_API_TOKEN || 'change-me	',
        ...(process.env.AGENTS_API_TOKEN ? { 'X-Api-Key': process.env.AGENTS_API_TOKEN } : {}),
      },
      body: JSON.stringify({
        prompt,
        max_rounds: maxRounds,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        run_id: runId,
      }),
      // Set a longer timeout for agent processing
      signal: AbortSignal.timeout(120000), // 2 minutes
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


