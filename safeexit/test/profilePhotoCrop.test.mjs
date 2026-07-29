import test from "node:test";
import assert from "node:assert/strict";
import {
  clampCropOffset,
  cropCoverScale,
  getCropSourceRect,
} from "../src/app/lib/profilePhotoCrop.mjs";

test("a landscape photo covers the crop frame without exposing empty space", () => {
  const natural = { width: 1200, height: 800 };

  assert.equal(cropCoverScale(natural, 1, 240), 0.3);
  assert.deepEqual(
    clampCropOffset({ x: 999, y: -999 }, natural, 1, 240),
    { x: 60, y: 0 }
  );
});

test("zooming produces the centered square represented by the preview", () => {
  const source = getCropSourceRect(
    { width: 1200, height: 800 },
    2,
    { x: 0, y: 0 },
    240
  );

  assert.deepEqual(source, { x: 400, y: 200, size: 400 });
});

test("dragging to an edge keeps the exported crop inside the source image", () => {
  const natural = { width: 1200, height: 800 };
  const offset = clampCropOffset({ x: 500, y: -500 }, natural, 2, 240);
  const source = getCropSourceRect(natural, 2, offset, 240);

  assert.deepEqual(offset, { x: 240, y: -120 });
  assert.deepEqual(source, { x: 0, y: 400, size: 400 });
});
