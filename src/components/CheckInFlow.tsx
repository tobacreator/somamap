"use client";

import { useCallback, useState } from "react";

import BodyMap from "@/components/BodyMap";
import Button from "@/components/Button";
import CrisisScreen from "@/components/CrisisScreen";
import ExternalProcessingNotice from "@/components/ExternalProcessingNotice";
import InterviewChat, { type InterviewSession } from "@/components/InterviewChat";
import StepLabel from "@/components/StepLabel";
import TextField from "@/components/TextField";
import {
  CHECKIN_BOX_KEPT,
  CHECKIN_BOX_LABEL,
  CHECKIN_BOX_PLACEHOLDER,
  CHECKIN_BOX_SUBMIT,
  CHECKIN_INSTRUCTION,
  CHECKIN_PROMPT,
  CHECKIN_STEP_LABEL,
  EXTERNAL_PROCESSING_DECLINED,
  LOCATION_FIELD_LABEL,
  LOCATION_FIELD_PLACEHOLDER,
  LOCATION_MAP_CHOOSE,
  LOCATION_MAP_HIDE,
  LOCATION_PREFER_NOT_TO_SAY,
  LOCATION_PREFER_NOT_TO_SAY_NOTE,
  REGION_MAP_NOTE,
} from "@/lib/copy";
import {
  EMPTY_CHECK_IN_STATE,
  backToEmptyCheckIn,
  checkInFlowAfterSubmit,
  gateForInput,
  type CheckInFlowState,
} from "@/lib/crisis";
import type { ProcessingMode } from "@/lib/externalProcessing";
import type { BodyView } from "@/lib/regions";

/**
 * The check-in flow - the map, the free-text box, iron rule 4's stop, the processing disclosure, and
 * the hand-off to the interview.
 *
 * Three steps live here. The first is the map and the box: the body map names the region from
 * fixed geometry, and the box is the free-text surface iron rule 4's lexicon guards. Clean words move
 * the flow to the second step, the disclosure (`ExternalProcessingNotice`), which is the only way on to
 * the third, the interview (`InterviewChat`). That screen asks the approved questions through
 * `POST /api/interview` and renders the card that route validates; a crisis hit stops the flow instead,
 * and neither the disclosure nor the interview is ever mounted.
 *
 * The crisis stop replaces the whole flow rather than sitting inside it: when the lexicon
 * matches, the map, the box and the next steps are gone and only the static screen remains. The
 * decision itself is not made here - it comes from `src/lib/crisis.ts`, so the same pure
 * functions are what the tests exercise. The check-in step calls no model; the interview step
 * reaches one only through the route, which words the card through the model boundary (mock
 * mode by default) and validates it against the strict five-field schema.
 *
 * `mode` is the server's own processing mode, handed down as a prop (`src/app/checkin/page.tsx` reads it
 * per request). It decides two things and nothing else: which disclosure wording the user sees, and
 * which acknowledgement the client sends with each turn. The client never guesses it, so the words on
 * screen and the field on the wire always describe the same processing.
 *
 * Nothing is saved in any step: no database write, no storage call, no session row. The
 * fixed line from iron rule 5 renders on every screen of every step.
 *
 * The region the user selects on the map is held here, because it has to survive the step change:
 * the map unmounts when the interview starts, and the interview sends the label with every turn so
 * the card can carry it (Entry 42). It is a label from the fixed map, never a model's.
 *
 * `ISS-14` added the two ways on from a finished card, and both are decisions about what this flow
 * holds rather than about the card itself: "change the region" returns to the map with the session
 * kept, so the card is rebuilt from the same answers; "start a new check-in" clears the session, the
 * region and the words. Neither writes anything - this flow has no storage to write to.
 *
 * `ISS-16/A` and `ISS-16/F` add the description to what survives. It is the one thing this flow holds
 * that is not an answer: it travels to the interview as a prop, so it reaches card generation and
 * outlives editing, replay and a region change. Only a confirmed restart or a crisis stop clears it,
 * and both of those clear the whole session.
 *
 * `Phase 2H` adds the location as free text. The map is a suggestion and its tap targets are the same
 * fourteen labels, but the answer is the editable field: tapping a zone fills it, and the person may
 * replace it with anything - "left wrist", "jaw", "the spot under my right shoulder blade". The field's
 * text is what travels, and "Prefer not to say" is an explicit choice that sends no location at all.
 */
