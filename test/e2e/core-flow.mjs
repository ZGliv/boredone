// Whole-loop smoke test. Drives the app the way a person would and prints a
// deterministic transcript of what they see. Run from the repo root after
// `npm run build`:
//   npx -y -p playwright@1.64.1 node test/e2e/core-flow.mjs > transcript.txt
// E2E_SHOTS=output/wave2 also writes a screenshot per step.
//
// It serves dist/ with `vite preview` on port 4401 (or E2E_PORT), uses a fresh
// browser profile per viewport and blocks every non-local request. The two
// API routes are stubbed so the run needs no keys and no network:
//   /api/resolve-save  answers with one candidate taken from the caption
//   /api/events        answers with no events
//
// The loop at 390x844: paste a caption in the Pile -> "Is this the place?" ->
// Yes -> blue on the Map and Board -> in Tonight's three -> Go tonight -> Done
// -> How was it -> Journal entry -> Board count up, cell gold -> reload: all kept.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = Number(process.env.E2E_PORT) || 4401;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = process.env.E2E_SHOTS ? join(ROOT, process.env.E2E_SHOTS) : "";
const CAPTION = "Best sandwich in the city, Primanti Bros before the game";
const PLACE = "Primanti Bros.";

// Prefer the pinned `npx -p playwright` copy on PATH so a stray local install
// of another version cannot change the transcript.
async function loadPlaywright() {
  let bin = "";
  try { bin = realpathSync(execSync("command -v playwright", { encoding: "utf8" }).trim()); } catch { /* Not run via npx. */ }
  if (bin) return import(pathToFileURL(join(dirname(bin), "index.mjs")).href);
  return import("playwright");
}

