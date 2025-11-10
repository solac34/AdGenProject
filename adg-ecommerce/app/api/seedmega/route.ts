import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      totalUsers,
      orderChance,
      anonCount,
      usShare,
      euShare,
      otherShare
    } = body || {};

    // Run the seed script that lives inside this project
    const cwd = process.cwd(); // adg-ecommerce root in this service/container
    const scriptPath = path.join(cwd, "scripts", "seedMega.js");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: cwd, // Explicitly use project root so node_modules is accessible
      env: {
        ...process.env,
        SEED_TOTAL_USERS: String(totalUsers ?? ""),
        SEED_ORDER_CHANCE: String(orderChance ?? ""),
        SEED_ANON_COUNT: String(anonCount ?? ""),
        SEED_US_SHARE: String(usShare ?? ""),
        SEED_EU_SHARE: String(euShare ?? ""),
        SEED_OTHER_SHARE: String(otherShare ?? "")
      }
    });

    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));

    const code: number = await new Promise((resolve) => {
      child.on("close", resolve);
    });

    if (code !== 0) {
      return NextResponse.json(
        { success: false, code, output },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, code, output },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}


