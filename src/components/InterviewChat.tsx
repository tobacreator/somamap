"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import Button, { FOCUS_RING } from "@/components/Button";
import CardView from "@/components/CardView";
import CrisisScreen from "@/components/CrisisScreen";
import Panel from "@/components/Panel";
import StepLabel from "@/components/StepLabel";
import TextField from "@/components/TextField";
import {
  CARD_CHANGE_REGION,
  CARD_EDIT,
  CARD_START_NEW,
  CARD_START_NEW_CONFIRM,
  CARD_START_NEW_KEEP,
  CARD_TITLE,
  EDIT_CANCEL,
  EDIT_NEXT,
  EDIT_PREVIOUS,
  EDIT_SAVE,
  EDIT_SAVING,
  EDIT_STEP_LABEL,
  INTERVIEW_ANSWER_HINT,
  INTERVIEW_ANSWER_LABEL,
  INTERVIEW_ANSWER_PLACEHOLDER,
  INTERVIEW_ANSWER_SUBMIT,
  INTERVIEW_BACK,
  INTERVIEW_COMPLETING,
  INTERVIEW_ERROR,
  INTERVIEW_LOADING,
  INTERVIEW_NOTE,
  INTERVIEW_PROGRESS,
  INTERVIEW_RETRY,
  INTERVIEW_STEP_LABEL,
  INTERVIEW_VOCABULARY_NOTE,
  INTERVIEW_VOCABULARY_SUMMARY,
  INTERVIEW_VOCABULARY_WORD_LABEL,
  JOURNAL_CARD_SAVED,
  JOURNAL_CARD_SAVE_FAILED,
  JOURNAL_CARD_SAVING,
  JOURNAL_CARD_SIGN_IN_LINK,
  JOURNAL_VIEW,
} from "@/lib/copy";
import {
  EMPTY_INTERVIEW_STATE,
  QUESTIONS_PER_SESSION,
  afterResponse,
  answerRequest,
  answersWith,
  askedOf,
  asInFlight,
  currentQuestion,
  firstRequest,
  progressFor,
  replayPlan,
  revisionAnswer,
  revisionAt,
  revisionLength,
  revisionOf,
  revisionQuestion,
  revisionWithAnswer,
  type FlowAnswer,
  type FlowQuestion,
  type InterviewFlowState,
  type InterviewRequest,
  type RevisionDraft,
} from "@/lib/interviewFlow";
import { withAcknowledgement, type ProcessingMode } from "@/lib/externalProcessing";
import { savedCardFromPayload, type CardIdentity } from "@/lib/journal";
import { saveIntentFor } from "@/lib/journalSave";
import type { BodyView } from "@/lib/regions";
import type { SensationCard } from "@/lib/schema";
import { addWordToAnswer, vocabularyFor, type VocabularyCandidate } from "@/lib/vocabulary";

/**
 * The interview screen - blueprint Chapter 5.3 (the Day-4 prompt) and gate G4.
 *
 * The screen asks the approved questions, one at a time, through the existing
 * `POST /api/interview` route: every question's wording arrives from the route (which takes it
 * from the reviewed bank), every answer travels back as the user typed it, and the card that
 * completes the session is handed to `CardView`, which renders the five schema fields and the
 * fixed disclaimer. Nothing is decided here: no question is written, no card is built, no field
 * is added, and no answer is reworded.
 *
 * Iron rule 4 is the route's first step on every answer, and a crisis answer replaces this
 * whole screen with the static `CrisisScreen` - the answers given so far are dropped with the
 * component, and nothing was ever written anywhere.
 *
 * The region the user selected on the map arrives as a prop and travels with every request, so the
 * route can keep it on the card (Entry 42). It is the fixed map's own label; this screen never
 * derives one, and a crisis stop carries nothing forward.
 *
 * Nothing is saved: this screen has no database and no storage call, and the note under the
 * answer field says so.
 *
 * `ISS-14` added the ways on from a finished card - revise the answers, change the region, or start
 * again - and all of them keep that property. A revision is a local draft carried back through the
 * same route one answer at a time, which is the only shape the crisis shield screens; a restart asks
 * first and then clears what is on screen. None of them writes anything, and none adds a question, a
 * field, or a word the user did not give.
 *
 * Phase 2D: this screen is reached only through the external processing disclosure in `CheckInFlow`,
 * and every request it makes carries the acknowledgement of the disclosed provider
 * (`withAcknowledgement`). It is not a boundary that can be skipped by rendering this component:
 * the server refuses a turn without that acknowledgement.
 */

