// Map photos for city places. Pure: no React, no DOM.
//
// The old hand-made Pittsburgh guide (src/preloaded.js) carries two kinds of
// venue photo, both already reduced into one sprite atlas of 96 px pin cells
// and a content-hashed card preview each (src/data/photo-previews.json):
//   licensed  openly licensed Commons photos (author, licence, source page)
//   website   reviewed photos from the venue's own website (source page, brand)
// scripts/build-place-photos.mjs keeps just the guide records that have one,
// with the photo's full original source record, in src/data/place-photos.json,
// so a city load does not have to pull in the whole guide.

// The photo a guide record shows, or null. Licensed first: its credit is the
// clearest. A website photo is dropped when the guide has blocked the site.
export function guidePhoto(record, previews) {
  const preview = (photo) => (photo?.url ? previews.photos[photo.originalUrl || photo.url] : null);
  if (record.photo?.license && preview(record.photo)) return { kind: "licensed", ...preview(record.photo), credit: record.photo };
  if (!record.websiteBlocked && record.websitePhoto && preview(record.websitePhoto)) return { kind: "website", ...preview(record.websitePhoto), credit: record.websitePhoto };
  return null;
}

// The compact index the build script writes. Places: one per guide id.
export function photoIndex(guidePlaces, previews) {
  const seen = new Set(), places = [];
  for (const record of guidePlaces) {
    if (seen.has(record.id)) continue;
    const photo = guidePhoto(record, previews);
    if (!photo) continue;
    seen.add(record.id);
    places.push({ id: record.id, name: record.name, lat: record.lat, lng: record.lng, photo: { kind: photo.kind, index: photo.index, card: photo.card, credit: photo.credit } });
  }
  return { atlas: previews.atlas, columns: previews.columns, rows: previews.rows, places };
}

// One line of credit for a photo, as the place sheet shows it.
//   licensed: {text: "Cbaile19", href: Commons page, licence: "CC0", licenceHref}
//   website:  {text: "originaloysterhouse.com", href: the page it came from}
export function photoCredit(photo) {
  const credit = photo?.credit;
  if (!credit) return null;
  if (photo.kind === "licensed") return { text: credit.author || "Wikimedia Commons", href: credit.sourceUrl || "", licence: credit.license || "", licenceHref: credit.licenseUrl || "" };
  let site = "";
  try { site = siteName(new URL(credit.sourceUrl).hostname); } catch { /* No source page: name the business instead. */ }
  const text = site || credit.author || "Venue website";
  return { text: credit.scope === "brand" ? `${text} (brand photo)` : text, href: credit.sourceUrl || "", licence: "", licenceHref: "" };
}

// "media.thecapitalgrille.com" -> "thecapitalgrille.com"; keeps "x.co.uk" whole.
function siteName(host) {
  const parts = host.split(".");
  const keep = parts.length > 2 && parts.at(-2).length <= 3 && parts.at(-1).length === 2 ? 3 : 2;
  return parts.slice(-keep).join(".");
}

// Background styles that show one row-major cell of the atlas at `size` px.
// The cell is drawn a touch larger than the tile and centred, so a
// neighbouring cell never shows along an edge.
export function atlasCell(photo, size) {
  if (!photo?.atlas || !Number.isInteger(photo.index) || photo.index < 0) return null;
  const { atlas, columns, rows, index } = photo;
  if (!columns || !rows || index >= columns * rows) return null;
  const cell = size * 1.06, inset = (cell - size) / 2;
  const px = (n) => `${Math.round(n * 100) / 100}px`;
  return {
    backgroundImage: `url("${atlas}")`,
    backgroundSize: `${px(columns * cell)} ${px(rows * cell)}`,
    backgroundPosition: `${px(-(index % columns) * cell - inset)} ${px(-Math.floor(index / columns) * cell - inset)}`,
  };
}
