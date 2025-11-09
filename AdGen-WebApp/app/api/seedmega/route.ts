import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

    // Fallback for monorepo local dev:
    // Prefer a local script in this app if present, otherwise use the adg-ecommerce script.
    const cwd = process.cwd();
    const localScript = path.resolve(cwd, 'scripts', 'seedMega.js');
    const ecomScript = path.resolve(cwd, '..', 'adg-ecommerce', 'scripts', 'seedMega.js');
    // Prefer ecommerce script which has its own dependencies; opt-in to local copy via env
    const preferLocal = process.env.USE_LOCAL_WEBAPP_SEED === '1';
    const scriptPath = preferLocal && fs.existsSync(localScript) ? localScript : ecomScript;
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { success: false, error: `Seed script not found at ${scriptPath}` },
        { status: 500 }
      );
    }
    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
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


