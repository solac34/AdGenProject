export async function POST() {
  try {
    const target = 'https://adgen-agents-cron-710876076445.us-central1.run.app';
    
    // Dümdüz POST isteği at, cronjob her şeyi halleder
    const resp = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });
    
    const responseData = await resp.json().catch(() => ({}));
    console.log('[run-team] cronjob response:', responseData);
    
    return Response.json({ 
      ok: resp.ok, 
      status: resp.status,
      response: responseData 
    });
  } catch (e) {
    console.error('[run-team] error', e);
    return Response.json({ 
      ok: false, 
      error: e instanceof Error ? e.message : String(e) 
    }, { status: 500 });
  }
}


