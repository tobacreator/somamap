import { USER_LOCATION_MAX_LENGTH } from "./cardFidelity.ts";

/**
 * The public demo's abuse guard (`ISS-27`) - what bounds a stranger's use of the interview.
 *
 * Why this exists: the interview route is deliberately unauthenticated (a person can check in without an
 * account), and in live mode every turn asks the model provider to do work. A public URL therefore makes
 * that endpoint reachable by anyone, and nothing in the build counted requests. This module is the small
 * answer: a limit on how much one visitor may ask for, a second, wider one on how much the process will
 * serve at all, and the input caps that stop a single request from carrying an unbounded amount of text
 * into a model prompt.
 *
 * ## What this is not, stated plainly
 *
 * **The global counter is not a spend ceiling.** It lives in the memory of one serverless instance. A
 * deployment that scales to N instances can serve N times the limit, a cold start begins again from zero,
 * and a redeploy resets it. It bounds a runaway loop inside one warm instance; it does not bound the bill.
 *
 * The per-visitor window is a deterrent for the same reason plus one more: the visitor is identified from
 * a request header (`x-forwarded-for`, last hop) that a determined caller can vary, so it inconveniences
 * a script rather than stopping one. A real ceiling belongs to the platform - Vercel Firewall rate
 * limiting on `/api/interview` - and to the provider's own quota controls. Both are configured outside
 * this code, and neither is claimed here. The values below are deliberately generous for a person and
 * tight for a loop; they are a deterrent, and the build report says so in the same words.
 *
 * ## Shape
 *
 * Plain state and an injected clock: `createDemoBudget()` returns an object with `admit(visitor, now)`, so
 * every test builds its own instance, drives it with its own numbers, and never waits for real time. The
 * route uses the single instance exported at the bottom of this file.
 *
 * Nothing here reads a key, makes a request, or looks at the person's words. It counts requests.
 */

/**
 * The most text one field may carry.
 *
 * The interview is three short questions about how a sensation feels, and the answer field's own
 * placeholder is "A few words are enough." Five hundred characters is roughly eighty words - several
 * times a genuine answer - so the cap only ever stops one request from putting an unbounded amount of
 * text into a model prompt. The description is capped the same way because it is the same kind of
 * writing, in the box on the screen before the interview.
 */
export const INTERVIEW_TEXT_MAX_LENGTH = 500;
export const INTERVIEW_DESCRIPTION_MAX_LENGTH = 500;

/**
 * The location is capped at the length the card itself keeps.
 *
 * `userLocationFrom` (`cardFidelity.ts`) already normalises a location to `USER_LOCATION_MAX_LENGTH`
 * characters before it can reach a card, so accepting more here would only let a request carry text the
 * product would immediately discard. The constant is reused rather than repeated, so the two cannot drift
 * apart.
 */
export const INTERVIEW_REGION_MAX_LENGTH = USER_LOCATION_MAX_LENGTH;

/**
 * The most a request body may be, in characters - about 8 KB.
 *
 * The largest legitimate body is three answers plus a description plus a location plus the ids already
 * asked: roughly 2.5 KB of JSON at the caps above. Eight kilobytes leaves room for a longer legitimate
 * session and still refuses anything pathological before it is parsed. It is checked twice - against
 * `content-length` when that header is present, so an oversized request is refused before the body is read
 * at all, and against the text actually received, because a chunked request carries no length header.
 */
export const INTERVIEW_BODY_MAX_BYTES = 8_192;

/**
 * How many turns one visitor may take in one window, and how long that window is.
 *
 * A complete three-question session is four turns (three asking turns, and the turn that words the card),
 * and editing the answers replays them one answer per turn. A person trying the demo properly and then
 * experimenting with the card can reasonably spend ten to fifteen turns, so twenty in five minutes is
 * comfortable for a person and useless to a loop.
 */
export const VISITOR_WINDOW_MS = 5 * 60 * 1000;
export const VISITOR_LIMIT = 20;

/**
 * How many turns one instance will serve in one window, whoever is asking.
 *
 * About thirty complete sessions per instance per window. This is the backstop for the case the visitor
 * window cannot see - many callers at once, or one caller varying its header - and it is per instance,
 * which is exactly the limitation described at the top of this file. It is not a spend ceiling.
 */
export const GLOBAL_WINDOW_MS = 5 * 60 * 1000;
export const GLOBAL_LIMIT = 120;

/**
 * How many visitor windows are remembered at once.
 *
 * A map keyed by a header value is a map a caller can grow, so the oldest entry is dropped once the bound
 * is reached. Forgetting an old window only resets an old visitor's count, which is the safe direction:
 * the global counter is what still holds.
 */
export const MAX_TRACKED_VISITORS = 500;

/** A field that exceeded its cap. A category, never the text itself. */
export type OversizedField = "text" | "description" | "region" | "answer";

function tooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

/**
 * The first field that exceeds its cap, or null when every one of them is inside it.
 *
 * Only strings are measured, and only for length. A value of the wrong type is left to `parseTurn`
 * (`interview.ts`), which already refuses it - so this function cannot change what the state machine
 * accepts. It adds an upper bound and nothing else: a request that used to be valid is still valid.
 *
 * The four fields are the four the interview can carry: the answer on screen (`text`), the description
 * written before the interview, the location, and the answers already given (`answers[].text`).
 */
export function oversizedField(body: unknown): OversizedField | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;

  const raw = body as Record<string, unknown>;

  if (tooLong(raw.text, INTERVIEW_TEXT_MAX_LENGTH)) return "text";
  if (tooLong(raw.description, INTERVIEW_DESCRIPTION_MAX_LENGTH)) return "description";
  if (tooLong(raw.regionLabel, INTERVIEW_REGION_MAX_LENGTH)) return "region";

  if (Array.isArray(raw.answers)) {
    for (const entry of raw.answers) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (tooLong((entry as Record<string, unknown>).text, INTERVIEW_TEXT_MAX_LENGTH)) return "answer";
    }
  }

  return null;
}

/**
 * Which bucket a request counts against.
 *
 * The **last** hop of `x-forwarded-for` is used, not the first: a client can send a header of its own, and
 * a platform that appends the address it saw leaves the trustworthy value at the end. This is a deterrent
 * key, not an identity - see the note at the top of this file - and a request carrying no header at all
 * shares the `"unknown"` bucket, which is the conservative direction.
 */
export function visitorKeyFrom(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");

  if (typeof forwarded === "string") {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const last = hops[hops.length - 1];

    if (last !== undefined) return last.slice(0, 64);
  }

  const real = headers.get("x-real-ip");

  if (typeof real === "string" && real.trim().length > 0) return real.trim().slice(0, 64);

  return "unknown";
}

/** Whether a turn may be taken, and - for the server's own record - which counter refused it. */
export type BudgetDecision = { ok: true } | { ok: false; scope: "visitor" | "global" };

export type DemoBudget = {
  /** Count this turn and say whether it is allowed. `now` is milliseconds, injected so tests need no clock. */
  admit(visitor: string, now: number): BudgetDecision;
  /** How many visitor windows are held. For tests, and for the bounded-memory assertion. */
  trackedVisitors(): number;
};

export type DemoBudgetOptions = {
  visitorLimit?: number;
  visitorWindowMs?: number;
  globalLimit?: number;
  globalWindowMs?: number;
  maxTrackedVisitors?: number;
};

/**
 * One budget, with its own state.
 *
 * The route uses the instance at the bottom of this file; every test builds its own, which is what keeps
 * the tests independent of one another and of the order they run in. `now` is passed in rather than read
 * from a clock, so a window can be tested by moving time rather than by waiting for it.
 */
export function createDemoBudget(options: DemoBudgetOptions = {}): DemoBudget {
  const visitorLimit = options.visitorLimit ?? VISITOR_LIMIT;
  const visitorWindowMs = options.visitorWindowMs ?? VISITOR_WINDOW_MS;
  const globalLimit = options.globalLimit ?? GLOBAL_LIMIT;
  const globalWindowMs = options.globalWindowMs ?? GLOBAL_WINDOW_MS;
  const maxTracked = options.maxTrackedVisitors ?? MAX_TRACKED_VISITORS;

  const windows = new Map<string, number[]>();
  let served: number[] = [];

  /** The stamps still inside a window. Everything older has expired and is forgotten. */
  const within = (stamps: readonly number[], now: number, windowMs: number): number[] =>
    stamps.filter((stamp) => now - stamp < windowMs);

  return {
    admit(visitor, now) {
      served = within(served, now, globalWindowMs);

      if (served.length >= globalLimit) return { ok: false, scope: "global" };

      const recent = within(windows.get(visitor) ?? [], now, visitorWindowMs);

      if (recent.length >= visitorLimit) {
        // Written back pruned, so a refused visitor does not keep stale stamps for ever.
        windows.set(visitor, recent);

        return { ok: false, scope: "visitor" };
      }

      recent.push(now);
      windows.set(visitor, recent);
      served.push(now);

      // Bounded memory: the oldest window is forgotten first, and a Map keeps insertion order.
      while (windows.size > maxTracked) {
        const oldest = windows.keys().next();

        if (oldest.done === true) break;

        windows.delete(oldest.value);
      }

      return { ok: true };
    },

    trackedVisitors() {
      return windows.size;
    },
  };
}

/**
 * The budget the interview route uses.
 *
 * Module-level state, one per serverless instance - which is the limitation at the top of this file,
 * expressed in a single line of code.
 */
export const demoBudget = createDemoBudget();

