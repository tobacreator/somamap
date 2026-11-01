import { NextResponse } from "next/server";

import { interviewStep } from "@/lib/interview";
import { adapterFor, consoleViolationLogger, modelMode } from "@/lib/models";

/**
 * The interview route - blueprint Chapter 5.3 and Table 5 (`src/app/api/**`, "the server
 * route that logs the attempt").
 *
 * Thin on purpose: read the body, run the state machine, answer. Every safety rule lives
 * in the library this route calls, so the route cannot be the place where one is
 * forgotten, and the violation record is written by the model boundary rather than here.
 *
 * The response carries the next question, or the card, or nothing at all on the crisis
 * path. The user's answers are never echoed back, and no reason string from the parser is
 * returned, so an unexpected request learns nothing about the inside of the machine.
 *
 * Not built here: authentication and the database write. Both belong to the session work
 * that follows gate G2, and neither is claimed.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const mode = modelMode();
  const result = interviewStep(body, { adapter: adapterFor(mode), logger: consoleViolationLogger, mode });

  if (result.status === "invalid") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (result.status === "asking") {
    return NextResponse.json({ status: result.status, question: result.question });
  }

  if (result.status === "complete") {
    return NextResponse.json({ status: result.status, card: result.card, usedFallback: result.usedFallback });
  }

  return NextResponse.json({ status: "crisis" });
}
