import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The recorded mock responses - blueprint Chapter 4.3, held in `modal/fixtures/`.
 *
 * They are read from disk rather than imported, so one copy serves both the Next server
 * runtime and the plain Node test run, and so a fixture can be re-recorded without a code
 * change. Reading happens once per process.
 *
 * The two hostile keys on the invalid draft are named in the type on purpose: they are the
 * payload the checks force the model to produce, and naming them is how a test asserts
 * they were refused. They are fixture metadata - nothing here reaches the card schema.
 */

/** One recorded prescreen answer: the input, and what the classifier said about it. */
export type RecordedPrescreenRow = { input: string; crisis: boolean };

export type PrescreenFixture = {
  note: string;
  recorded: RecordedPrescreenRow[];
  default_crisis: boolean;
};

/** A recorded draft. The invalid one carries the two extra keys the checks force. */
export type DraftCardFixture = {
  location_label: string;
  quality_words: string[];
  intensity_metaphor: string;
  duration: string;
  user_own_sentence: string;
};

/** The recorded deliberately-invalid draft: the same five fields plus the two forced keys. */
export type InvalidDraftCardFixture = DraftCardFixture & {
  possible_cause: string;
  recommendation: string;
};

export type InterviewFixture = {
  note: string;
  question_ids: string[];
  draft_card: DraftCardFixture;
  invalid_draft_card: InvalidDraftCardFixture;
};

const FIXTURE_DIR = join(process.cwd(), "modal", "fixtures");

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as T;
}

export const prescreenFixture: PrescreenFixture = readFixture<PrescreenFixture>("prescreen.json");
export const interviewFixture: InterviewFixture = readFixture<InterviewFixture>("interview.json");
