"use client";

import { useCallback, useState } from "react";

import BodyMap from "@/components/BodyMap";
import Button from "@/components/Button";
import CrisisScreen from "@/components/CrisisScreen";
import InterviewChat from "@/components/InterviewChat";
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
  REGION_MAP_NOTE,
} from "@/lib/copy";
import {
  EMPTY_CHECK_IN_STATE,
  backToEmptyCheckIn,
  checkInFlowAfterSubmit,
  type CheckInFlowState,
} from "@/lib/crisis";

/**
 * The check-in flow - the map, the free-text box, iron rule 4's stop, and the hand-off to the
 * interview.
 *
 * Two steps live here. The first is the map and the box: the body map names the region from
 * fixed geometry, and the box is the free-text surface iron rule 4's lexicon guards. Clean
 * words move the flow to the second step, the interview (`InterviewChat`), which asks the
 * approved questions through `POST /api/interview` and renders the card that route validates;
 * a crisis hit stops the flow instead, and the interview is never mounted.
 *
 * The crisis stop replaces the whole flow rather than sitting inside it: when the lexicon
 * matches, the map, the box and the next step are gone and only the static screen remains. The
 * decision itself is not made here - it comes from `src/lib/crisis.ts`, so the same pure
 * functions are what the tests exercise. The check-in step calls no model; the interview step
 * reaches one only through the route, which words the card through the model boundary (mock
 * mode by default) and validates it against the strict five-field schema.
 *
 * Nothing is saved in either step: no database write, no storage call, no session row. The
 * fixed line from iron rule 5 renders on every screen of both steps.
 *
 * The region the user selects on the map is held here, because it has to survive the step change:
 * the map unmounts when the interview starts, and the interview sends the label with every turn so
 * the card can carry it (Entry 42). It is a label from the fixed map, never a model's.
 */
export default function CheckInFlow() {
  const [flow, setFlow] = useState<CheckInFlowState>(EMPTY_CHECK_IN_STATE);
  const [step, setStep] = useState<"check-in" | "interview">("check-in");
  /** The selected region's label, or "" when the user selected none. */
  const [regionLabel, setRegionLabel] = useState("");
  const onRegionChange = useCallback((label: string | null) => setRegionLabel(label ?? ""), []);

  if (flow.screen === "crisis") {
    return (
      <CrisisScreen
        onBack={() => {
          setFlow(backToEmptyCheckIn());
          setStep("check-in");
        }}
      />
    );
  }

  if (step === "interview") {
    return (
      <InterviewChat
        regionLabel={regionLabel}
        onBack={() => {
          setFlow(EMPTY_CHECK_IN_STATE);
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
        <p className="text-body text-ink-muted">{CHECKIN_INSTRUCTION}</p>
      </header>

      {/* Phone: one column, the figure first. Desktop: the figure beside the words, so the map is no
          longer the tallest thing on the screen and the action stays above the fold. */}
      <div className="flex flex-col gap-[var(--spacing-stack)] md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start md:gap-8">
        <BodyMap onRegionChange={onRegionChange} />

        <div className="flex flex-col gap-4">
          <p className="text-body leading-6 text-ink-muted">{REGION_MAP_NOTE}</p>

          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();

              const next = checkInFlowAfterSubmit(flow.boxText);

              setFlow(next);

              // Clean words reach the interview; a crisis hit stays on the static screen instead,
              // and the interview is never mounted (iron rule 4).
              if (next.screen === "check-in") setStep("interview");
            }}
          >
            <TextField
              id="checkin-box"
              label={CHECKIN_BOX_LABEL}
              value={flow.boxText}
              onChange={(value) => setFlow({ screen: "check-in", boxText: value, crisisMatch: null })}
              multiline
              rows={3}
              placeholder={CHECKIN_BOX_PLACEHOLDER}
            />

            <Button id="checkin-submit" type="submit" className="self-start">
              {CHECKIN_BOX_SUBMIT}
            </Button>
          </form>

          <p className="text-body leading-6 text-ink-muted">{CHECKIN_BOX_KEPT}</p>
        </div>
      </div>
    </>
  );
}
