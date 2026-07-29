const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const normalizeSize = (size, fallback = { width: 1, height: 1 }) => ({
  width: positiveNumber(size?.width, fallback.width),
  height: positiveNumber(size?.height, fallback.height),
});

export const getImageCoverScale = (natural, frame, zoom = 1) => {
  const source = normalizeSize(natural);
  const viewport = normalizeSize(frame);
  const safeZoom = Math.max(1, positiveNumber(zoom, 1));

  return Math.max(
    viewport.width / source.width,
    viewport.height / source.height
  ) * safeZoom;
};

export const clampImageCropOffset = (offset, natural, frame, zoom = 1) => {
  const source = normalizeSize(natural);
  const viewport = normalizeSize(frame);
  const scale = getImageCoverScale(source, viewport, zoom);
  const maxX = Math.max(0, (source.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (source.height * scale - viewport.height) / 2);
  const requestedX = Number.isFinite(Number(offset?.x)) ? Number(offset.x) : 0;
  const requestedY = Number.isFinite(Number(offset?.y)) ? Number(offset.y) : 0;
  const x = Math.min(maxX, Math.max(-maxX, requestedX));
  const y = Math.min(maxY, Math.max(-maxY, requestedY));

  return {
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  };
};

export const getImageCropSourceRect = (
  natural,
  frame,
  zoom = 1,
  offset = { x: 0, y: 0 }
) => {
  const source = normalizeSize(natural);
  const viewport = normalizeSize(frame);
  const scale = getImageCoverScale(source, viewport, zoom);
  const clampedOffset = clampImageCropOffset(offset, source, viewport, zoom);
  const width = Math.min(source.width, viewport.width / scale);
  const height = Math.min(source.height, viewport.height / scale);

  return {
    x: Math.min(
      source.width - width,
      Math.max(0, source.width / 2 - clampedOffset.x / scale - width / 2)
    ),
    y: Math.min(
      source.height - height,
      Math.max(0, source.height / 2 - clampedOffset.y / scale - height / 2)
    ),
    width,
    height,
  };
};
