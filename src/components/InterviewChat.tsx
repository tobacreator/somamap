"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import Button from "@/components/Button";
import CardView from "@/components/CardView";
import CrisisScreen from "@/components/CrisisScreen";
import Panel from "@/components/Panel";
import StepLabel from "@/components/StepLabel";
import TextField from "@/components/TextField";
import {
  CARD_TITLE,
  INTERVIEW_ANSWER_HINT,
  INTERVIEW_ANSWER_LABEL,
  INTERVIEW_ANSWER_PLACEHOLDER,
  INTERVIEW_ANSWER_SUBMIT,
  INTERVIEW_BACK,
  INTERVIEW_ERROR,
  INTERVIEW_LOADING,
  INTERVIEW_NOTE,
  INTERVIEW_PROGRESS,
  INTERVIEW_RETRY,
  INTERVIEW_STEP_LABEL,
} from "@/lib/copy";
import {
  EMPTY_INTERVIEW_STATE,
  afterResponse,
  answerRequest,
  answersWith,
  asInFlight,
  currentQuestion,
  firstRequest,
  progressFor,
  type InterviewFlowState,
  type InterviewRequest,
} from "@/lib/interviewFlow";

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
 */

const INTERVIEW_ENDPOINT = "/api/interview";

type PostResult = { ok: true; payload: unknown } | { ok: false; detail: string };

/**
 * The route call. A refusal or a transport failure is reported as a failure - never turned
 * into a card, and never retried automatically.
 */
async function postInterview(body: InterviewRequest): Promise<PostResult> {
  try {
    const response = await fetch(INTERVIEW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) return { ok: false, detail: `the route answered ${response.status}` };

    return { ok: true, payload: (await response.json()) as unknown };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.name : "unknown" };
  }
}

export default function InterviewChat({ regionLabel, onBack }: { regionLabel: string; onBack: () => void }) {
  const [flow, setFlow] = useState<InterviewFlowState>(EMPTY_INTERVIEW_STATE);
  const [text, setText] = useState("");
  /** The last request and the state it was sent from, so a failure can be retried as it was. */
  const pending = useRef<{ request: InterviewRequest; previous: InterviewFlowState } | null>(null);

  const send = useCallback(async (request: InterviewRequest, previous: InterviewFlowState) => {
    pending.current = { request, previous };
    setFlow(asInFlight(previous));

    const result = await postInterview(request);

    setFlow(result.ok ? afterResponse(previous, result.payload) : { phase: "failed", detail: result.detail });
  }, []);

  // The first question, asked once when the interview opens. `regionLabel` is in the dependencies
  // because the first request carries it; the map is unmounted by now, so the value cannot change
  // and the question is still asked exactly once.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const request = firstRequest(regionLabel);

      pending.current = { request, previous: EMPTY_INTERVIEW_STATE };

      const result = await postInterview(request);

      if (cancelled) return;

      setFlow(
        result.ok ? afterResponse(EMPTY_INTERVIEW_STATE, result.payload) : { phase: "failed", detail: result.detail },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [regionLabel]);

  const question = currentQuestion(flow);
  const busy = flow.phase === "submitting";
  const readyToSend = text.trim().length > 0 && !busy;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = answerRequest(flow, text, regionLabel);

    if (request === null || question === null || !readyToSend) return;

    // The answers so far plus this one: the next request carries them, and the route words the
    // card from them. The words themselves are sent exactly as typed.
    const previous: InterviewFlowState = { phase: "asking", question, answers: answersWith(flow, text) };

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

  // Iron rule 4: the stop replaces the whole interview. The answers given so far go with the
  // component, and nothing was ever written anywhere.
  if (flow.phase === "crisis") {
    return <CrisisScreen onBack={onBack} />;
  }

  // The card. The screen owns the heading and the fixed line: the line arrives once from the
  // shell's footer, which is what removed the duplicate the audit found on this screen.
  if (flow.phase === "complete") {
    return (
      <>
        <h1 id="card-title" className="text-2xl font-semibold tracking-tight text-ink">
          {CARD_TITLE}
        </h1>

        <CardView payload={flow.card} />

        <p className="text-body leading-6 text-ink-muted">{INTERVIEW_NOTE}</p>
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

        <Button id="interview-submit" type="submit" disabled={!readyToSend} className="self-start">
          {INTERVIEW_ANSWER_SUBMIT}
        </Button>

        {busy ? (
          <p role="status" className="text-meta text-ink-muted">
            {INTERVIEW_LOADING}
          </p>
        ) : null}
      </form>

      <p className="text-body leading-6 text-ink-muted">{INTERVIEW_NOTE}</p>
    </>
  );
}

