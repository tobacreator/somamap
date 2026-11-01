"use client";

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { FOCUS_RING } from "@/components/Button";
import {
  BODY_MAP_ARIA_LABEL,
  REGION_NONE_HINT,
  REGION_READOUT_PREFIX,
  VIEW_BACK,
  VIEW_FRONT,
  VIEW_LEGEND,
  regionButtonLabel,
} from "@/lib/copy";
import {
  mapSpaceForView,
  regionAtPoint,
  zoneCentre,
  zonesForView,
  type BodyMapPoint,
  type BodyRect,
  type BodyView,
  type BodyZone,
} from "@/lib/regions";

/**
 * The body map - blueprint Section 4.4, the check-in start screen.
 *
 * The map is drawn from the fixed zone map in src/lib/regions.ts: the same rectangles
 * that decide a label are the ones rendered here, so what the user sees and what the
 * lookup returns cannot drift apart. Nothing is generated and no model is involved in
 * naming a region.
 *
 * The selection is local UI state, and it leaves the map through `onRegionChange` so the check-in
 * flow can hold it: the interview sends it with every turn and the route keeps it on the card
 * (Entry 42 - before this, the tapped region never left this component, so the card could not show
 * it). The label handed out is the fixed map's own, exactly as the readout shows it.
 */

/**
 * The drawing box is derived from the view's own map space by a single constant, so a map unit is
 * the same distance in both axes and the drawing cannot stretch the map (Phase 2.1). A view's
 * viewBox is `space.width * VIEW_BOX_SCALE` by `space.height * VIEW_BOX_SCALE`, which is why the
 * front view draws into 100x160 and the narrower side view into 48x160.
 */
const VIEW_BOX_SCALE = 0.1;

/** One map unit, in viewBox units - identical in x and y, by construction. */
const toSvg = (mapUnits: number) => mapUnits * VIEW_BOX_SCALE;

/** The view toggle, in blueprint order. */
const VIEWS: readonly { value: BodyView; label: string }[] = [
  { value: "front", label: VIEW_FRONT },
  { value: "back", label: VIEW_BACK },
];

/**
 * The figure, in map units: **exactly the rectangles of the view's own zones** (`ISS-06`).
 *
 * This is the whole of the alignment fix, and it is a correction rather than a workaround. Before it,
 * the drawing was one shared eleven-rectangle mannequin that included parts the view has no region
 * for - arms and hands in the front view, a head and neck in the back view - and was rounded where
 * the zones were square. That produced both classes of defect the alignment gates report:
 *
 *   - **coverage** - a drawn part the user can see and cannot tap (26% of the front figure, 25% of
 *     the back one);
 *   - **overhang** - an outline that left the body, at every rounded corner and along the whole of
 *     the shoulder, hip and feet edges.
 *
 * Deriving the figure from the zones makes both impossible by construction: the drawn shape and the
 * tappable shape are the same rectangles. It also restores what Table 9 actually says - the arms and
 * hands are **back-view** regions, and the head and neck are **front-view** ones - so a view now draws
 * precisely the body it can name, and the two views together cover all fourteen regions.
 *
 * Nothing is hidden: the gates measure this drawing, and `L2.overhang`/`L2.coverage` are the proof.
 */
function figureRectsFor(view: BodyView): readonly BodyRect[] {
  return zonesForView(view).flatMap((zone) => zone.rects);
}

/**
 * The two zone states, from the design tokens (Phase A of the approved direction, audit Entry 37).
 *
 * Contrast, measured against the values in src/app/globals.css and asserted by
 * src/lib/designTokens.test.ts:
 *   - unselected outline (--color-hairline) on the figure: 4.25:1 light, 3.85:1 dark - the
 *     interactive zones now clear the 3:1 non-text requirement in both modes;
 *   - selected fill (--color-accent) against the page: 5.54:1 light, 7.21:1 dark;
 *   - the pin: its ring (--color-paper) against the clay fill 5.54:1 / 7.21:1, and its core
 *     (--color-ink) against that ring 16.26:1 / 16.60:1.
 *
 * The selection does not rely on colour alone. Three non-colour cues carry it: the outline weight
 * (0.6 units unselected, 1.6 selected), the pin drawn at the tapped point, and the readout line
 * naming the region - plus `aria-pressed` and the word "selected" in the zone's own label for
 * assistive technology.
 */
const ZONE_CLASS =
  "fill-surface stroke-hairline group-hover:fill-tint group-focus-visible:stroke-ink group-focus-visible:stroke-2";
const ZONE_SELECTED_CLASS = "fill-accent stroke-paper group-focus-visible:stroke-2";

type Selection = { zone: BodyZone; point: BodyMapPoint };

