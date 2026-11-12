import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CELL, gridLayout } from "./boardView";

// Every place on the board as one small square, drawn on a canvas so 5,000
// cells cost one paint: gold = done, blue outline = on your pile, dim = not yet.
export default function BoardGrid({ cells, label }) {
  const box = useRef(null), canvas = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const layout = gridLayout(cells.length, width, width > 600 ? 240 : 340);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !layout.cols) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(layout.width * dpr);
    el.height = Math.round(layout.height * dpr);
    const ctx = el.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(el);
    const gold = css.getPropertyValue("--gold").trim(), blue = css.getPropertyValue("--blue").trim(), dim = css.getPropertyValue("--raised").trim();
    const { cols, pitch, cell } = layout;
    const runs = [[CELL.rest, dim], [CELL.done, gold]];
    for (const [kind, colour] of runs) {
      ctx.fillStyle = colour;
      for (let i = 0; i < cells.length; i++) if (cells[i] === kind) ctx.fillRect((i % cols) * pitch, Math.floor(i / cols) * pitch, cell, cell);
    }
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1;
    for (let i = 0; i < cells.length; i++) if (cells[i] === CELL.pile) ctx.strokeRect((i % cols) * pitch + 0.5, Math.floor(i / cols) * pitch + 0.5, cell - 1, cell - 1);
  }, [cells, layout.cols, layout.pitch, layout.width, layout.height]);
  return (
    <div ref={box} className="board-grid">
      {layout.cols > 0 && <canvas ref={canvas} role="img" aria-label={label} style={{ width: layout.width, height: layout.height }} />}
    </div>
  );
}
