// Round kind badges and photo pins for the map, drawn at runtime and handed to
// MapLibre as images, so 5,000 places are one GPU symbol layer rather than
// 5,000 DOM nodes. Badges use the app's own icon paths (src/ui/icons.js);
// photo pins are cut from the one photo atlas (src/data/photo-previews.json)
// once it has decoded.
import { ICONS } from "../ui/icons.js";
import { parseBadgeName, parsePhotoName } from "./markers.js";

const NIGHT = "#101010";
const CREAM = "#f5f3ea";
const TONES = {
  done: { fill: "#ffc72c", ink: "#221a00", ring: NIGHT },
  saved: { fill: "#6cb6ff", ink: "#04213d", ring: NIGHT },
  none: { fill: "#e4e0d3", ink: "#17181a", ring: NIGHT },
};
// The ring around a photo: cream like the old app, gold when done, blue when saved.
const PHOTO_RING = { done: "#ffc72c", saved: "#6cb6ff", none: CREAM };
// Geometry in CSS px. size is the image; a photo pin keeps `shadow` px of it
// for a soft drop shadow so it lifts off the night map.
export const BADGE = { size: 28, icon: 16, stroke: 2 };
export const PICK = { size: 46, icon: 24, stroke: 1.8 };
export const PHOTO = { size: 54, ring: 3, shadow: 2.5 };
export const PICK_PHOTO = { size: 76, ring: 4, shadow: 3 };

// ImageData for a badge name ("badge:coffee:done"), or null for a name that is not ours.
export function drawBadge(name, pixelRatio) {
  const spec = parseBadgeName(name);
  if (!spec) return null;
  const { size, icon, stroke } = spec.selected ? PICK : BADGE;
  const tone = TONES[spec.tone];
  const px = Math.ceil(size * pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.scale(pixelRatio, pixelRatio);
  const c = size / 2;

  if (spec.selected) {
    // A cream ring, then a hairline of night so it reads on any tile.
    disc(ctx, c, c - 0.5, NIGHT);
    disc(ctx, c, c - 1.5, "#f5f3ea");
    disc(ctx, c, c - 4.5, spec.tone === "none" ? "#f5f3ea" : tone.fill);
    if (spec.tone === "none") ring(ctx, c, c - 4.5, NIGHT, 1);
  } else {
    disc(ctx, c, c - 0.5, tone.ring);
    disc(ctx, c, c - 1.5, tone.fill);
  }

  const path = new Path2D(ICONS[spec.icon] || ICONS.place);
  ctx.save();
  ctx.translate(c - icon / 2, c - icon / 2);
  ctx.scale(icon / 24, icon / 24);
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = spec.selected && spec.tone === "none" ? NIGHT : tone.ink;
  ctx.stroke(path);
  ctx.restore();
  return { image: ctx.getImageData(0, 0, px, px), pixelRatio };
}

// ImageData for a photo pin name ("photo:12:done"), or null when the name is
// not ours or the atlas is not decoded yet. atlas: {image, columns, rows}.
export function drawPhotoPin(name, pixelRatio, atlas) {
  const spec = parsePhotoName(name);
  if (!spec || !atlas?.image) return null;
  const { image, columns, rows } = atlas;
  if (spec.cell >= columns * rows) return null;
  const { size, ring: width, shadow } = spec.selected ? PICK_PHOTO : PHOTO;
  const px = Math.ceil(size * pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.scale(pixelRatio, pixelRatio);
  const c = size / 2, r = c - shadow;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = shadow * 1.5;
  ctx.shadowOffsetY = shadow / 2;
  disc(ctx, c, r, NIGHT);
  ctx.restore();
  disc(ctx, c, r - 0.75, PHOTO_RING[spec.tone]);
  if (spec.selected) disc(ctx, c, r - width + 0.25, NIGHT);

  // The photo, clipped to a circle inside the ring, from its 96 px atlas cell.
  const cw = image.naturalWidth / columns, ch = image.naturalHeight / rows;
  const sx = (spec.cell % columns) * cw, sy = Math.floor(spec.cell / columns) * ch;
  const inner = r - width - (spec.selected ? 1 : 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  // Half a pixel in from each edge so a neighbouring cell never bleeds in.
  ctx.drawImage(image, sx + 0.5, sy + 0.5, cw - 1, ch - 1, c - inner, c - inner, inner * 2, inner * 2);
  ctx.restore();
  return { image: ctx.getImageData(0, 0, px, px), pixelRatio };
}

function disc(ctx, c, r, colour) {
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}
function ring(ctx, c, r, colour, width) {
  ctx.beginPath();
  ctx.arc(c, c, r - width / 2, 0, Math.PI * 2);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}
