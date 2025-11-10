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

    const cwd = process.cwd();
    const scriptPath = path.resolve(cwd, 'scripts', 'seedMega.js');
    const ecommerceUrl = (process.env.ECOMMERCE_SERVICE_URL || 'https://adgen-ecommerce-710876076445.us-central1.run.app').replace(/\/+$/,'');

    const hasCreds = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_JSON);
    const isProd = process.env.NODE_ENV === 'production';

    // If running locally without credentials, forward to ecommerce (historic behavior)
    if (!isProd && !hasCreds) {
      const url = `${ecommerceUrl}/api/seedmega`;
      // eslint-disable-next-line no-console
      console.log('[seedmega] No local GCP creds detected, forwarding to ecommerce:', url);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalUsers, orderChance, anonCount, usShare, euShare, otherShare }),
      });
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json({ ok: resp.ok, status: resp.status, data, forwarded: true });
    }

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { success: false, error: `Seed script not found at ${scriptPath}` },
        { status: 500 }
      );
    }
    // eslint-disable-next-line no-console
    console.log('[seedmega] Spawning local script', scriptPath);
    const child = spawn(process.execPath, [scriptPath], {
      cwd: cwd, // Use project root so node_modules is accessible
      env: {
        ...process.env,
        // Ensure Firestore DB selection is consistent with the app default
        FIRESTORE_DB_ID: process.env.FIRESTORE_DB_ID || 'adgen-db',
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

    const summarized = output.length > 5000 ? output.slice(-5000) : output;
    if (code !== 0) {
      // Fallback to quick seeder
      const quick = path.resolve(cwd, 'scripts', 'seedQuick.js');
      if (fs.existsSync(quick)) {
        console.warn('[seedmega] Falling back to seedQuick.js');
        const ch2 = spawn(process.execPath, [quick], { cwd: cwd, env: { ...process.env } });
        let out2 = '';
        ch2.stdout.on('data', (d) => (out2 += d.toString()));
        ch2.stderr.on('data', (d) => (out2 += d.toString()));
        const code2: number = await new Promise((resolve) => ch2.on('close', resolve));
        const sum2 = out2.length > 4000 ? out2.slice(-4000) : out2;
        if (code2 === 0) {
          return NextResponse.json({ success: true, code: 0, output: sum2, fallback: true, forwarded: false }, { status: 200 });
        }
        return NextResponse.json(
          { success: false, code: code2, output: sum2, fallback: true, forwarded: false },
          { status: 500 }
        );
      }
      // No fallback available; surface failure with 500
      return NextResponse.json(
        { success: false, code, output: summarized, fallback: false, forwarded: false },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, code, output: summarized, fallback: false, forwarded: false }, { status: 200 });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[seedmega] Error', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


