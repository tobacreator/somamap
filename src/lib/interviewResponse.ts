import type { InterviewStepResult } from "./interview.ts";

/**
 * The interview route's answer mapping - blueprint Chapter 5.3 and Table 5.
 *
 * A pure function of a turn's outcome, so the mapping can be exercised without a server and the route
 * stays thin: read the body, run the state machine, answer. Nothing here reads the user's words, and
 * nothing here decides anything about them - the outcomes are the state machine's, and this only picks
 * the status and the body.
 *
 * `UNAVAILABLE_ANSWER` is the neutral answer for a turn that could not be produced at all - an
 * exception the boundary did not anticipate. It is deliberately **not** a crisis response, and it
 * carries no detail: a provider or internal failure must never be shown to a user as crisis language,
 * and a caller that sent an unexpected request learns nothing about the inside of the machine.
 */
export type RouteAnswer = { status: number; body: Record<string, unknown> };

export const UNAVAILABLE_ANSWER: RouteAnswer = { status: 503, body: { error: "unavailable" } };

/** The status and body for one turn. */
export function answerFor(result: InterviewStepResult): RouteAnswer {
  if (result.status === "invalid") return { status: 400, body: { error: "invalid request" } };

  if (result.status === "asking") {
    return {
      status: 200,
      body: {
        status: result.status,
        question: result.question,
        options: result.options ?? [],
        source: result.source ?? "fallback",
      },
    };
  }

  if (result.status === "complete") {
    return {
      status: 200,
      body: { status: result.status, card: result.card, usedFallback: result.usedFallback },
    };
  }

  return { status: 200, body: { status: "crisis" } };
}