/**
 * The fixed geometric region map - blueprint Section 4.4 and Table 9.
 *
 * This file is the whole map: the fourteen Table 9 zones, spread over three views - seven on the
 * front, seven on the back, and ten on the side, whose zones reuse those same fourteen labels and
 * introduce none. A label is a lookup, never an inference: a tap point lands inside one zone or
 * inside none, and nothing here names, describes or interprets what the user felt.
 *
 * Build rules this file satisfies:
 *   - the region label comes from this fixed map and never from a model output;
 *   - the module is pure geometry: no imports, no network, no state and no clock, so the same point
 *     always returns the same label (blueprint check G3.4).
 *
 * ## The map space, and why it is declared per view (Phase 2.1)
 *
 * Each view owns a coordinate space, and the drawing box is derived from it by one constant, so a
 * map unit is the same distance in both axes and the drawing cannot stretch the map. Before this
 * phase the zones were authored in a square 1000x1000 space and drawn into a 100x160 box, so a map
 * unit was 0.24px across and 0.384px down: every radius, arc and distance in this space rendered
 * wrong. The transform that fixed it was `y = previous y * 1.6` with x unchanged - the same shape,
 * in a space that is honest about its own proportions.
 *
 * Every coordinate below is an integer, so containment is exact and adjacent zones cannot overlap:
 * a rectangle owns [x, x + width) and [y, y + height). Points are rounded to integers before
 * containment is tested, so the answer is stable.
 *
 * Label spelling follows Table 9 verbatim (for example the singular "shoulder").
 */

export type BodyView = "front" | "back" | "side";

/** The front and back views' space: 1000 units across, 1600 down. */
export const BODY_MAP_UNITS_X = 1000;
export const BODY_MAP_UNITS_Y = 1600;

/** The side view's own space: a profile is much shallower, and keeps the same height. */
export const SIDE_MAP_UNITS_X = 480;
export const SIDE_MAP_UNITS_Y = 1600;

/** One view's coordinate space, in map units. */
export type MapSpace = { width: number; height: number };

/** The space a view's coordinates are authored in. */
export function mapSpaceForView(view: BodyView): MapSpace {
  return view === "side"
    ? { width: SIDE_MAP_UNITS_X, height: SIDE_MAP_UNITS_Y }
    : { width: BODY_MAP_UNITS_X, height: BODY_MAP_UNITS_Y };
}

/** A rectangle in map units; `x`/`y` are the top-left corner. */
export type BodyRect = { x: number; y: number; width: number; height: number };

/** One fixed region: a label from Table 9 and the rectangles that make it up. */
export type BodyZone = {
  /** Stable identifier for React keys and tests; never shown to the user. */
  id: string;
  /** The displayed region label, from Table 9. */
  label: string;
  view: BodyView;
  rects: readonly BodyRect[];
};

/** A point in map units. */
export type BodyMapPoint = { x: number; y: number };

function rect(x: number, y: number, width: number, height: number): BodyRect {
  return { x, y, width, height };
}

/** Table 9, front view, in blueprint order. */
export const FRONT_VIEW_LABELS = ["head", "neck", "shoulder", "chest", "abdomen", "thighs", "shins"] as const;

/** Table 9, back view, in blueprint order. */
export const BACK_VIEW_LABELS = [
  "upper back",
  "lower back",
  "hips",
  "arms",
  "hands",
  "knees",
  "feet",
] as const;

/**
 * The side view's own labels, in order. Every one is a label from Table 9 - the side view introduces
 * no new vocabulary. It names the front and back halves of the torso separately, which is what a
 * profile shows, and leaves out the labels a profile cannot tell apart (hips, arms, hands, knees),
 * which stay reachable from the front and back views.
 */
export const SIDE_VIEW_LABELS = [
  "head",
  "neck",
  "shoulder",
  "upper back",
  "chest",
  "lower back",
  "abdomen",
  "thighs",
  "shins",
  "feet",
] as const;

/** Table 9's fourteen labels, front view first. */
export const REGION_LABELS: readonly string[] = [...FRONT_VIEW_LABELS, ...BACK_VIEW_LABELS];

/**
 * The front view. The three upper bands are re-sized as approved (A3) - head 125, neck 62, shoulder
 * 71, so the three still abut at 280 (22 + 125 + 62 + 71) - and every y is then expressed in this
 * map's own axis: the same lengths read 200, 99 and 114, because the y axis is 1600 units where the
 * previous one was 1000.
 */
const FRONT_ZONES: readonly BodyZone[] = [
  { id: "head", label: "head", view: "front", rects: [rect(418, 35, 164, 200)] },
  { id: "neck", label: "neck", view: "front", rects: [rect(462, 235, 76, 99)] },
  { id: "shoulder", label: "shoulder", view: "front", rects: [rect(236, 334, 528, 114)] },
  { id: "chest", label: "chest", view: "front", rects: [rect(268, 448, 464, 243)] },
  { id: "abdomen", label: "abdomen", view: "front", rects: [rect(284, 691, 432, 234)] },
  {
    id: "thighs",
    label: "thighs",
    view: "front",
    rects: [rect(300, 925, 186, 301), rect(514, 925, 186, 301)],
  },
  {
    id: "shins",
    label: "shins",
    view: "front",
    rects: [rect(316, 1226, 154, 307), rect(530, 1226, 154, 307)],
  },
];

