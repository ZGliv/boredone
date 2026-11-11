// Screen-space correction only: no zoom, routing, or changes to venue coordinates.
export function selectionPan(point, bounds, sheet, offset = [0, 0]) {
  const mobile = bounds.width <= 760;
  let left = 80, right = bounds.width - 80;
  const top = 100;
  let bottom = bounds.height - 70;
  if (sheet) {
    if (mobile) bottom = Math.min(bottom, sheet.top - bounds.top - 70);
    else if (sheet.left + sheet.width / 2 < bounds.left + bounds.width / 2) left = Math.max(left, sheet.right - bounds.left + 100);
    else right = Math.min(right, sheet.left - bounds.left - 100);
  }
  // An expanded sheet can occupy the entire map. Don't move an invisible map
  // trying to fit a pin in a strip that cannot contain it; reveal on collapse.
  if (bottom < top || right < left) return null;
  const x = point.x + offset[0], y = point.y + offset[1];
  return [x - Math.max(left, Math.min(right, x)), y - Math.max(top, Math.min(bottom, y))];
}
