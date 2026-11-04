import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Journal identity (`ISS-24`) - the wiring that keeps one journal entry per check-in.
 *
 * `journalStore.test.ts` proves the two write paths themselves. These prove the wiring around them: that
 * the screen keeps the ids a save returned, that it sends them when it rebuilds a card and omits them when
 * the card is new, that the check-in flow holds them across the unmount a region change causes, that a
 * confirmed restart clears them, and that the route validates them, dispatches to the right path, and still
 * refuses to report a write it did not get.
 *
 * Source-level, because every one of these decisions is about what one file passes to another.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

const CHAT = "src/components/InterviewChat.tsx";
const FLOW = "src/components/CheckInFlow.tsx";
const ROUTE = "src/app/api/journal/route.ts";
const STORE = "src/lib/journalStore.ts";

describe("the identity a saved card keeps", () => {
  it("is seeded from the check-in flow, held in a ref, and read at the moment of the write", () => {
    const chat = source(CHAT);

    assert.ok(chat.includes("const identity = useRef<CardIdentity | null>(savedIdentity);"));
    assert.ok(chat.includes("postJournalCard(card, view, identity.current)"), "read, not captured");
  });

  it("is sent only when the card already exists, and left out for a new check-in", () => {
    const chat = source(CHAT);

    assert.ok(
      chat.includes(
        "identity === null ? { card, view } : { card, view, cardId: identity.cardId, sessionId: identity.sessionId }",
      ),
      "the same write, with or without the ids that name the row",
    );
  });

  it("comes back from the write and is reported upward only when the write landed", () => {
    const chat = source(CHAT);
    const success = chat.indexOf("if (outcome.ok) {");
    const kept = chat.indexOf("identity.current = outcome.identity;");
    const reported = chat.indexOf("onSaved?.(outcome.identity);");

    assert.ok(success !== -1 && kept !== -1 && reported !== -1, "the ids are kept and reported");
    assert.ok(success < kept && kept < reported, "and only inside the success branch");
    assert.ok(
      chat.includes("if (cardId.length === 0 || sessionId.length === 0) return { ok: false };"),
      "a reply carrying no ids is a failure: a card the screen cannot address again would duplicate",
    );
  });

  it("does not change how often a card is written: once per completion, guarded by the state itself", () => {
    const chat = source(CHAT);

    assert.ok(chat.includes("if (saved.current === flow) return;"));
    assert.equal([...chat.matchAll(/postJournalCard\(card, view, identity\.current\)/g)].length, 1, "one write site");
  });
});

describe("the check-in flow holds the identity where it survives the remount", () => {
  const flow = source(FLOW);

  it("keeps it beside the session, and passes both down to the interview", () => {
    assert.ok(flow.includes("const [identity, setIdentity] = useState<CardIdentity | null>(null);"));
    assert.ok(flow.includes("const onSaved = useCallback((next: CardIdentity) => setIdentity(next), []);"));
    assert.ok(flow.includes("resume={session}"));
    assert.ok(flow.includes("savedIdentity={identity}"));
    assert.ok(flow.includes("onSaved={onSaved}"));
  });

  it("clears it when a genuinely new check-in begins, and on the crisis way back", () => {
    const startNew = flow.indexOf("const startNewCheckIn = useCallback(() => {");
    const cleared = flow.indexOf("setIdentity(null);", startNew);
    const region = flow.indexOf('setRegionLabel("");', startNew);

    assert.ok(startNew !== -1, "the restart exists");
    assert.ok(cleared !== -1 && cleared < region, "the identity goes with the session and the region");
    assert.equal([...flow.matchAll(/setIdentity\(null\);/g)].length, 2, "the restart and the crisis stop");
  });

  it("does not clear it when the user only changes the region", () => {
    // The card's own way back to the map clears neither the session nor the identity, and that is exactly
    // what makes the rebuild that follows update the same card instead of adding another.
    const back = flow.indexOf("// Back to the map keeps the words");
    const upTo = flow.slice(back, back + 500);

    assert.ok(back !== -1, "the region-change handler exists");
    assert.ok(upTo.includes('setStep("check-in")'));
    assert.equal(upTo.includes("setIdentity(null)"), false);
    assert.equal(upTo.includes("setSession(null)"), false);
  });
});

describe("the journal route", () => {
  const route = source(ROUTE);

  it("validates both ids as uuids and refuses a half identity without writing", () => {
    assert.ok(route.includes("const claimsIdentity = record.cardId !== undefined || record.sessionId !== undefined;"));
    assert.ok(route.includes("isCardId(cardId) && isCardId(sessionId)"));
    assert.ok(route.includes("if (claimsIdentity && identity === null)"));
    assert.ok(route.includes('{ error: "invalid request" }, { status: 400 }'));
  });

  it("dispatches to the update path only when the ids are there, and keeps the insert path otherwise", () => {
    const dispatch = route.indexOf("? await saveJournalCard(");

    assert.ok(dispatch !== -1, "one dispatch on the identity");
    assert.ok(route.indexOf(": await updateJournalCard(") > dispatch, "the update path is the other branch");
    assert.ok(route.indexOf("identity === null") < dispatch, "and the identity is what decides");
  });

  it("validates the card and reduces it to the user's own values before either write", () => {
    const parsed = route.indexOf("sensationCardSchema.safeParse(record.card)");
    const reduced = route.indexOf("savedCardFromPayload(parsed.data)");
    const dispatched = route.indexOf("? await saveJournalCard(");

    assert.ok(parsed !== -1 && reduced !== -1 && dispatched !== -1);
    assert.ok(parsed < reduced && reduced < dispatched, "the strict schema decides before anything is written");
    assert.equal(route.includes("upsert"), false, "no broad write reaches past the schema either");
  });

  it("reports a failed write as a failure and never as a save", () => {
    assert.ok(route.includes('return NextResponse.json({ error: "not saved" }, { status: 500 });'));
    assert.ok(route.includes("{ status: identity === null ? 201 : 200 }"), "a write that landed is the only success");
    assert.ok(route.includes("id: result.id, sessionId: result.sessionId"), "and both ids travel back");
  });

  it("leaves the consent and crisis boundaries exactly as they were", () => {
    // The journal write is reached only after a completed interview, the interview only through the
    // disclosure, and the disclosure only by an explicit acknowledgement. This work changed none of those
    // files, and the client still acknowledges the disclosed provider on every turn.
    assert.ok(source(CHAT).includes("withAcknowledgement(body, mode)"));
    assert.ok(source("src/lib/externalProcessing.ts").includes("acknowledgementFor"));
    assert.ok(source("src/lib/crisis.ts").includes("gateForInput"));
  });
});

describe("the store's two paths", () => {
  it("are one insert path and one update path, with no upsert and no broad write", () => {
    const store = source(STORE);

    assert.equal(store.includes("upsert"), false, "no upsert: the two paths are explicit");
    assert.ok(store.includes('method: "POST"'), "the insert path");
    assert.equal([...store.matchAll(/method: "PATCH"/g)].length, 2, "the session update and the card update");
    assert.ok(store.includes("if (!isCardId(identity.cardId) || !isCardId(identity.sessionId))"), "validated here too");
  });
});
