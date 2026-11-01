import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BACK_VIEW_LABELS,
  BODY_MAP_UNITS_X,
  BODY_MAP_UNITS_Y,
  FRONT_VIEW_LABELS,
  REGION_LABELS,
  SIDE_MAP_UNITS_X,
  SIDE_MAP_UNITS_Y,
  SIDE_VIEW_LABELS,
  mapSpaceForView,
  regionAtPoint,
  regionLabelAt,
  zoneById,
  zoneCentre,
  zonesAtPoint,
  zonesForView,
  type BodyView,
} from "./regions.ts";

/**
 * The region map's own tests - blueprint check G3.4 ("fixed coordinates always map to
 * the same labels") and the test Chapter 4.4 asks for by name.
 *
 * Everything here is geometry and source inspection: no model, no network, no database.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every view, for the invariants that must hold in all of them. */
const VIEWS: readonly BodyView[] = ["front", "back", "side"];

/**
 * The y transform Phase 2.1 applied, and the heights the product owner approved (A2, A3) in the
 * previous square axis. The zone data is in the map's own axis, so each approved height appears
 * there as `round(approved * Y_SCALE)`: 125 -> 200, 62 -> 99, 71 -> 114, 70 -> 112.
 */
const Y_SCALE = 1.6;
const APPROVED = { head: 125, neck: 62, shoulder: 71, feet: 70 } as const;

/** The three fixed taps Chapter 4.4 asks to be pinned down, in map units (y in this map's axis). */
const FIXED_TAPS: readonly { view: BodyView; point: { x: number; y: number }; label: string }[] = [
  { view: "front", point: { x: 500, y: 144 }, label: "head" },
  { view: "front", point: { x: 350, y: 544 }, label: "chest" },
  { view: "front", point: { x: 620, y: 1056 }, label: "thighs" },
];

/** Points that sit off the figure in every view: beside it, below it, or in a gap. */
const OFF_FIGURE: readonly { x: number; y: number }[] = [
  { x: 10, y: 10 },
  { x: 990, y: 990 },
  { x: 500, y: 1450 },
  { x: 495, y: 1600 },
];

