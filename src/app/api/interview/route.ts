import { NextResponse } from "next/server";

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
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
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
