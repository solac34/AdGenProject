import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      totalUsers,
      orderChance,
      anonCount,
      usShare,
      euShare,
      otherShare
    } = body || {};

    // If an external ecommerce service is configured, forward the request there
    const ecomUrl = (process.env.ECOMMERCE_SERVICE_URL || '').trim();
    if (ecomUrl) {
      const url = `${ecomUrl.replace(/\/+$/,'')}/api/seedmega`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalUsers,
          orderChance,
          anonCount,
          usShare,
          euShare,
          otherShare
        }),
      });
      const data = await resp.json();
      return NextResponse.json(data, { status: 200 });
    }

    // Fallback for monorepo local dev: spawn the script from adg-ecommerce
    const monorepoCwd = process.cwd().replace(/AdGen-WebApp.*/,'AdGenProject/adg-ecommerce');
    const child = spawn('node', ['scripts/seedMega.js'], {
      cwd: monorepoCwd,
      env: {
        ...process.env,
        SEED_TOTAL_USERS: String(totalUsers ?? ''),
        SEED_ORDER_CHANCE: String(orderChance ?? ''),
        SEED_ANON_COUNT: String(anonCount ?? ''),
        SEED_US_SHARE: String(usShare ?? ''),
        SEED_EU_SHARE: String(euShare ?? ''),
        SEED_OTHER_SHARE: String(otherShare ?? ''),
      }
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));

    const code: number = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    return new Response(
      JSON.stringify({ success: code === 0, code, output }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e?.message || String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