const INTERVIEW_ENDPOINT = "/api/interview";

/**
 * The longest this screen waits for a turn before it stops waiting and offers a retry (`ISS-22`).
 *
 * The route has its own 20-second provider timeout, so this is a backstop rather than the mechanism. It
 * exists so that a hung connection, a proxy that never answers, or a route that never returns cannot
 * leave the screen waiting for ever: a stopped wait becomes the failure state, which has a retry, and
 * never a silent stall with a disabled field.
 */
const INTERVIEW_TIMEOUT_MS = 30_000;

/** Where a completed card is saved (the journal's only write). */
const JOURNAL_ENDPOINT = "/api/journal";

type PostResult = { ok: true; payload: unknown } | { ok: false; detail: string };

/**
 * The route call. A refusal or a transport failure is reported as a failure - never turned
 * into a card, and never retried automatically.
 *
 * This is the only place this app sends an interview request, and every request it sends carries the
 * acknowledgement of the provider the user was told about (Phase 2D, `withAcknowledgement`). It is
 * attached here rather than in each request builder because it is a precondition of sending, not part
 * of the interview's own shape: no builder can forget it, and a new request shape cannot omit it. The
 * server refuses any turn that does not name the disclosed provider.
 */
async function postInterview(body: InterviewRequest, mode: ProcessingMode): Promise<PostResult> {
  try {
    const response = await fetch(INTERVIEW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withAcknowledgement(body, mode)),
      signal: AbortSignal.timeout(INTERVIEW_TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, detail: `the route answered ${response.status}` };

    return { ok: true, payload: (await response.json()) as unknown };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.name : "unknown" };
  }
}

/**
 * The journal write, once per completed card.
 *
 * The body carries the card, the map view, and - when this card is already in the journal - the two ids
 * that name it (`ISS-24`). Nothing else: no answer list, no acknowledgement, no mode. The card is reduced
 * to the user's own values before it is sent (`savedCardFromPayload`), so a card the renderer presents as
 * unanswered is stored as empty rather than as the reviewed fallback's placeholder text, and a fallback
 * card's model-worded fields are dropped.
 *
 * The ids are what make a rebuild an update rather than a second entry: with them the route updates the
 * rows this card already occupies, and without them it inserts a new check-in. The reply's ids are handed
 * back so the next write can address the same row - a reply with no ids is treated as a failure, because a
 * card the screen cannot address again would duplicate itself the next time it is rebuilt.
 *
 * A refusal or a transport failure is a failure: nothing here reports success it did not get.
 */
async function postJournalCard(
  card: SensationCard,
  view: BodyView,
  identity: CardIdentity | null,
): Promise<{ ok: true; identity: CardIdentity } | { ok: false }> {
  try {
    const response = await fetch(JOURNAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        identity === null ? { card, view } : { card, view, cardId: identity.cardId, sessionId: identity.sessionId },
      ),
    });

    // 201 when the route created the card, 200 when it updated one: either way a write that landed.
    if (response.status !== 200 && response.status !== 201) return { ok: false };

    const payload = (await response.json()) as { id?: unknown; sessionId?: unknown };
    const cardId = typeof payload.id === "string" ? payload.id : "";
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

    if (cardId.length === 0 || sessionId.length === 0) return { ok: false };

    return { ok: true, identity: { cardId, sessionId } };
  } catch {
    return { ok: false };
  }
}

/** The session a completed card was worded from - what a revision starts from. */
export type InterviewSession = { asked: readonly FlowQuestion[]; answers: readonly FlowAnswer[] };

/**
 * The words a person can borrow when they have none (`ISS-22`), for the question in front of them
 * (`ISS-23`).
 *
 * The list is the question's own: `vocabularyFor` reads the id the route sent with it, so the words on
 * screen belong to the question being asked rather than to the product in general. A question whose
 * group is deliberately empty (`Q11`, `Q13`) renders **nothing** - not an empty disclosure - because
 * those questions ask for something only the person can supply. A suggestion reaches the answer only
 * when they tap it, which is what makes it theirs; the note says so, and the field stays theirs to edit
 * either way. Native `details`, so it costs no state and works without script.
 */