describe("region map", () => {
  it("carries exactly the fourteen Table 9 labels, seven per view", () => {
    assert.deepEqual(
      zonesForView("front").map((zone) => zone.label),
      [...FRONT_VIEW_LABELS],
    );
    assert.deepEqual(
      zonesForView("back").map((zone) => zone.label),
      [...BACK_VIEW_LABELS],
    );
    assert.equal(REGION_LABELS.length, 14);
    assert.equal(new Set(REGION_LABELS).size, 14);
    assert.equal(new Set([...zonesForView("front"), ...zonesForView("back")].map((zone) => zone.id)).size, 14);

    // The side view is a third drawing of the same vocabulary: its labels are Table 9's own, in the
    // order the view lists them, and it invents none (the approved A1).
    assert.deepEqual(
      zonesForView("side").map((zone) => zone.label),
      [...SIDE_VIEW_LABELS],
    );
    assert.equal(SIDE_VIEW_LABELS.length, 10);

    for (const label of SIDE_VIEW_LABELS) {
      assert.ok(REGION_LABELS.includes(label), `the side view invented the label "${label}"`);
    }
  });

  it("maps three fixed coordinates to the same three labels on every call", () => {
    for (const tap of FIXED_TAPS) {
      assert.equal(regionLabelAt(tap.view, tap.point), tap.label, `first read at ${JSON.stringify(tap.point)}`);
    }

    const first = FIXED_TAPS.map((tap) => regionAtPoint(tap.view, tap.point)?.id ?? null);
    const second = FIXED_TAPS.map((tap) => regionAtPoint(tap.view, tap.point)?.id ?? null);
    const third = FIXED_TAPS.map((tap) => regionAtPoint(tap.view, tap.point)?.id ?? null);

    assert.deepEqual(second, first);
    assert.deepEqual(third, first);
    assert.deepEqual(first, ["head", "chest", "thighs"]);
  });

  it("names the back view's own regions at the same coordinates", () => {
    assert.equal(regionLabelAt("back", { x: 350, y: 544 }), "upper back");
    assert.equal(regionLabelAt("back", { x: 200, y: 640 }), "arms");
    assert.equal(regionLabelAt("back", { x: 350, y: 1280 }), "knees");
  });

  it("names the side view's own regions, including the torso's two halves", () => {
    assert.equal(regionLabelAt("side", { x: 230, y: 144 }), "head");
    assert.equal(regionLabelAt("side", { x: 160, y: 544 }), "upper back");
    assert.equal(regionLabelAt("side", { x: 320, y: 544 }), "chest");
    assert.equal(regionLabelAt("side", { x: 160, y: 800 }), "lower back");
    assert.equal(regionLabelAt("side", { x: 320, y: 800 }), "abdomen");
    assert.equal(regionLabelAt("side", { x: 260, y: 1544 }), "feet");
  });

  it("names nothing for a point off the figure, in any view", () => {
    for (const point of OFF_FIGURE) {
      for (const view of VIEWS) {
        assert.equal(
          regionAtPoint(view, point),
          null,
          `${view} view must name nothing at ${JSON.stringify(point)}`,
        );
      }
    }
  });

  it("never names two regions for one point (the zones are disjoint)", () => {
    let covered = 0;

    for (const view of VIEWS) {
      const space = mapSpaceForView(view);

      for (let y = 0; y <= space.height; y += 5) {
        for (let x = 0; x <= space.width; x += 5) {
          const matches = zonesAtPoint(view, { x, y });

          assert.ok(
            matches.length <= 1,
            `${view} view overlapped at ${x},${y}: ${matches.map((z) => z.id).join(" + ")}`,
          );

          if (matches.length === 1) covered += 1;
        }
      }
    }

    assert.ok(covered > 1000, `the grid should land inside zones often, landed ${covered} time(s)`);
  });

  it("keeps every zone's centre inside that same zone, deterministically", () => {
    for (const view of VIEWS) {
      for (const zone of zonesForView(view)) {
        const centre = zoneCentre(zone);

        assert.equal(regionAtPoint(zone.view, centre)?.id, zone.id, `${zone.id} centre ${JSON.stringify(centre)}`);
        assert.deepEqual(zoneCentre(zone), centre);
        assert.equal(zoneById(zone.id)?.label, zone.label);
      }
    }
  });

  it("is pure geometry: no import, no network, no environment", () => {
    const source = readFileSync(join(HERE, "regions.ts"), "utf8");

    assert.equal(/^\s*import\b/m.test(source), false, "regions.ts must not import anything");

    for (const banned of ["fetch(", "XMLHttpRequest", "process.env", "api/"]) {
      assert.equal(source.includes(banned), false, `regions.ts must not contain "${banned}"`);
    }
  });
});

/**
 * The Phase 2.1 geometry work: the per-view map space, the transform that produced it, and the
 * approved zone sizes (A2, A3). These are the tests that make the map-space change verifiable
 * rather than a rename - they pin the space, the integers, the abutting bands and the approved
 * heights in one place, in the map's own axis.
 */