async function waitForServer(server) {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode != null) throw new Error("vite preview exited early");
    try { if ((await fetch(ORIGIN)).ok) return; } catch { /* Still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No server on ${ORIGIN}`);
}

function check(ok, message) {
  if (!ok) throw new Error(message);
}

// Visible headings, notices and controls, in DOM order.
function snapshot() {
  const visible = (el) => el.checkVisibility?.() !== false && el.getClientRects().length > 0;
  const text = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || "").replace(/\s+/g, " ").trim();
  const pick = (selector) => [...document.querySelectorAll(selector)].filter(visible).map(text).filter(Boolean);
  return {
    hash: location.hash || "(none)",
    headings: pick("h1, h2, h3"),
    notices: pick('[role="status"], [role="alert"], .notice'),
    buttons: [...document.querySelectorAll("button")].filter(visible).map((el) => {
      const flags = [el.disabled && "disabled", el.getAttribute("aria-pressed") === "true" && "pressed", el.getAttribute("aria-current") && "current"].filter(Boolean);
      return text(el) + (flags.length ? ` [${flags.join(",")}]` : "");
    }),
    links: pick("a[href]"),
    sheet: pick(".sheet .sheet-title, .sheet [aria-label]:is(section)"),
    mapCanvas: !!document.querySelector(".world-map canvas"),
    count: pick(".map-count, .board-total").join(" | "),
  };
}

// Board grid cells by colour: gold = done, blue outline = on your pile.
function gridColours() {
  const canvas = document.querySelector(".board-grid canvas");
  if (!canvas) return null;
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  let gold = 0, blue = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 240 && g > 180 && g < 215 && b < 80) gold++;
    if (r < 130 && g > 160 && b > 230) blue++;
  }
  return { gold: gold > 0, blue: blue > 0 };
}

async function run(chromium, [width, height], out, full) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", locale: "en-US", timezoneId: "America/New_York" });
  await context.route((url) => !url.href.startsWith(ORIGIN), (route) => route.abort());
  const page = await context.newPage();
  await page.route("**/api/events?*", (route) => route.fulfill({ json: { events: [] } }));
  await page.route("**/api/resolve-save", (route) => {
    const { text = "" } = route.request().postDataJSON() || {};
    const hit = /Primanti Bros/.exec(text);
    route.fulfill({ json: hit
      ? { status: "resolved", candidates: [{ name: hit[0], venue: "", city: "Pittsburgh", kind: "restaurant", eventDate: "", expiresAt: "", confidence: 0.9, evidence: hit[0] }] }
      : { status: "unresolved", candidates: [] } });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  out.push(`# Viewport ${width}x${height}`);
  let shot = 0;
  const record = async (step) => {
    await page.waitForTimeout(250);
    const s = await page.evaluate(snapshot);
    out.push(`## ${step}`, `hash: ${s.hash}`, `headings: ${s.headings.join(" | ")}`, `notices: ${s.notices.join(" | ")}`,
      `sheet: ${s.sheet.join(" | ")}`, `map canvas: ${s.mapCanvas}`, `count: ${s.count}`,
      `buttons: ${s.buttons.join(" | ")}`, `links: ${s.links.join(" | ")}`, "");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `e2e-${width}-${String(++shot).padStart(2, "0")}-${step.replace(/\W+/g, "-")}.png`) });
  };
  const tab = (name) => page.locator(`a.tab[href="#${name}"]`).click();
  const boardCount = async () => Number((await page.locator(".board-done").innerText()).replace(/\D/g, ""));

  // Load: the map, nothing selected, the city count.
  await page.goto(ORIGIN + "/");
  await page.locator(".map-count").waitFor();
  await record("map");
  check(!(await page.locator(".place-sheet").count()), "map opened with a place selected");

  if (!full) {
    await tab("pile");
    await page.locator(".page-title").waitFor();
    await record("pile");
    await tab("board");
    await page.locator(".board-total").waitFor();
    await record("board");
    await tab("journal");
    await page.getByRole("heading", { name: "Journal" }).waitFor();
    await record("journal");
    out.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`, "");
    await browser.close();
    check(!errors.length, `page errors: ${errors.join(" | ")}`);
    return;
  }

  // Board before: nothing done.
  await tab("board");
  await page.locator(".board-total").waitFor();
  const before = await boardCount();
  check(before === 0, `board starts at ${before}`);

  // 1. Paste a caption in the Pile; the resolver finds the place.
  await tab("pile");
  await page.getByRole("button", { name: "Save to pile" }).click();
  await page.locator("#pile-add-input").fill(CAPTION);
  await record("pile add");
  await page.locator(".pile-add").getByRole("button", { name: "Save" }).click();
  await page.locator(".pile-confirm").waitFor();
  await record("is this the place");
  check((await page.locator(".pile-cand-name").innerText()).startsWith("Primanti"), "first candidate is not Primanti");

  // 2. Yes: the save is placed.
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.locator(".pile-confirm").waitFor({ state: "detached" });
  await page.locator(".pile-row", { hasText: "Primanti" }).waitFor();
  await record("pile placed");
  const placeName = (await page.locator(".pile-row-title").first().innerText()).trim();

  // 3. Blue on the Board.
  await tab("board");
  await page.locator(".board-grid canvas").waitFor();
  await page.waitForTimeout(200);
  const pileGrid = await page.evaluate(gridColours);
  check(pileGrid?.blue && !pileGrid.gold, `board grid after save: ${JSON.stringify(pileGrid)}`);
  await record("board with a save");

  // 4. Blue on the Map: open its place sheet from the Board's kind list.
  await page.locator(".board-kinds button", { hasText: "Restaurants" }).click();
  await page.locator(".place-list").waitFor();
  const pileGroup = page.locator(".place-list-group", { has: page.locator(".place-list-label", { hasText: "On your pile" }) });
  await pileGroup.locator(".row", { hasText: placeName }).first().click();
  await page.locator(".place-sheet").waitFor();
  await record("map place sheet");
  check(/Saved/.test(await page.locator(".place-sheet").innerText()), "map sheet does not show the save");
  await page.keyboard.press("Escape");
  await page.locator(".place-sheet").waitFor({ state: "detached" });

  // 5. It is one of tonight's three.
  await page.locator(".tn").waitFor();
  if (!(await page.locator(".tn-dock-row").count())) await page.locator(".tn-grip").click();
  await page.locator(".tn-dock-row", { hasText: placeName }).waitFor();
  await record("tonight");
  await page.locator(".tn-dock-row", { hasText: placeName }).click();
  await page.locator(".tn-pick-open").waitFor();

  // 6. Go tonight, then Done.
  await page.locator(".tn-pick-open").getByRole("button", { name: "Go tonight" }).click();
  await page.locator(".tn-pick-open", { hasText: "On tonight's plan" }).waitFor();
  await record("on tonight's plan");
  await page.locator(".tn-pick-open").getByRole("button", { name: "Done" }).click();
  await page.locator(".outing-sheet").waitFor();
  await page.getByRole("radio", { name: "Loved it" }).click();
  await record("how was it");
  await page.locator(".outing-sheet").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".outing-sheet").waitFor({ state: "detached" });

  // 7. The Journal has it.
  await page.locator(".entry", { hasText: placeName }).waitFor();
  await record("journal");

  // 8. Board count up, cell gold, nothing left on the pile.
  await tab("board");
  await page.locator(".board-grid canvas").waitFor();
  await page.waitForTimeout(200);
  check((await boardCount()) === before + 1, "board count did not go up");
  const doneGrid = await page.evaluate(gridColours);
  check(doneGrid?.gold && !doneGrid.blue, `board grid after done: ${JSON.stringify(doneGrid)}`);
  await record("board after done");

  // 9. Reload: all still there.
  await page.reload();
  await page.locator(".board-grid canvas").waitFor();
  await page.waitForTimeout(200);
  check((await boardCount()) === before + 1, "board count lost on reload");
  await record("board after reload");
  await tab("journal");
  await page.locator(".entry", { hasText: placeName }).waitFor();
  await page.locator(".entry", { hasText: placeName }).click();
  await page.locator("#memory-heading").waitFor();
  check(/Loved it/.test(await page.locator(".memory").innerText()), "verdict lost on reload");
  await record("memory after reload");
  await tab("pile");
  await page.locator(".page-title").waitFor();
  check(!(await page.locator(".pile-row", { hasText: placeName }).count()), "done place still on the pile");
  await record("pile after reload");

  // 10. Settings.
  await tab("journal");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await record("settings");

  out.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`, "");
  await browser.close();
  check(!errors.length, `page errors: ${errors.join(" | ")}`);
}

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const server = spawn(join(ROOT, "node_modules", ".bin", "vite"), ["preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
const out = [];
let failed = false;
try {
  await waitForServer(server);
  const { chromium } = await loadPlaywright();
  await run(chromium, [390, 844], out, true);
  await run(chromium, [1440, 1000], out, false);
} catch (error) {
  failed = true;
  out.push(`FAILED: ${error.message.split("\n")[0]}`);
} finally {
  server.kill();
}
process.stdout.write(out.join("\n") + "\n");
process.exitCode = failed ? 1 : 0;
