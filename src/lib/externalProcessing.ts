/**
 * External model processing - the disclosure and the acknowledgement (Phase 2D).
 *
 * The product decision this file implements: SomaMap's interview is worded by an external model
 * provider, so the user's own words leave SomaMap for a third party. That has to be said before it
 * happens, and agreed to explicitly, and neither the saying nor the agreeing may be a default, a
 * checkbox nobody read, or a hidden piece of UI state.
 *
 * Why the rule lives here rather than in a component:
 *
 *   - `EXTERNAL_PROVIDER_ID` and `EXTERNAL_PROVIDER_NAME` are the provider this build discloses;
 *     `LOCAL_PROCESSING_ID` is what the user acknowledges when there is no external provider at all.
 *     The acknowledgement is a function of the mode (`acknowledgementFor`), so **the value the server
 *     requires is the value its own disclosure asked for** - changing the provider, or switching a
 *     build from mock to live, invalidates every acknowledgement that was given for something else.
 *   - `isAcknowledgement` is the one strict test, and it is strict on purpose: absent, null, a
 *     boolean, a number, an object, an empty string, another provider's id, a differently-cased
 *     spelling, and the acknowledgement of the other mode all fail it. A request that does not carry
 *     the acknowledgement this mode asked for is refused.
 *   - `withAcknowledgement` is the one place the field is put on a request, and every interview
 *     request goes through `postInterview`, which calls it - so no turn this app sends can be sent
 *     without it.
 *
 * What this file deliberately does **not** do: it makes no claim about what a provider does with the
 * words. No statement about retention, deletion, training, storage, encryption or location appears
 * anywhere in this build, because none of them has been independently verified. The copy says only
 * what the code does - and, in mock mode, that no external provider is involved at all.
 *
 * Scope, exactly: the acknowledgement is **session-scoped and never persisted**. It is a click in the
 * check-in flow that leads to the interview, and it is gone when that session ends. Nothing here
 * writes to storage, a cookie, a database or a log.
 */

/** The external model provider this build discloses, as the id that travels on the wire. */
export const EXTERNAL_PROVIDER_ID = "baseten";

/** The provider's name, as the disclosure says it to the user. */
export const EXTERNAL_PROVIDER_NAME = "Baseten";

/**
 * What the user is told and agrees to when there is **no** external provider: nothing leaves SomaMap.
 * It is a value of the same field, because the field records which processing the user was actually
 * shown - not which processing some other build would have used.
 */
export const LOCAL_PROCESSING_ID = "local";

/**
 * The processing mode, as it reaches this module. It mirrors `ModelMode` in `src/lib/models.ts` and is
 * declared again here on purpose: this module is imported by client components, and `models.ts` loads
 * the recorded fixtures from disk, which must never enter a browser bundle. The two are structurally
 * identical, and the value always comes from the server (`modelMode()`), never from a guess.
 */
export type ProcessingMode = "mock" | "live";

/** The acknowledgement this mode's disclosure asks for: the provider's id, or that nothing is sent. */
export type ProcessingAcknowledgement = typeof EXTERNAL_PROVIDER_ID | typeof LOCAL_PROCESSING_ID;

/**
 * The one value a turn may carry in this mode.
 *
 * The mode is the server's own (`MODEL_MODE`), so a build that is switched to live processing refuses
 * every turn that acknowledged only local processing - the user has to be shown the external
 * disclosure again before their words can be used externally. That is fail-closed in the direction that
 * matters, and it is why this is a function of the mode rather than one fixed constant.
 */
export function acknowledgementFor(mode: ProcessingMode): ProcessingAcknowledgement {
  return mode === "live" ? EXTERNAL_PROVIDER_ID : LOCAL_PROCESSING_ID;
}

/**
 * True only for the exact acknowledgement this mode's disclosure asks for.
 *
 * Everything else is false, including the plausible near-misses: `true`, `"true"`, `1`, `[]`, `{}`,
 * `null`, `undefined`, `""`, `"Baseten"`, any other provider's name, and - deliberately - the
 * acknowledgement of the *other* mode, so a client cannot carry a "nothing is sent" acknowledgement
 * into a build that sends, or the reverse. This is the server's whole enforcement of "the user was
 * told about this processing before their words were used", so it is an equality test against one
 * derived value rather than a truthiness check.
 */
export function isAcknowledgement(value: unknown, mode: ProcessingMode): value is ProcessingAcknowledgement {
  return value === acknowledgementFor(mode);
}

/** A request that carries the acknowledgement, alongside whatever the interview itself sends. */
export type AcknowledgedRequest<T extends object> = T & {
  acknowledgedProvider: ProcessingAcknowledgement;
};

/**
 * The turn as it goes on the wire: the interview's own fields, plus the acknowledgement for this mode.
 *
 * The acknowledgement is a transport precondition, not interview content: it is attached where the
 * request is actually sent, so a builder cannot forget it and a new request shape cannot omit it. It
 * is **not** a card field and never becomes one - the sensation card is still the five fields in
 * `src/lib/schema.ts`, and `sensationCardSchema` stays `.strict()`.
 */
export function withAcknowledgement<T extends object>(
  request: T,
  mode: ProcessingMode,
): AcknowledgedRequest<T> {
  return { ...request, acknowledgedProvider: acknowledgementFor(mode) };
}