function VocabularyHelper({
  candidates,
  value,
  onChange,
  busy,
}: {
  candidates: readonly VocabularyCandidate[];
  value: string;
  onChange: (answer: string) => void;
  busy: boolean;
}) {
  if (candidates.length === 0) return null;

  return (
    <details className="text-label text-ink-muted">
      <summary className="cursor-pointer text-label font-medium text-accent-text">
        {INTERVIEW_VOCABULARY_SUMMARY}
      </summary>

      <div className="flex flex-col gap-2 pt-2">
        <p className="text-meta leading-5 text-ink-muted">{INTERVIEW_VOCABULARY_NOTE}</p>

        <ul className="flex flex-col gap-1">
          {candidates.map((candidate) => (
            <li key={candidate.word}>
              <button
                type="button"
                disabled={busy}
                aria-label={INTERVIEW_VOCABULARY_WORD_LABEL(candidate.word)}
                onClick={() => onChange(addWordToAnswer(value, candidate.word))}
                className={`flex min-h-11 w-full flex-col items-start rounded-control border border-hairline px-3 py-2 text-left hover:bg-tint disabled:text-ink-muted ${FOCUS_RING}`}
              >
                <span className="text-label font-medium text-ink">{candidate.word}</span>
                <span className="text-meta text-ink-muted">{candidate.meaning}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

type InterviewChatProps = {
  /**
   * The server's processing mode (`src/app/checkin/page.tsx` reads it per request and passes it down).
   * It selects the acknowledgement the client sends with every turn, so the field on the wire always
   * describes the processing the user was actually shown - in mock mode, that nothing is sent.
   */
  mode: ProcessingMode;
  /**
   * Whether a finished card may be written, from the server's own session read (`ISS-17`). False means the
   * interview still runs - it needs no account - but no write is attempted, and the card screen says why.
   * It is a boolean, so no token, cookie or identity is involved.
   */
  canSave: boolean;
  /**
   * The location the person chose or typed, verbatim, or "" when they named none (Phase 2H). It is a
   * prop rather than part of the session so that it survives everything the session survives - editing,
   * replay, and a change of location - and it travels with every request so the server can screen it
   * (the crisis lexicon reads it too) and keep it on the card. Nothing here reads, rewords or merges it.
   */
  regionLabel: string;
  /**
   * The description the user wrote on the check-in screen, verbatim, or "" when they wrote nothing
   * (`ISS-16/A`). It is a prop rather than part of the session so that it survives everything the
   * session survives - editing, replay, and a region change - and it travels with every request so the
   * server can screen it and keep it on the card. Nothing here reads it, rewords it or merges it.
   */
  description: string;
  /**
   * The map view the person was looking at when they checked in. It travels so the session row a saved
   * card writes can record it (`sessions.view`, which the schema requires); it is bookkeeping on the
   * session, never part of the card, and nothing on screen depends on it. The route accepts only the two
   * views the schema allows and refuses anything else, so a view the map cannot show is never recorded.
   */
  view: BodyView;
  onBack: () => void;
  /**
   * The session that produced the card. When the user goes back to the check-in step to change the
   * region and continues, this screen is mounted again with the session here, and it rebuilds the card
   * from the same answers against the new region instead of asking everything again (`ISS-14`). Null
   * when there is no finished session to come back to.
   */
  resume?: InterviewSession | null;
  /** Reports the session a card was worded from, so a later region change can rebuild it. */
  onSession?: (session: InterviewSession | null) => void;
  /**
   * The card this screen is rebuilding, when it is rebuilding one (`ISS-24`), or null when this is a new
   * check-in. It is held by the check-in flow rather than here for the same reason the session is: this
   * screen is unmounted when the user returns to the map, so anything that has to survive that round trip
   * lives above it. Null means "insert a new card"; a pair of ids means "update this one".
   */
  savedIdentity?: CardIdentity | null;
  /**
   * Reports the identity of the card that was just written, so the next rebuild updates that card instead
   * of adding another entry to the journal. Called only after a write that landed.
   */
  onSaved?: (identity: CardIdentity) => void;
  /** Confirmed restart: the check-in flow clears the session, the region and the words, and returns. */
  onStartNew: () => void;
};

export default function InterviewChat({
  mode,
  canSave,
  regionLabel,
  description,
  view,
  onBack,
  resume = null,
  onSession,
  savedIdentity = null,
  onSaved,
  onStartNew,
}: InterviewChatProps) {
  const [flow, setFlow] = useState<InterviewFlowState>(EMPTY_INTERVIEW_STATE);
  const [text, setText] = useState("");
  /** The answers being revised, or null when the user is not editing. */
  const [draft, setDraft] = useState<RevisionDraft | null>(null);
  /** Whether the restart is waiting on its confirmation. Nothing is cleared until it is given. */
  const [confirmingNew, setConfirmingNew] = useState(false);
  /** The last request and the state it was sent from, so a failure can be retried as it was. */
  const pending = useRef<{ request: InterviewRequest; previous: InterviewFlowState } | null>(null);
  /** False once the screen is gone, so a reply that arrives late is not written into it. */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  const send = useCallback(async (request: InterviewRequest, previous: InterviewFlowState) => {
    pending.current = { request, previous };
    setFlow(asInFlight(previous));

    const result = await postInterview(request, mode);

    if (!alive.current) return;

    setFlow(result.ok ? afterResponse(previous, result.payload) : { phase: "failed", detail: result.detail });
  }, [mode]);

  /**
   * A revision, carried back through the route one answer at a time (`ISS-14`).
   *
   * The order is the reason this is not one request. The route screens the words in `text` and does
   * not screen the `answers` array at all, so a revision sent as a batch would be the one path into a
   * card the crisis shield never checked. One answer per request means every revised answer is
   * screened exactly as the answer it replaces was, and a revision that turns an answer into crisis
   * language stops at the static crisis screen - with nothing saved, as always.
   *
   * A refusal or a transport failure stops the walk and shows the failure panel. Nothing is guessed
   * and no answer is dropped: the words are still the user's own and still on screen.
   */
  const replay = useCallback(
    async (revision: RevisionDraft): Promise<InterviewFlowState | null> => {
      let state: InterviewFlowState | null = null;

      for (const step of replayPlan(revision, regionLabel, description)) {
        pending.current = { request: step.request, previous: step.previous };
        setFlow(asInFlight(step.previous));

        const result = await postInterview(step.request, mode);

        if (!alive.current) return null;

        state = result.ok
          ? afterResponse(step.previous, result.payload)
          : { phase: "failed", detail: result.detail };

        setFlow(state);

        if (state.phase === "crisis" || state.phase === "failed") return state;
      }

      return state;
    },
    [regionLabel, description, mode],
  );

  /**
   * The session this screen was opened with, captured once, at mount.
   *
   * It has to be captured rather than read from the prop on every run. When a card completes, the
   * effect below reports the session back up, so the prop's identity changes on the next render - and
   * an effect that depended on the prop would see "a session to replay" again and walk the answers
   * through the route for ever. Captured at mount, this screen starts an interview exactly once per
   * visit: fresh when there is nothing to come back to, and a rebuild from the same answers when the
   * user returned to change the region.
   */
  const [openedWith] = useState(() => resume);

  // The first question, asked once when the interview opens - unless the user came back from a
  // finished card, in which case the answers they already gave are carried through the route again
  // and the card is rebuilt from them. `regionLabel` is in the dependencies because both paths carry
  // it; the map is unmounted by now, so the value cannot change mid-flight.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (openedWith !== null && openedWith.answers.length > 0) {
        await replay({ asked: openedWith.asked, answers: openedWith.answers, index: 0 });
        return;
      }

      const request = firstRequest(regionLabel, description);

      pending.current = { request, previous: EMPTY_INTERVIEW_STATE };

      const result = await postInterview(request, mode);

      if (cancelled || !alive.current) return;

      setFlow(
        result.ok ? afterResponse(EMPTY_INTERVIEW_STATE, result.payload) : { phase: "failed", detail: result.detail },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [regionLabel, description, openedWith, replay, mode]);

  /**
   * The session behind the card, reported upward once per completed card, so a later region change can
   * rebuild the card from the same answers rather than asking for them again. The ref is what makes it
   * once: the state object is the key, so a re-render of the same completed card reports nothing.
   */
  const reported = useRef<InterviewFlowState | null>(null);

  useEffect(() => {
    if (flow.phase !== "complete") return;
    if (reported.current === flow) return;

    reported.current = flow;
    onSession?.({ asked: flow.asked, answers: flow.answers });
  }, [flow, onSession]);

  /**
   * Saving the card, once per completed card.
   *
   * The guard is the completed state object itself, held in a ref: a re-render, a second effect run or a
   * repeated completion of the *same* object reports the same state, so the write happens exactly once per
   * finished card. Nothing is saved before a card exists, and nothing is saved that the strict schema
   * refuses - a payload that is not a five-field card is reported as a failed save rather than written as
   * something else.
   *
   * `ISS-24`: a finished card can be re-worded - `Edit my answers` or `Change the region` - and a rebuild
   * is not a second check-in. The identity of the card this screen is rebuilding is seeded from the prop
   * (the check-in flow holds it, so it survives the unmount the region change causes) and updated from
   * every reply, which is what makes the *next* completion update that row instead of inserting another.
   * The ref is read at the moment of the write rather than captured, so two completions inside one mount
   * both address the same card.
   *
   * The screen says which of the three outcomes happened. A failed write is never silent: the card stays
   * on screen, and the user is told it was not saved.
   */
  const saved = useRef<InterviewFlowState | null>(null);
  const identity = useRef<CardIdentity | null>(savedIdentity);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed" | "signin-required">("idle");
  /** What the screen says when the card was not written: the policy's own wording, never retyped here. */
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (flow.phase !== "complete") return;
    if (saved.current === flow) return;

    saved.current = flow;

    void (async () => {
      /**
       * `ISS-17`: with no session the card is not written, and no request is made. The behaviour this
       * replaces was a write that could not succeed - a 401, a console error, and the generic failure line,
       * which explained nothing about why. The decision belongs to `saveIntentFor` (src/lib/journalSave.ts),
       * so the policy is one tested function rather than a condition written here, and the sentence the
       * screen shows is the policy's own copy string.
       */
      const intent = saveIntentFor(canSave);

      if (!intent.attempt) {
        setSaveNotice(intent.notice);
        setSaveState("signin-required");

        return;
      }

      setSaveNotice(null);

      const card = savedCardFromPayload(flow.card);

      if (card === null) {
        setSaveState("failed");
        return;
      }

      setSaveState("saving");

      const outcome = await postJournalCard(card, view, identity.current);

      // The ids of the row this card now occupies: kept here for a further completion in this mount, and
      // reported upward so a rebuild after the next unmount updates the same card (`ISS-24`).
      if (outcome.ok) {
        identity.current = outcome.identity;
        onSaved?.(outcome.identity);
      }

      setSaveState(outcome.ok ? "saved" : "failed");
    })();
  }, [flow, view, canSave, onSaved]);

  const question = currentQuestion(flow);
  const busy = flow.phase === "submitting";
  /**
   * Whether the turn in flight is the one that finishes the session (`ISS-22`).
   *
   * The submitting state carries the answer just given, so a session whose answers are all in flight is
   * the turn that will word the card. That is what lets the screen say "putting your card together"
   * instead of promising a question that is not coming - the copy mismatch that made the last question
   * look like a freeze.
   */
  const completing = flow.phase === "submitting" && flow.answers.length >= QUESTIONS_PER_SESSION;
  const readyToSend = text.trim().length > 0 && !busy;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = answerRequest(flow, text, regionLabel, description);

    if (request === null || question === null || !readyToSend) return;

    // The answers so far plus this one: the next request carries them, and the route words the
    // card from them. The words themselves are sent exactly as typed.
    const previous: InterviewFlowState = {
      phase: "asking",
      question,
      answers: answersWith(flow, text),
      asked: askedOf(flow),
    };

    setText("");
    await send(request, previous);
  }

  async function retry() {
    const last = pending.current;

    if (last === null) {
      setFlow(EMPTY_INTERVIEW_STATE);
      return;
    }

    await send(last.request, last.previous);
  }

  /** Open the answers already given for revision. Nothing is sent until "Save changes". */
  function startEditing() {
    const revision = revisionOf(flow);

    if (revision !== null) setDraft(revision);
  }

  /**
   * Carry the revision back through the route. The draft is dropped once the card has come back or the
   * crisis screen has taken over; a failure keeps it, so the same words are still on screen to send
   * again.
   */
  async function saveEdits() {
    if (draft === null || busy) return;

    const outcome = await replay(draft);

    if (outcome === null || outcome.phase === "complete" || outcome.phase === "crisis") setDraft(null);
  }

  // Iron rule 4: the stop replaces the whole interview. The answers given so far go with the
  // component, and nothing was ever written anywhere.
  if (flow.phase === "crisis") {
    return <CrisisScreen onBack={onBack} />;
  }

  // Editing the answers already given (`ISS-14`). The question is one this session was actually
  // asked, taken from the session's own record, and the field opens with that answer exactly as it was
  // given. Nothing is sent until "Save changes", and no question is written here.
  if (draft !== null) {
    const editing = revisionQuestion(draft);
    const total = revisionLength(draft);

    if (editing !== null) {
      const atFirst = draft.index === 0;
      const atLast = draft.index >= total - 1;

      return (
        <>
          <header className="flex flex-col gap-2">
            <StepLabel>{EDIT_STEP_LABEL}</StepLabel>

            <p className="text-meta text-ink-muted">{INTERVIEW_PROGRESS(draft.index + 1, total)}</p>

            <h1 className="text-question font-serif font-semibold tracking-tight text-ink">
              {editing.text}
            </h1>
          </header>

          <div className="flex flex-col gap-2">
            <TextField
              id="edit-answer"
              label={INTERVIEW_ANSWER_LABEL}
              value={revisionAnswer(draft)}
              onChange={(value) => setDraft(revisionWithAnswer(draft, value))}
              multiline
              rows={3}
              placeholder={INTERVIEW_ANSWER_PLACEHOLDER}
              disabled={busy}
            />

            {/* The same helper the interview offers, for the question this revision is showing
                (`ISS-23`). The group comes from the revision's own question id - never from the
                question the interview happened to stop on - and a tap edits the draft's answer, so
                nothing is sent until "Save changes". */}
            <VocabularyHelper
              candidates={vocabularyFor(editing.id)}
              value={revisionAnswer(draft)}
              onChange={(value) => setDraft(revisionWithAnswer(draft, value))}
              busy={busy}
            />

            {/* The two ways between the questions the session asked. The first and last are ends, so
                the button that would leave the interview is disabled rather than hidden - a control
                that disappears moves everything else under the user's finger. */}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setDraft(revisionAt(draft, draft.index - 1))}
                disabled={busy || atFirst}
              >
                {EDIT_PREVIOUS}
              </Button>

              <Button
                variant="secondary"
                onClick={() => setDraft(revisionAt(draft, draft.index + 1))}
                disabled={busy || atLast}
              >
                {EDIT_NEXT}
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void saveEdits()} disabled={busy}>
                {EDIT_SAVE}
              </Button>

              <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
                {EDIT_CANCEL}
              </Button>
            </div>

            {busy ? (
              <p role="status" className="text-meta text-ink-muted">
                {EDIT_SAVING}
              </p>
            ) : null}
          </div>

          <p className="text-body leading-6 text-ink-muted">{INTERVIEW_NOTE}</p>
        </>
      );
    }
  }

  // The card. The screen owns the heading and the fixed line: the line arrives once from the
  // shell's footer, which is what removed the duplicate the audit found on this screen.
  //
  // The three controls under it are `ISS-14`: the card used to be the end of the road. None of them
  // writes anything anywhere - "Start a new check-in" clears what is on screen and nothing else.
  if (flow.phase === "complete") {
    return (
      <>
        <h1 id="card-title" className="text-2xl font-semibold tracking-tight text-ink">
          {CARD_TITLE}
        </h1>

        <CardView payload={flow.card} />

        {/* What happened to the save, said plainly. A failed write is never silent. */}
        {saveState === "saving" ? (
          <p role="status" className="text-meta text-ink-muted">
            {JOURNAL_CARD_SAVING}
          </p>
        ) : null}

        {saveState === "saved" ? (
          <p className="text-body leading-6 text-ink-muted">{JOURNAL_CARD_SAVED}</p>
        ) : null}

        {saveState === "failed" ? (
          <p role="alert" className="text-body leading-6 text-ink">
            {JOURNAL_CARD_SAVE_FAILED}
          </p>
        ) : null}

        {/* Not saved, and the reason: no session, so no write was attempted (`ISS-17`). The card is still
            here, nothing is claimed about it, and the one way to keep cards is one tap away. */}
        {saveState === "signin-required" && saveNotice !== null ? (
          <p role="status" className="text-body leading-6 text-ink">
            {saveNotice}
          </p>
        ) : null}

        {saveState === "signin-required" ? (
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center self-start text-label font-medium text-accent-text underline"
          >
            {JOURNAL_CARD_SIGN_IN_LINK}
          </Link>
        ) : null}

        <Link
          href="/journal"
          className="inline-flex min-h-11 items-center self-start text-label font-medium text-accent-text underline"
        >
          {JOURNAL_VIEW}
        </Link>

        <p className="text-body leading-6 text-ink-muted">{INTERVIEW_NOTE}</p>

        <div className="flex flex-wrap gap-3">
          <Button onClick={startEditing}>{CARD_EDIT}</Button>

          <Button variant="secondary" onClick={onBack}>
            {CARD_CHANGE_REGION}
          </Button>

          <Button variant="secondary" onClick={() => setConfirmingNew(true)} disabled={confirmingNew}>
            {CARD_START_NEW}
          </Button>
        </div>

        {/* The restart asks first, and clears nothing until it is answered: cancelling leaves the card
            and the answers exactly as they were. */}
        {confirmingNew ? (
          <Panel>
            <p className="text-body leading-6 text-ink">{CARD_START_NEW_CONFIRM}</p>

            <div className="flex flex-wrap gap-3">
              <Button onClick={onStartNew}>{CARD_START_NEW}</Button>

              <Button variant="secondary" onClick={() => setConfirmingNew(false)}>
                {CARD_START_NEW_KEEP}
              </Button>
            </div>
          </Panel>
        ) : null}
      </>
    );
  }

  if (flow.phase === "failed") {
    return (
      <>
        <StepLabel>{INTERVIEW_STEP_LABEL}</StepLabel>

        <Panel>
          <p role="alert" className="text-body leading-6 text-ink">
            {INTERVIEW_ERROR}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void retry()}>{INTERVIEW_RETRY}</Button>
            <Button variant="secondary" onClick={onBack}>
              {INTERVIEW_BACK}
            </Button>
          </div>
        </Panel>
      </>
    );
  }

  // No question yet: the first one is on its way, and no number is shown because there is no
  // question to number (the approved loading behaviour).
  if (question === null) {
    return (
      <>
        <StepLabel>{INTERVIEW_STEP_LABEL}</StepLabel>

        <p aria-live="polite" className="text-body text-ink-muted">
          {INTERVIEW_LOADING}
        </p>
      </>
    );
  }

  const progress = progressFor(flow);

  return (
    <>
      <header className="flex flex-col gap-2">
        <StepLabel>{INTERVIEW_STEP_LABEL}</StepLabel>

        {/* The meter and its number. The dots are decoration - the number beside them carries the
            same information in text, which is why the dots are hidden from assistive technology. */}
        {progress === null ? null : (
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="flex gap-1">
              {Array.from({ length: progress.total }, (_unused, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-6 rounded-pill ${index < progress.step ? "bg-accent" : "bg-rule"}`}
                />
              ))}
            </span>
            <p className="text-meta text-ink-muted">{INTERVIEW_PROGRESS(progress.step, progress.total)}</p>
          </div>
        )}

        <h1 aria-live="polite" className="text-question font-serif font-semibold tracking-tight text-ink">
          {question.text}
        </h1>
      </header>

      <form className="flex flex-col gap-2" onSubmit={(event) => void onSubmit(event)}>
        <TextField
          id="interview-answer"
          label={INTERVIEW_ANSWER_LABEL}
          value={text}
          onChange={setText}
          multiline
          rows={3}
          placeholder={INTERVIEW_ANSWER_PLACEHOLDER}
          disabled={busy}
          hint={busy || readyToSend ? undefined : INTERVIEW_ANSWER_HINT}
        />

        {/* The words a person can borrow when they have none (`ISS-22`), chosen for the question being
            asked (`ISS-23`): the group comes from the id the route sent with it, and a question with no
            group renders nothing at all. A suggestion reaches the answer only when they tap it, which is
            what makes it theirs; the note says so, and the field stays theirs to edit either way. */}
        <VocabularyHelper candidates={vocabularyFor(question.id)} value={text} onChange={setText} busy={busy} />

        <Button id="interview-submit" type="submit" disabled={!readyToSend} className="self-start">
          {INTERVIEW_ANSWER_SUBMIT}
        </Button>

        {busy ? (
          <p role="status" className="text-meta text-ink-muted">
            {completing ? INTERVIEW_COMPLETING : INTERVIEW_LOADING}
          </p>
        ) : null}
      </form>

      <p className="text-body leading-6 text-ink-muted">{INTERVIEW_NOTE}</p>
    </>
  );
}

