import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The authenticated journey's wiring (`ISS-17`), held still.
 *
 * Four of these fixes are structural - a route that clears a cookie, an ordering inside two server
 * components, a destination carried from the address bar, a decision handed down from the server to the
 * card screen - and structure is what a source check can hold. The behaviour they rest on is unit-tested
 * (`signInDestination.test.ts`, `journalSave.test.ts`, `journalStore.test.ts`), and the ordering
 * assertion here is a real one: it compares positions in the file, so moving the configuration read back
 * above the session check fails this test rather than quietly reintroducing the leak.
 *
 * The scans are deliberately narrow - they name the exact statements the fixes depend on - so they cannot
 * pass on a file that merely mentions the right words somewhere.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("sign-out", () => {
  const route = source("src/app/api/auth/sign-out/route.ts");

  it("clears the one cookie this app sets, using the session module's own name", () => {
    assert.ok(route.includes('import { SESSION_COOKIE } from "@/lib/authSession"'));
    assert.ok(route.includes("export async function POST"));
    assert.ok(route.includes("store.delete(SESSION_COOKIE)"));
  });

  it("deletes by constant only, so no cookie can be cleared by accident", () => {
    assert.equal(/delete\(\s*["']/.test(route), false, "the cookie name must come from SESSION_COOKIE");
  });

  it("does not reach for a key, a provider or another service", () => {
    for (const forbidden of ["anonKey", "SERVICE_ROLE", "authorization", "fetch("]) {
      assert.equal(route.includes(forbidden), false, forbidden);
    }
  });

  it("is offered by Settings, and sends the browser to the sign-in screen", () => {
    assert.ok(source("src/app/settings/page.tsx").includes("SignOutButton"));

    const button = source("src/components/SignOutButton.tsx");

    assert.ok(button.includes('fetch("/api/auth/sign-out"'));
    assert.ok(button.includes('router.push("/sign-in")'));
  });

  it("never navigates before the server has answered", () => {
    const button = source("src/components/SignOutButton.tsx");

    assert.ok(button.indexOf("response.ok") < button.indexOf('router.push("/sign-in")'));
    assert.ok(button.includes("SETTINGS_SIGN_OUT_FAILED"), "a failed sign-out must say so");
  });
});

describe("protected routes check the session before the configuration", () => {
  for (const route of ["src/app/settings/page.tsx", "src/app/journal/page.tsx"]) {
    it(`${route} reads the session first, and resolves its target only afterwards`, () => {
      const text = source(route);
      const session = text.indexOf("currentSession()");
      const config = text.indexOf("supabaseTarget()");

      assert.ok(session !== -1, "the route must read the session");
      assert.ok(config !== -1, "the route must still resolve its target");
      assert.ok(session < config, "the session must be read before the configuration is resolved");
    });
  }

  it("sends a signed-out reader of settings to sign-in, carrying the page back", () => {
    const settings = source("src/app/settings/page.tsx");

    assert.ok(settings.includes('redirect("/sign-in?next=%2Fsettings")'));
    assert.ok(settings.indexOf("redirect(") < settings.indexOf("supabaseTarget()"));
  });

  /**
   * The journal is the deliberate exception (`ISS-28`).
   *
   * It used to redirect a signed-out reader to sign-in, which put the product's own record of a person's
   * words behind an account. The product decision is that a visitor can finish a check-in, make several
   * cards and read their journal without one - so the journal renders the cards this browser tab is
   * holding instead of a wall. What is *not* relaxed is the persistent half: `listJournalCards` is still
   * reached only with a verified session, it still reads as the user under RLS, and the only write in this
   * area still needs an account (and an explicit confirmation).
   */
  it("gives a signed-out reader of the journal their in-session cards, not a sign-in wall", () => {
    const journal = source("src/app/journal/page.tsx");

    assert.ok(
      journal.includes("if (!session) return <AnonJournal signedIn={false} />"),
      "a visitor must get the in-session journal",
    );
    assert.equal(journal.includes('redirect("/sign-in'), false, "no sign-in wall on the journal");
    assert.ok(journal.indexOf("!session") < journal.indexOf("supabaseTarget()"), "the session is read first");
    assert.ok(journal.includes("listJournalCards"), "the persistent list is still read with a session");
  });

  it("shows the refusal only to a signed-in reader, and keeps it honest", () => {
    // The journal's refusal branch sits after the session is known to exist...
    const journal = source("src/app/journal/page.tsx");

    assert.ok(journal.indexOf("!session") < journal.indexOf("!resolution.ok"));

    // ...and settings resolves the target only once the session exists, so an unauthenticated request
    // cannot reach the panel or the reason it carries.
    const settings = source("src/app/settings/page.tsx");

    assert.ok(
      settings.includes(
        "resolution.ok ? { mode: resolution.target.mode, host: targetHost(resolution.target) } : null",
      ),
    );
    assert.ok(settings.includes("reason={resolution.ok ? null : resolution.reason}"));
  });
});

describe("where a sign-in lands", () => {
  it("is decided from the address bar, validated, and defaulted to the journal", () => {
    const page = source("src/app/sign-in/page.tsx");
    const form = source("src/components/SignInForm.tsx");

    assert.ok(page.includes("signInDestination(params.next)"));
    assert.ok(page.includes("searchParams"));
    assert.ok(form.includes("signInDestination(next)"));
    assert.ok(form.includes("router.push(destination)"));
    assert.equal(form.includes('router.push("/settings")'), false, "the hard-coded destination is gone");
  });
});

describe("a card finished without a session", () => {
  const page = source("src/app/checkin/page.tsx");
  const flow = source("src/components/CheckInFlow.tsx");
  const chat = source("src/components/InterviewChat.tsx");

  it("is decided on the server and handed down as a boolean", () => {
    assert.ok(page.includes("await currentSession()"));
    assert.ok(page.includes("signedIn={session !== null}"));
    assert.ok(flow.includes("signedIn }: { mode: ProcessingMode; signedIn: boolean }"));
    assert.ok(flow.includes("canSave={signedIn}"));
  });

  it("makes no save request, and says why instead", () => {
    const decision = chat.indexOf("saveIntentFor(canSave)");
    const write = chat.indexOf("postJournalCard(card, view, identity.current)");

    assert.ok(decision !== -1, "the intent must be decided");
    assert.ok(write !== -1, "the write must still exist for a signed-in card");
    assert.ok(decision < write, "the intent is decided before any write");
    assert.ok(chat.includes("if (!intent.attempt)"));
    assert.ok(chat.includes('setSaveState("signin-required")'));
  });

  it("offers the sign-in link, and shows the policy's own sentence", () => {
    assert.ok(chat.includes('href="/sign-in"'));
    assert.ok(chat.includes("JOURNAL_CARD_SIGN_IN_LINK"));
    assert.ok(chat.includes("{saveNotice}"));
  });

  it("still writes the card when there is a session", () => {
    assert.ok(chat.includes('setSaveState(outcome.ok ? "saved" : "failed")'));
    assert.ok(chat.includes("JOURNAL_CARD_SAVED"));
    assert.ok(source("src/app/api/journal/route.ts").includes("saveJournalCard("));
  });

  /**
   * `ISS-27` added a guard to the interview route. This holds the property the public demo depends on:
   * the guard must not have brought a database with it. The interview has no Supabase access at all, so a
   * signed-out visitor's turn cannot leave a row anywhere - and that stays true however the guard grows.
   */
  it("leaves the interview route with no database, whoever is asking", () => {
    const route = source("src/app/api/interview/route.ts");

    for (const forbidden of [
      "journalStore",
      "appRows",
      "storageHttpClient",
      "authSession",
      "supabaseTarget",
    ]) {
      assert.equal(route.includes(forbidden), false, `the interview route must not reach ${forbidden}`);
    }

    assert.equal(
      /saveJournalCard|updateJournalCard/.test(route),
      false,
      "no write path belongs in the interview route",
    );
  });
});

/**
 * The operator-side record a failed sign-in leaves behind (`ISS-28` follow-up).
 *
 * The incident this closes: a production deployment carried a publishable key that did not belong to the
 * project in its URL, the account service refused every sign-in, and nothing anywhere said so - the screen
 * showed one sentence and the logs showed nothing at all, so the failure looked exactly like a person typing
 * the wrong password. These assertions hold the three properties that make that impossible to repeat: the
 * deployment's own failures are recorded, the record is content-free, and the answer to a caller is
 * unchanged.
 */
describe("what a failed sign-in leaves in the log", () => {
  const route = source("src/app/api/auth/sign-in/route.ts");

  it("records a refused configuration and a provider-side refusal, each with a category", () => {
    assert.ok(route.includes('recordRefusal("configuration-refused", resolution.reason)'));
    assert.ok(route.includes('recordRefusal("provider-refusal", result.reason)'));
    assert.ok(
      route.includes('result.reason !== "rejected"'),
      "an ordinary wrong password writes nothing, so the log cannot be filled by a stranger",
    );
  });

  it("records one content-free line, in the shape the model boundary already uses", () => {
    assert.ok(route.includes("console.warn(`SomaMap sign-in: ${JSON.stringify({ event, reason })}`)"));

    for (const forbidden of ["email", "password", "token", "anonKey", "apiKey"]) {
      assert.equal(
        new RegExp(`console\\.(log|warn|error)\\([^)]*${forbidden}`, "i").test(route),
        false,
        `the record must not carry ${forbidden}`,
      );
    }
  });

  it("still answers one flat message, so no caller learns anything new", () => {
    assert.ok(route.includes('NextResponse.json({ error: "sign-in failed" }, { status: 401 })'));
  });
});

