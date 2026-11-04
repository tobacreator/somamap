import { NextResponse } from "next/server";

import {
  INTERVIEW_BODY_MAX_BYTES,
  demoBudget,
  oversizedField,
  visitorKeyFrom,
} from "@/lib/demoBudget";
import { interviewStep } from "@/lib/interview";
import { answerFor, UNAVAILABLE_ANSWER, type RouteAnswer } from "@/lib/interviewResponse";
import { adapterFor, consoleViolationLogger, internalErrorRecord, modelMode } from "@/lib/models";

/**
 * The interview route - blueprint Chapter 5.3 and Table 5 (`src/app/api/**`, "the server
 * route that logs the attempt").
 *
 * Thin on purpose: read the body, run the state machine, answer. Every safety rule lives
 * in the library this route calls, so the route cannot be the place where one is
 * forgotten, and the violation record is written by the model boundary rather than here.
 *
 * The state machine is asynchronous (Phase 1, the async foundation): the card is worded
 * through a model boundary that may wait for a provider, so this route awaits it and
 * answers only once the turn has an outcome.
 *
 * Phase 2C adds the last boundary: an exception the state machine did not anticipate is answered with
 * a neutral `503 { error: "unavailable" }` and one content-free server record. It is never a crisis
 * response - a provider or internal failure must not be shown as crisis language - and the client
 * already renders that failure honestly ("That question could not be loaded, and nothing was saved.")
 * with a retry.
 *
 * The response carries the next question, or the card, or nothing at all on the crisis
 * path. The user's answers are never echoed back, and no reason string from the parser is
 * returned, so an unexpected request learns nothing about the inside of the machine.
 *
 * Phase 2D: every turn must also name the external provider the user was told about and agreed to.
 * That check is not here - it is the state machine's first rule after the crisis screen
 * (`interviewStep`), so it holds for any caller, and a turn without it is answered as a plain refusal
 * with nothing worded, generated or logged.
 *
 * Not built here: authentication and the database write. Both belong to the session work
 * that follows gate G2, and neither is claimed.
 *
 * `ISS-27` adds the public demo's guard, and only that: a body-size ceiling, a per-field length cap, and a
 * request budget counted per serverless instance (`src/lib/demoBudget.ts`). All three are decided before
 * the state machine is called, so a refused request never reaches an adapter and never costs a provider
 * call. It is an abuse deterrent, not authentication, and not a spend ceiling - the module states that
 * limitation in full, and this route's `429` claims no more than it can.
 */
export async function POST(request: Request): Promise<Response> {
  /**
   * The public demo's guard, and it comes first (`ISS-27`).
   *
   * Three refusals, cheapest first, and not one of them reaches the state machine or an adapter:
   *
   *   1. a declared body over `INTERVIEW_BODY_MAX_BYTES` is refused from `content-length` alone, before the
   *      body is read - so an oversized request costs a header read and nothing else;
   *   2. the abuse budget is counted next, so every request that arrives consumes a little of it, and a
   *      request over the limit is answered `429` with nothing worded, sent, or logged. The counter is per
   *      instance and the visitor key comes from a request header: it deters a loop, it does not cap a bill.
   *      `src/lib/demoBudget.ts` says so at length, and this route does not pretend otherwise;
   *   3. the body is read, measured again (a chunked request carries no length header), parsed, and each of
   *      the four text fields is checked against its own cap.
   *
   * What this deliberately is not: authentication. The interview stays open to anyone without an account by
   * design - that is what lets a person check in without one - and this bounds only how much one visitor
   * may ask for.
   */
  const declared = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declared) && declared > INTERVIEW_BODY_MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  const decision = demoBudget.admit(visitorKeyFrom(request.headers), Date.now());

  if (!decision.ok) {
    return NextResponse.json({ error: "busy" }, { status: 429 });
  }

  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (rawBody.length > INTERVIEW_BODY_MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // A field over its cap is refused here, so no unbounded text can reach a prompt.
  if (oversizedField(body) !== null) {
    return NextResponse.json({ error: "too long" }, { status: 400 });
  }

  const mode = modelMode();
  let answer: RouteAnswer;

  try {
    const result = await interviewStep(body, {
      adapter: adapterFor(mode),
      logger: consoleViolationLogger,
      mode,
    });

    answer = answerFor(result);
  } catch {
    consoleViolationLogger(internalErrorRecord(mode));
    answer = UNAVAILABLE_ANSWER;
  }

  return NextResponse.json(answer.body, { status: answer.status });
}