describe("region map space (Phase 2.1)", () => {
  it("declares a space per view, with one height shared by all three", () => {
    assert.deepEqual(mapSpaceForView("front"), { width: BODY_MAP_UNITS_X, height: BODY_MAP_UNITS_Y });
    assert.deepEqual(mapSpaceForView("back"), { width: BODY_MAP_UNITS_X, height: BODY_MAP_UNITS_Y });
    assert.deepEqual(mapSpaceForView("side"), { width: SIDE_MAP_UNITS_X, height: SIDE_MAP_UNITS_Y });

    // A6: the same height across views; A8: the side view is narrower, and not stretched to match.
    assert.equal(BODY_MAP_UNITS_X, 1000);
    assert.equal(BODY_MAP_UNITS_Y, 1600);
    assert.equal(SIDE_MAP_UNITS_Y, BODY_MAP_UNITS_Y);
    assert.ok(SIDE_MAP_UNITS_X < BODY_MAP_UNITS_X, "the side view must be narrower than the front");
  });

  it("keeps every coordinate an integer inside its own view's space", () => {
    for (const view of VIEWS) {
      const space = mapSpaceForView(view);

      for (const zone of zonesForView(view)) {
        assert.equal(zone.view, view, `${zone.id} is filed under the wrong view`);
        assert.ok(zone.rects.length > 0, `${zone.id} has no rectangles`);

        for (const r of zone.rects) {
          for (const [name, value] of Object.entries(r)) {
            assert.ok(Number.isInteger(value), `${zone.id}.${name} = ${value} is not an integer`);
          }

          assert.ok(r.width > 0 && r.height > 0, `${zone.id} has an empty rectangle`);
          assert.ok(r.x >= 0 && r.x + r.width <= space.width, `${zone.id} leaves the space horizontally`);
          assert.ok(r.y >= 0 && r.y + r.height <= space.height, `${zone.id} leaves the space vertically`);
        }
      }
    }
  });

  it("gives every zone a unique id, and no two views share one", () => {
    const ids = VIEWS.flatMap((view) => zonesForView(view).map((zone) => zone.id));

    assert.equal(new Set(ids).size, ids.length, `duplicate zone id: ${ids.join(", ")}`);
    assert.equal(ids.length, 7 + 7 + 10);
    assert.equal(zoneById("side-head")?.label, "head");
    assert.equal(zoneById("head")?.view, "front");
    assert.equal(zoneById("no-such-zone"), null);
  });

  it("applies the approved heights A2 and A3 in the map's own axis", () => {
    const head = zoneById("head");
    const neck = zoneById("neck");
    const shoulder = zoneById("shoulder");
    const chest = zoneById("chest");
    const feet = zoneById("feet");

    assert.ok(head && neck && shoulder && chest && feet);

    // The approved values are quoted in the previous square axis, so each is `round(approved * 1.6)`
    // here: head 125 -> 200, neck 62 -> 99, shoulder 71 -> 114, feet 70 -> 112.
    assert.equal(head.rects[0].height, Math.round(APPROVED.head * Y_SCALE));
    assert.equal(neck.rects[0].height, Math.round(APPROVED.neck * Y_SCALE));
    assert.equal(shoulder.rects[0].height, Math.round(APPROVED.shoulder * Y_SCALE));
    assert.equal(feet.rects[0].height, Math.round(APPROVED.feet * Y_SCALE));

    // The three upper bands still abut, which is what keeps a tap to one label (A3's own arithmetic:
    // 22 + 125 + 62 + 71 = 280).
    assert.equal(head.rects[0].y + head.rects[0].height, neck.rects[0].y);
    assert.equal(neck.rects[0].y + neck.rects[0].height, shoulder.rects[0].y);
    assert.equal(shoulder.rects[0].y + shoulder.rects[0].height, chest.rects[0].y);

    // A2's intent: the feet zone's lower edge is the bottom of the drawing box.
    assert.equal(feet.rects[0].y + feet.rects[0].height, BODY_MAP_UNITS_Y);
  });

  it("keeps the front and back bands abutting down the figure", () => {
    const front = zonesForView("front");
    const back = zonesForView("back");

    for (let i = 1; i < front.length; i += 1) {
      const above = front[i - 1].rects[0];
      const below = front[i].rects[0];

      assert.equal(above.y + above.height, below.y, `${front[i - 1].id} does not meet ${front[i].id}`);
    }

    const upperBack = back[0].rects[0];
    const lowerBack = back[1].rects[0];
    const hips = back[2].rects[0];
    assert.equal(upperBack.y + upperBack.height, lowerBack.y);
    assert.equal(lowerBack.y + lowerBack.height, hips.y);

    // The legs: the thigh band meets the shin band, and the knees sit inside the shins.
    const thighs = front[5].rects[0];
    const shins = front[6].rects[0];
    const knees = back[5].rects[0];
    assert.equal(thighs.y + thighs.height, shins.y);
    assert.ok(knees.y >= shins.y && knees.y + knees.height <= shins.y + shins.height);
  });
});