const BACK_ZONES: readonly BodyZone[] = [
  { id: "upper-back", label: "upper back", view: "back", rects: [rect(268, 333, 464, 275)] },
  { id: "lower-back", label: "lower back", view: "back", rects: [rect(284, 608, 432, 211)] },
  { id: "hips", label: "hips", view: "back", rects: [rect(268, 819, 464, 176)] },
  {
    id: "arms",
    label: "arms",
    view: "back",
    rects: [rect(150, 339, 116, 653), rect(734, 339, 116, 653)],
  },
  {
    id: "hands",
    label: "hands",
    view: "back",
    rects: [rect(146, 992, 120, 128), rect(734, 992, 120, 128)],
  },
  {
    id: "knees",
    label: "knees",
    view: "back",
    rects: [rect(316, 1226, 154, 115), rect(530, 1226, 154, 115)],
  },
  {
    /**
     * The feet zone, grown as approved (A2): 56 units in the previous axis, 70 now, so its lower
     * edge reaches the bottom of the drawing box. In this map's units that is 112, and the lower
     * edge is the map's own 1600.
     */
    id: "feet",
    label: "feet",
    view: "back",
    rects: [rect(300, 1488, 186, 112), rect(514, 1488, 186, 112)],
  },
];

/**
 * The side view, in this view's own 480x1600 space. The profile is much shallower than the front, so
 * the depth bands are its own, and the torso is split into its front and back halves - chest against
 * upper back, abdomen against lower back - because that is what a profile shows.
 *
 * This geometry is provisional in one sense only: stage 2.3 draws the side silhouette to match it,
 * and the alignment gates (L2/L3) then validate the result. The zone contract it satisfies is not
 * provisional - the labels are Table 9's own, the zones are disjoint, and every coordinate is an
 * integer inside the declared space.
 */
const SIDE_ZONES: readonly BodyZone[] = [
  { id: "side-head", label: "head", view: "side", rects: [rect(130, 35, 200, 200)] },
  { id: "side-neck", label: "neck", view: "side", rects: [rect(190, 235, 80, 99)] },
  { id: "side-shoulder", label: "shoulder", view: "side", rects: [rect(100, 334, 280, 114)] },
  { id: "side-upper-back", label: "upper back", view: "side", rects: [rect(90, 448, 150, 243)] },
  { id: "side-chest", label: "chest", view: "side", rects: [rect(240, 448, 150, 243)] },
  { id: "side-lower-back", label: "lower back", view: "side", rects: [rect(100, 691, 140, 234)] },
  { id: "side-abdomen", label: "abdomen", view: "side", rects: [rect(240, 691, 140, 234)] },
  { id: "side-thighs", label: "thighs", view: "side", rects: [rect(150, 925, 200, 301)] },
  { id: "side-shins", label: "shins", view: "side", rects: [rect(170, 1226, 160, 262)] },
  { id: "side-feet", label: "feet", view: "side", rects: [rect(150, 1488, 260, 112)] },
];

/** Every zone of every view, in one list - the map as a whole. */
const ALL_ZONES: readonly BodyZone[] = [...FRONT_ZONES, ...BACK_ZONES, ...SIDE_ZONES];

/** The zones of one view, in blueprint order. */
export function zonesForView(view: BodyView): readonly BodyZone[] {
  if (view === "front") return FRONT_ZONES;
  if (view === "back") return BACK_ZONES;

  return SIDE_ZONES;
}

/** A zone by its stable id, or null. */
export function zoneById(id: string): BodyZone | null {
  return ALL_ZONES.find((zone) => zone.id === id) ?? null;
}

function contains(zone: BodyZone, x: number, y: number): boolean {
  return zone.rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
}

/**
 * Every zone containing a point in map units. At most one ever can - the rectangles are
 * disjoint - which is what keeps a tap to a single label. Exposed so the non-overlap
 * invariant can be tested directly rather than inferred from the single-label lookup.
 */
export function zonesAtPoint(view: BodyView, point: BodyMapPoint): readonly BodyZone[] {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];

  const x = Math.round(point.x);
  const y = Math.round(point.y);
  const space = mapSpaceForView(view);

  if (x < 0 || x > space.width || y < 0 || y > space.height) return [];

  return zonesForView(view).filter((zone) => contains(zone, x, y));
}

/**
 * The one zone containing a point, or null when the point is off the figure. Pure
 * integer geometry, so the answer never varies between calls.
 */
export function regionAtPoint(view: BodyView, point: BodyMapPoint): BodyZone | null {
  return zonesAtPoint(view, point)[0] ?? null;
}

/** The label of the zone containing a point, or null when the point is off the figure. */
export function regionLabelAt(view: BodyView, point: BodyMapPoint): string | null {
  return regionAtPoint(view, point)?.label ?? null;
}

/**
 * A point inside a zone, for a marker when a zone is chosen without a tap. It is the
 * area-weighted centre when that centre lands inside the zone, and otherwise the centre
 * of the zone's first rectangle - a two-leg zone's weighted centre falls in the gap
 * between the legs, which would be off the map. Deterministic either way.
 */
export function zoneCentre(zone: BodyZone): BodyMapPoint {
  let area = 0;
  let x = 0;
  let y = 0;

  for (const r of zone.rects) {
    const a = r.width * r.height;
    area += a;
    x += (r.x + r.width / 2) * a;
    y += (r.y + r.height / 2) * a;
  }

  const centroid = { x: Math.round(x / area), y: Math.round(y / area) };

  if (regionAtPoint(zone.view, centroid)?.id === zone.id) return centroid;

  const first = zone.rects[0];

  return { x: Math.round(first.x + first.width / 2), y: Math.round(first.y + first.height / 2) };
}