export default function CheckInFlow({ mode }: { mode: ProcessingMode }) {
  const [flow, setFlow] = useState<CheckInFlowState>(EMPTY_CHECK_IN_STATE);
  /**
   * Which step the flow is on. `disclosure` is the **only** way into `interview` (Phase 2D): the
   * user's words are not sent anywhere until they have been told which provider processes them and
   * which of their words are sent, and have said yes in so many words. There is no path that skips it,
   * and no state that remembers a previous yes.
   */
  const [step, setStep] = useState<"check-in" | "disclosure" | "interview">("check-in");
  /** Whether the user has just chosen not to send their words, so the check-in screen can say so. */
  const [declined, setDeclined] = useState(false);
  /**
   * The location the person chose or typed (Phase 2H), or "" when there is none. One source of truth:
   * the map fills this field, the person can edit it to anything, and the field is what travels.
   */
  const [regionLabel, setRegionLabel] = useState("");
  /**
   * Whether the body map is open on a screen too short to hold it. On taller screens the map is always
   * shown and this state is unused (Phase 2H fix).
   */
  /**
   * The person chose not to name a location. That is an answer, not a missing one, so the readout says
   * so and the card names no location - the same empty field, but reached on purpose.
   */
  const [preferNotToSay, setPreferNotToSay] = useState(false);
  /**
   * Whether the body map is open. The map is the tallest thing on this screen, and on a screen too
   * short to hold it the fixed line and the fields would be pushed out of reach; so below a short-height
   * breakpoint the map starts closed and is one tap away. Above it, the map is always shown and this
   * state is never consulted (Phase 2H fix).
   */
  const [mapOpen, setMapOpen] = useState(false);
  /**
   * The session the card was worded from (`ISS-14`), or null when there is no finished card.
   *
   * It is held here, above the interview, for one reason: the interview unmounts when the user returns
   * to the map to change the region, and without the session that return trip would throw the answers
   * away. Holding it means "change the region" rebuilds the card from the same answers against the new
   * region, and "start a new check-in" clears it so the next check-in begins empty.
   */
  const [session, setSession] = useState<InterviewSession | null>(null);
  /**
   * The map view the person is looking at, held here so the session row a saved card writes can record
   * it (`sessions.view`, which the schema requires). It is bookkeeping, never part of the card, and it
   * starts on the map's own default.
   */
  const [view, setView] = useState<BodyView>("front");
  const onRegionChange = useCallback((label: string | null) => {
    setPreferNotToSay(false);
    setRegionLabel(label ?? "");
  }, []);
  const onSession = useCallback((next: InterviewSession | null) => setSession(next), []);

  /**
   * Start a new check-in, once the card's confirmation has been given. Everything this flow holds goes:
   * the session, the region, the words in the box and the step. Nothing was saved at any point, so
   * there is nothing else to clear, and the map - remounted with no region - opens unselected.
   */
  const startNewCheckIn = useCallback(() => {
    setSession(null);
    setRegionLabel("");
    setPreferNotToSay(false);
    setFlow(EMPTY_CHECK_IN_STATE);
    setDeclined(false);
    setStep("check-in");
  }, []);

  if (flow.screen === "crisis") {
    return (
      <CrisisScreen
        onBack={() => {
          setFlow(backToEmptyCheckIn());
          setSession(null);
          setStep("check-in");
        }}
      />
    );
  }

  /**
   * The disclosure (Phase 2D), shown between the check-in and the interview and never skipped.
   *
   * Nothing has been sent at this point: the box's words and the region are still in this component.
   * Acknowledging mounts the interview, which is where the first request is made; declining returns to
   * the check-in with the words intact, sends nothing, and starts no interview. Both are plain
   * component state, so the answer lasts exactly as long as this screen is on the page - it is not
   * written to storage, a cookie or a database, and it is asked again next time.
   */
  if (step === "disclosure") {
    return (
      <ExternalProcessingNotice
        mode={mode}
        onAcknowledge={() => {
          setDeclined(false);
          setStep("interview");
        }}
        onDecline={() => {
          setDeclined(true);
          setStep("check-in");
        }}
      />
    );
  }

  if (step === "interview") {
    return (
      <InterviewChat
        mode={mode}
        regionLabel={preferNotToSay ? "" : regionLabel}
        description={flow.boxText}
        view={view}
        resume={session}
        onSession={onSession}
        onStartNew={startNewCheckIn}
        onBack={() => {
          // Back to the map keeps the words the user wrote in the box. Changing the region must not
          // silently discard their own first account of the sensation (`ISS-16/F`), and the crisis
          // match is cleared because this is not the crisis path.
          setFlow({ screen: "check-in", boxText: flow.boxText, crisisMatch: null });
          setStep("check-in");
        }}
      />
    );
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <StepLabel>{CHECKIN_STEP_LABEL}</StepLabel>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{CHECKIN_PROMPT}</h1>
        <p className="text-body text-ink-muted [@media(max-height:600px)]:hidden">{CHECKIN_INSTRUCTION}</p>
      </header>

      {/* Phone: one column, the figure first. Desktop: the figure beside the words, so the map is no
          longer the tallest thing on the screen and the action stays above the fold. */}
      <div className="flex flex-col gap-[var(--spacing-stack)] md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start md:gap-8">
        {/* The map is the tallest thing here, so on a short screen it starts behind its control. */}
        <div id="checkin-map" className={mapOpen ? "" : "[@media(max-height:600px)]:hidden"}>
          <BodyMap
            onRegionChange={onRegionChange}
            onViewChange={setView}
            initialLabel={regionLabel}
            readoutLabel={preferNotToSay ? LOCATION_PREFER_NOT_TO_SAY : regionLabel}
          />
        </div>

        <div className="flex flex-col gap-4 [@media(max-height:600px)]:gap-1">
          <div className="hidden [@media(max-height:600px)]:block">
            <Button
              id="checkin-map-toggle"
              variant="secondary"
              aria-expanded={mapOpen}
              aria-controls="checkin-map"
              onClick={() => setMapOpen(!mapOpen)}
            >
              {mapOpen ? LOCATION_MAP_HIDE : LOCATION_MAP_CHOOSE}
            </Button>
          </div>

          {/* The note describes the map, so it goes with it: shown whenever the map is. */}
          <div className={mapOpen ? "" : "[@media(max-height:600px)]:hidden"}>
            <p className="text-body leading-6 text-ink-muted">{REGION_MAP_NOTE}</p>
          </div>

          {/* The map is a suggestion; this field is the answer (Phase 2H). */}
          <TextField
            id="checkin-location"
            label={LOCATION_FIELD_LABEL}
            value={regionLabel}
            onChange={(value) => {
              setPreferNotToSay(false);
              setRegionLabel(value);
            }}
            placeholder={LOCATION_FIELD_PLACEHOLDER}
            disabled={preferNotToSay}
          />

          <Button
            id="checkin-location-prefer-not-to-say"
            variant="secondary"
            aria-pressed={preferNotToSay}
            onClick={() => {
              const next = !preferNotToSay;

              setPreferNotToSay(next);

              if (next) setRegionLabel("");
            }}
            className="self-start"
          >
            {LOCATION_PREFER_NOT_TO_SAY}
          </Button>

          {preferNotToSay ? (
            <p className="text-body leading-6 text-ink-muted">{LOCATION_PREFER_NOT_TO_SAY_NOTE}</p>
          ) : null}

          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();

              /**
               * Two pieces of the person's own text are on this screen, and both are screened before the
               * interview is reached (iron rule 4): the box, as it always was, and the location field,
               * which became free text in Phase 2H. A match in either one stops the loop at the static
               * crisis screen, and neither the disclosure nor the interview is mounted.
               */
              const box = checkInFlowAfterSubmit(flow.boxText);

              if (box.screen === "crisis") {
                setFlow(box);
                return;
              }

              const location = gateForInput(regionLabel);

              if (location.stop) {
                setFlow({ screen: "crisis", boxText: "", crisisMatch: location.matched });
                return;
              }

              setFlow(box);
              setDeclined(false);
              setStep("disclosure");
            }}
          >
            <TextField
              id="checkin-box"
              label={CHECKIN_BOX_LABEL}
              value={flow.boxText}
              onChange={(value) => {
                setDeclined(false);
                setFlow({ screen: "check-in", boxText: value, crisisMatch: null });
              }}
              multiline
              rows={3}
              placeholder={CHECKIN_BOX_PLACEHOLDER}
            />

            <Button id="checkin-submit" type="submit" className="self-start">
              {CHECKIN_BOX_SUBMIT}
            </Button>
          </form>

          {/* The one thing this screen says after a "not now": nothing was sent. */}
          {declined ? <p className="text-body leading-6 text-ink">{EXTERNAL_PROCESSING_DECLINED}</p> : null}

          <p className="text-body leading-6 text-ink-muted">{CHECKIN_BOX_KEPT}</p>
        </div>
      </div>
    </>
  );
}
