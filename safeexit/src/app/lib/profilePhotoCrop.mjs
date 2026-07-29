import {
  clampImageCropOffset,
  getImageCoverScale,
  getImageCropSourceRect,
} from "./imageCrop.mjs";

export const PROFILE_PHOTO_CROP_FRAME = 260;

const squareFrame = (frameSize) => {
  const size = Number.isFinite(Number(frameSize)) && Number(frameSize) > 0
    ? Number(frameSize)
    : PROFILE_PHOTO_CROP_FRAME;
  return { width: size, height: size };
};

export const cropCoverScale = (
  natural,
  zoom = 1,
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => getImageCoverScale(natural, squareFrame(frameSize), zoom);

export const clampCropOffset = (
  offset,
  natural,
  zoom = 1,
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => clampImageCropOffset(offset, natural, squareFrame(frameSize), zoom);

export const getCropSourceRect = (
  natural,
  zoom = 1,
  offset = { x: 0, y: 0 },
  frameSize = PROFILE_PHOTO_CROP_FRAME
) => {
  const source = getImageCropSourceRect(
    natural,
    squareFrame(frameSize),
    zoom,
    offset
  );
  return { x: source.x, y: source.y, size: Math.min(source.width, source.height) };
};
