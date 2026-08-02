import { NextRequest, NextResponse } from "next/server";

// ponytail: in-memory per-IP limiter, resets on cold start. Deters casual/scripted
// abuse of the paid /api/ask endpoint behind this gate — not a distributed attacker
// defense. Upgrade path if that ever matters: Vercel KV/Upstash rate limiting.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let role: "admin" | "guest" | null = null;
  if (password && password === process.env.ADMIN_PASSWORD) role = "admin";
  else if (password && password === process.env.GUEST_PASSWORD) role = "guest";

  if (!role) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set("ldash_session", `${role}:${secret}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
