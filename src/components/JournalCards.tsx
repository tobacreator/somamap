import Link from "next/link";

import CardView from "@/components/CardView";
import Panel from "@/components/Panel";
import StepLabel from "@/components/StepLabel";
import {
  JOURNAL_COUNT,
  JOURNAL_OPEN,
  JOURNAL_REGIONS_EMPTY,
  JOURNAL_REGIONS_TITLE,
  JOURNAL_WORDS_EMPTY,
  JOURNAL_WORDS_NOTE,
  JOURNAL_WORDS_TITLE,
} from "@/lib/copy";
import { cardPayloadFromRecord, journalEntryFromRecord, type JournalCardRecord } from "@/lib/journal";
import { chosenWordCounts, regionCounts } from "@/lib/patterns";

/**
 * The saved cards, and counts of the words on them - iron rule 3's whole surface.
 *
 * Every number here is a count of something the user typed, and every sentence is one the user wrote.
 * Nothing in this component says what any of it means: the words are listed with their counts and no
 * adjective, the places the same, and each card is rendered by `CardView`, which revalidates the stored
 * fields against the strict five-field schema and shows the reviewed fallback if they do not pass. There
 * is no trend, no "most common" summary sentence, no comparison between cards and no commentary on any
 * one of them - a count is an observation about a person's vocabulary, not a reading of it.
 *
 * The counts come from the existing engine (`src/lib/patterns.ts`) unchanged: `chosenWordCounts` counts
 * only the words the user chose, and `regionCounts` only the places they named.
 */
export default function JournalCards({ records }: { records: readonly JournalCardRecord[] }) {
  const entries = records.map(journalEntryFromRecord);
  const words = chosenWordCounts(entries);
  const places = regionCounts(entries);

  return (
    <>
      <p className="text-body text-ink-muted">{JOURNAL_COUNT(records.length)}</p>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <Panel className="flex-1">
          <h2 className="text-lead font-medium text-ink">{JOURNAL_WORDS_TITLE}</h2>

          {words.length === 0 ? (
            <p className="text-label text-ink-muted">{JOURNAL_WORDS_EMPTY}</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {words.map((word) => (
                <li key={word.word} className="flex items-baseline gap-1 text-body text-ink">
                  <span>{word.word}</span>
                  <span className="text-meta text-ink-muted">{word.count}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-meta leading-5 text-ink-muted">{JOURNAL_WORDS_NOTE}</p>
        </Panel>

        <Panel className="flex-1">
          <h2 className="text-lead font-medium text-ink">{JOURNAL_REGIONS_TITLE}</h2>

          {places.length === 0 ? (
            <p className="text-label text-ink-muted">{JOURNAL_REGIONS_EMPTY}</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {places.map((place) => (
                <li key={place.region} className="flex items-baseline gap-1 text-body text-ink">
                  <span>{place.region}</span>
                  <span className="text-meta text-ink-muted">{place.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ul className="flex flex-col gap-8">
        {records.map((record) => (
          <li key={record.id} className="flex flex-col gap-3 border-t border-rule pt-6">
            <StepLabel>{record.created_at.slice(0, 10)}</StepLabel>

            <CardView payload={cardPayloadFromRecord(record)} />

            <Link
              href={`/journal/${record.id}`}
              className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
            >
              {JOURNAL_OPEN}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
