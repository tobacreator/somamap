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
    it(`${route} reads the session first, and sends a signed-out reader to sign-in`, () => {
      const text = source(route);
      const session = text.indexOf("currentSession()");
      const config = text.indexOf("supabaseTarget()");

      assert.ok(session !== -1, "the route must read the session");
      assert.ok(config !== -1, "the route must still resolve its target");
      assert.ok(session < config, "the session must be read before the configuration is resolved");
      assert.ok(text.includes('redirect("/sign-in'), "a signed-out reader must be sent to sign-in");
      assert.ok(text.indexOf("redirect(") < config, "the redirect must precede the configuration read");
    });
  }

  it("carries the reader back to the page they asked for", () => {
    assert.ok(source("src/app/journal/page.tsx").includes('redirect("/sign-in?next=%2Fjournal")'));
    assert.ok(source("src/app/settings/page.tsx").includes('redirect("/sign-in?next=%2Fsettings")'));
  });

  it("shows the refusal only to a signed-in reader, and keeps it honest", () => {
    // The journal's refusal branch sits after the redirect...
    const journal = source("src/app/journal/page.tsx");

    assert.ok(journal.indexOf('redirect("/sign-in') < journal.indexOf("!resolution.ok"));

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
});
