import test from "node:test";
import assert from "node:assert/strict";
import {
  clampImageCropOffset,
  getImageCoverScale,
  getImageCropSourceRect,
} from "../src/app/lib/imageCrop.mjs";

const signatureFrame = { width: 500, height: 200 };
const photo = { width: 1600, height: 1200 };

test("a signature photo covers a wide crop frame without empty edges", () => {
  assert.equal(getImageCoverScale(photo, signatureFrame, 1), 0.3125);
  assert.deepEqual(
    clampImageCropOffset({ x: 100, y: -100 }, photo, signatureFrame, 1),
    { x: 0, y: -87.5 }
  );
});

test("the signature export matches the rectangular adjustment preview", () => {
  assert.deepEqual(
    getImageCropSourceRect(photo, signatureFrame, 1, { x: 0, y: 0 }),
    { x: 0, y: 280, width: 1600, height: 640 }
  );
});

test("zoom and pan remain clamped to the source signature photo", () => {
  const offset = clampImageCropOffset(
    { x: 500, y: -500 },
    photo,
    signatureFrame,
    2
  );

  assert.deepEqual(offset, { x: 250, y: -275 });
  assert.deepEqual(
    getImageCropSourceRect(photo, signatureFrame, 2, offset),
    { x: 0, y: 880, width: 800, height: 320 }
  );
});
