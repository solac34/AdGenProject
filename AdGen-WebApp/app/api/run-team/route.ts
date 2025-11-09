export async function POST() {
  try {
    console.log('[run-team] Starting agent team execution...');

    const target = 'https://adgen-agents-cron-710876076445.us-central1.run.app';

    // Increase timeout to 10 minutes for long-running agent operations
    const timeoutMs = 10 * 60 * 1000; // 10 minutes = 600,000ms

    console.log(`[run-team] Making request to: ${target} with ${timeoutMs}ms timeout`);

    const resp = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AdGen-WebApp/1.0',
      },
      body: JSON.stringify({
        source: 'adgen-webapp',
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    console.log(`[run-team] Response received - Status: ${resp.status}, OK: ${resp.ok}`);

    // Handle different response types more gracefully
    let responseData;
    const contentType = resp.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await resp.json();
      } catch (jsonError) {
        console.warn('[run-team] Failed to parse JSON response:', jsonError);
        responseData = { error: 'Invalid JSON response' };
      }
    } else {
      // If not JSON, get text response
      const textResponse = await resp.text();
      responseData = { message: textResponse || 'No response body' };
    }

    console.log('[run-team] Response data:', responseData);

    return Response.json({
      ok: resp.ok,
      status: resp.status,
      response: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error('[run-team] Error occurred:', e);

    // Provide more specific error messages
    let errorMessage = 'Unknown error';
    let errorType = 'UnknownError';

    if (e instanceof Error) {
      errorMessage = e.message;
      errorType = e.name;

      if (e.name === 'TimeoutError') {
        errorMessage = 'Request timed out - the agent service may be taking longer than expected to respond';
      } else if (e.name === 'TypeError' && e.message.includes('fetch')) {
        errorMessage = 'Network error - unable to connect to the agent service';
      }
    }

    return Response.json({
      ok: false,
      error: errorMessage,
      errorType: errorType,
      timestamp: new Date().toISOString(),
      suggestion: errorType === 'TimeoutError'
        ? 'The agent service is running but taking longer than expected. This is normal for complex agent operations.'
        : 'Please check if the agent service is running and accessible.'
    }, { status: 500 });
  }
}