export default function BodyMap({ onRegionChange }: { onRegionChange?: (label: string | null) => void }) {
  const [view, setView] = useState<BodyView>("front");
  const [selection, setSelection] = useState<Selection | null>(null);

  /**
   * The one way the selection leaves this component: the label of the chosen region, or null when
   * nothing is chosen (a view change clears it, because the two views name different regions).
   */
  useEffect(() => {
    onRegionChange?.(selection === null ? null : selection.zone.label);
  }, [selection, onRegionChange]);

  function chooseView(next: BodyView) {
    if (next === view) return;
    // The views name different regions, so a choice does not carry across.
    setView(next);
    setSelection(null);
  }

  /**
   * The view's own coordinate space (Phase 2.1). Everything below - the viewBox, the conversion from
   * a pointer position to map units, and the marker - is expressed through this one object, so a
   * view can never be drawn in another view's space.
   */
  const space = mapSpaceForView(view);

  /** Pointer selection: the label is a lookup on the fixed map at the tapped point. */
  function selectAtPointer(event: MouseEvent<SVGGElement>, zone: BodyZone) {
    const svg = event.currentTarget.ownerSVGElement;
    const box = svg?.getBoundingClientRect();

    if (!box || box.width === 0 || box.height === 0) {
      setSelection({ zone, point: zoneCentre(zone) });
      return;
    }

    const point = {
      x: ((event.clientX - box.left) / box.width) * space.width,
      y: ((event.clientY - box.top) / box.height) * space.height,
    };
    const hit = regionAtPoint(view, point);

    setSelection(hit ? { zone: hit, point } : { zone, point: zoneCentre(zone) });
  }

  /** Keyboard selection: same lookup, at the zone's own centre. */
  function selectByKey(event: KeyboardEvent<SVGGElement>, zone: BodyZone) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelection({ zone, point: zoneCentre(zone) });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label font-medium text-ink-muted">{VIEW_LEGEND}</h2>
        <div
          role="group"
          aria-label={VIEW_LEGEND}
          className="flex rounded-pill border border-hairline p-0.5"
        >
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => chooseView(option.value)}
              aria-pressed={view === option.value}
              className={`min-h-11 rounded-pill px-4 text-label font-medium text-ink-muted aria-pressed:bg-accent aria-pressed:text-accent-ink ${FOCUS_RING}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="min-h-6 text-body font-medium text-accent-text">
        {selection ? `${REGION_READOUT_PREFIX}: ${selection.zone.label}` : REGION_NONE_HINT}
      </p>

      <svg
        viewBox={`0 0 ${space.width * VIEW_BOX_SCALE} ${space.height * VIEW_BOX_SCALE}`}
        data-map-width={space.width}
        data-map-height={space.height}
        role="group"
        aria-label={BODY_MAP_ARIA_LABEL}
        className="mx-auto h-auto w-full max-w-[240px] touch-manipulation select-none md:max-w-[320px]"
      >
        <g aria-hidden="true" className="fill-surface">
          {figureRectsFor(view).map((rect, index) => (
            <rect
              key={index}
              x={toSvg(rect.x)}
              y={toSvg(rect.y)}
              width={toSvg(rect.width)}
              height={toSvg(rect.height)}
            />
          ))}
        </g>

        {zonesForView(view).map((zone) => {
          const isSelected = selection?.zone.id === zone.id;

          return (
            <g
              key={zone.id}
              role="button"
              tabIndex={0}
              aria-label={regionButtonLabel(zone.label, isSelected)}
              aria-pressed={isSelected}
              onClick={(event) => selectAtPointer(event, zone)}
              onKeyDown={(event) => selectByKey(event, zone)}
              className="group cursor-pointer outline-none"
            >
              {zone.rects.map((rect, index) => {
                // The outline weight is a selection cue in its own right: 0.6 units unselected,
                // 1.6 when this zone is the chosen region.
                return (
                  <rect
                    key={index}
                    x={toSvg(rect.x)}
                    y={toSvg(rect.y)}
                    width={toSvg(rect.width)}
                    height={toSvg(rect.height)}
                    strokeWidth={isSelected ? 1.6 : 0.6}
                    className={isSelected ? ZONE_SELECTED_CLASS : ZONE_CLASS}
                  />
                );
              })}
            </g>
          );
        })}

        {/* The pin: a core in --color-ink inside a ring in --color-paper, so it reads on any fill
            and in either mode - the ring separates it from the clay, the core from the ring. */}
        {selection ? (
          <circle
            cx={toSvg(selection.point.x)}
            cy={toSvg(selection.point.y)}
            r={2.4}
            strokeWidth={1}
            className="fill-ink stroke-paper"
          />
        ) : null}
      </svg>
    </section>
  );
}

