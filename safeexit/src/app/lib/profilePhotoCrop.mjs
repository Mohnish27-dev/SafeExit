export const PROFILE_PHOTO_CROP_FRAME = 260;

const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const cropCoverScale = (
  natural,
  zoom = 1,
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => {
  const width = positiveNumber(natural?.width, 1);
  const height = positiveNumber(natural?.height, 1);
  const frame = positiveNumber(frameSize, PROFILE_PHOTO_CROP_FRAME);
  const safeZoom = Math.max(1, positiveNumber(zoom, 1));

  return Math.max(frame / width, frame / height) * safeZoom;
};

export const clampCropOffset = (
  offset,
  natural,
  zoom = 1,
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => {
  const width = positiveNumber(natural?.width, 1);
  const height = positiveNumber(natural?.height, 1);
  const frame = positiveNumber(frameSize, PROFILE_PHOTO_CROP_FRAME);
  const scale = cropCoverScale({ width, height }, zoom, frame);
  const maxX = Math.max(0, (width * scale - frame) / 2);
  const maxY = Math.max(0, (height * scale - frame) / 2);
  const x = Number.isFinite(Number(offset?.x)) ? Number(offset.x) : 0;
  const y = Number.isFinite(Number(offset?.y)) ? Number(offset.y) : 0;
  const clampedX = Math.min(maxX, Math.max(-maxX, x));
  const clampedY = Math.min(maxY, Math.max(-maxY, y));

  return {
    x: clampedX === 0 ? 0 : clampedX,
    y: clampedY === 0 ? 0 : clampedY,
  };
};

export const getCropSourceRect = (
  natural,
  zoom = 1,
  offset = { x: 0, y: 0 },
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => {
  const width = positiveNumber(natural?.width, 1);
  const height = positiveNumber(natural?.height, 1);
  const frame = positiveNumber(frameSize, PROFILE_PHOTO_CROP_FRAME);
  const scale = cropCoverScale({ width, height }, zoom, frame);
  const clampedOffset = clampCropOffset(offset, { width, height }, zoom, frame);
  const size = Math.min(width, height, frame / scale);

  return {
    x: Math.min(width - size, Math.max(0, width / 2 - clampedOffset.x / scale - size / 2)),
    y: Math.min(height - size, Math.max(0, height / 2 - clampedOffset.y / scale - size / 2)),
    size,
  };
};
