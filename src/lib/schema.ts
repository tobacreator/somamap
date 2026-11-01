import { z } from "zod";

/**
 * The schema-locked SomaMap sensation card (iron rule 1).
 *
 * A card carries exactly five fields: location_label, quality_words (max 5),
 * intensity_metaphor, duration, user_own_sentence. Rule 1 lists what may never
 * be added to a card, and .strict() is what makes that list enforceable: any
 * object that arrives carrying an extra key is rejected outright.
 *
 * This schema is the single source of truth for what a card is: the API route,
 * the card renderer, and the red-team pack all read the shape from here.
 */
export const sensationCardSchema = z
  .object({
    location_label: z.string(),
    quality_words: z.array(z.string()).max(5),
    intensity_metaphor: z.string(),
    duration: z.string(),
    user_own_sentence: z.string(),
  })
  .strict();

/** A card as the rest of the app sees it: the five fields, nothing else. */
export type SensationCard = z.infer<typeof sensationCardSchema>;

/**
 * The reviewed static card, rendered whenever model output fails validation
 * (blueprint Section 4.2 and the reviewed fallback copy in Chapter 6).
 *
 * Warm, plain wording; it reflects nothing back to the user that the user did
 * not say, and it adds nothing beyond the user's own description. The user
 * loses nothing but flourish.
 *
 * quality_words and intensity_metaphor carry the reviewed fallback copy from the
 * blueprint verbatim. location_label, duration, and user_own_sentence carry the
 * blueprint's fallback placeholders verbatim; the renderer substitutes the
 * region the user tapped and the user's own words, so this constant never
 * invents a description on the user's behalf.
 */
export const FALLBACK_CARD: SensationCard = {
  location_label: "(the region the user tapped)",
  quality_words: ["noticeable", "present"],
  intensity_metaphor: "like a quiet background hum",
  duration: "(whatever the user said)",
  user_own_sentence: "(the user's own words, quoted exactly)",
};
