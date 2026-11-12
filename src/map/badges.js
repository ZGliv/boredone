// Round kind badges for the map, drawn at runtime from the app's own icon
// paths (src/ui/icons.js) and handed to MapLibre as images, so 5,000 places
// are one GPU symbol layer rather than 5,000 DOM nodes.
import { ICONS } from "../ui/icons.js";
import { parseBadgeName } from "./markers.js";

const NIGHT = "#101010";
const TONES = {
  done: { fill: "#ffc72c", ink: "#221a00", ring: NIGHT },
  saved: { fill: "#6cb6ff", ink: "#04213d", ring: NIGHT },
  none: { fill: "#252528", ink: "#ebe9e0", ring: "#4b4b50" },
};
// Badge and selected-badge geometry in CSS px.
export const BADGE = { size: 30, icon: 17, stroke: 1.9 };
export const PICK = { size: 46, icon: 24, stroke: 1.8 };

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
