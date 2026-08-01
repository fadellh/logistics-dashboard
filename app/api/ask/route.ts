import { NextRequest, NextResponse } from "next/server";
import { orchestrate, type ConversationTurn } from "@/lib/ai/orchestrate";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const history: ConversationTurn[] = Array.isArray(body.history)
    ? (body.history as ConversationTurn[]).filter(
        (h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
      )
    : [];

  try {
    const result = await orchestrate(body.question, history);
    return NextResponse.json(result);
  } catch (err) {
    console.error("orchestrate() failed:", err);
    return NextResponse.json(
      { error: "Something went wrong answering that question. Please try again." },
      { status: 500 }
    );
  }
}
