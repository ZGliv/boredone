// Core-flow smoke test. Prints a deterministic transcript of what a person sees.
// Run from the repo root after `npm run build`:
//   npx -y -p playwright@1.64.1 node test/e2e/core-flow.mjs > transcript.txt
// It serves dist/ with `vite preview` on port 4401 (or E2E_PORT), uses a fresh browser profile
// per viewport and blocks every non-local request so the output never depends
// on map tiles, guide services or the network.
import { spawn, execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = Number(process.env.E2E_PORT) || 4401;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VIEWPORTS = [[390, 844], [1440, 1000]];

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
    dialog: pick("dialog[open] #dialog-title, [role=\"dialog\"] #dialog-title"),
    placeOpen: !!document.querySelector(".place-inspector, .place-dock"),
    mapCanvas: !!document.querySelector(".world-canvas .maplibregl-map, .world-canvas canvas"),
    placeCards: document.querySelectorAll(".place-card").length,
    planCards: document.querySelectorAll(".plan-card").length,
    timelineCards: document.querySelectorAll(".timeline-card").length,
  };
}

async function run(chromium, [width, height], out) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", locale: "en-US", timezoneId: "America/New_York" });
  await context.route((url) => !url.href.startsWith(ORIGIN), (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  out.push(`# Viewport ${width}x${height}`);
  const record = async (step) => {
    await page.waitForTimeout(150);
    const s = await page.evaluate(snapshot);
    out.push(`## ${step}`, `hash: ${s.hash}`, `headings: ${s.headings.join(" | ")}`, `notices: ${s.notices.join(" | ")}`,
      `dialog: ${s.dialog.join(" | ")}`, `place open: ${s.placeOpen}`, `map canvas: ${s.mapCanvas}`,
      `cards: places ${s.placeCards}, plans ${s.planCards}, timeline ${s.timelineCards}`,
      `buttons: ${s.buttons.join(" | ")}`, `links: ${s.links.join(" | ")}`, "");
  };
  const find = () => page.locator(".world-screen");

  // 1. Load: Pittsburgh map, nothing selected.
  await page.goto(ORIGIN + "/");
  await find().waitFor();
  await record("1 load");

  // 2. Open the list.
  await page.getByRole("button", { name: "List view" }).click();
  await page.locator(".world-place-list").waitFor();
  await record("2 list open");

  // 3. Open the first place.
  const firstName = (await page.locator(".place-card-open strong").first().innerText()).trim();
  await page.locator(".place-card-open").first().click();
  await page.locator("#place-title").waitFor();
  await record(`3 place open (${firstName})`);

  // 4. Make a plan and save it.
  await page.locator(".inspector-actions").getByRole("button", { name: /Make a plan/ }).click();
  await page.locator("#dialog-title").waitFor();
  await record("4 plan editor");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.locator("#dialog-title").waitFor({ state: "detached" });
  await page.locator(".notice.success").waitFor();
  await record("5 plan saved");

  // 5. Reload: the plan survives.
  await page.reload();
  await find().waitFor();
  await page.goto(ORIGIN + "/#plans");
  await page.locator(".plan-card").first().waitFor();
  await record("6 plans after reload");

  // 6. Mark it visited as a memory.
  await page.locator(".plan-card").first().getByRole("button", { name: "I went ↗" }).click();
  await page.locator("#dialog-title").waitFor();
  await record("7 visit editor");
  await page.getByRole("button", { name: "Save memory" }).click();
  await page.locator("#memory-heading").waitFor();
  await record("8 memory detail");
  await page.getByRole("button", { name: "← All memories" }).click();
  await page.locator(".timeline-card").first().waitFor();
  await record("9 memories timeline");

  // 7. Tonight bookmark add and remove.
  await page.locator(".brand").click();
  await find().waitFor();
  await page.getByRole("button", { name: "List view" }).click();
  await page.locator(".place-card-open").first().click();
  await page.locator("#place-title").waitFor();
  await page.getByRole("button", { name: "Save for tonight" }).click();
  await page.getByRole("button", { name: "Saved for tonight" }).waitFor();
  await record("10 tonight added");
  await page.getByRole("button", { name: /^Tonight, / }).click();
  await page.locator(".tonight-panel").waitFor();
  await record("11 tonight panel");
  await page.locator(".tonight-remove").first().click();
  await page.locator(".tonight-empty").waitFor();
  await record("12 tonight removed");

  // 8. Settings.
  await page.goto(ORIGIN + "/#settings");
  await page.getByRole("heading", { name: "Your journal" }).waitFor();
  await record("13 settings");

  out.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`, "");
  await browser.close();
}

const server = spawn(join(ROOT, "node_modules", ".bin", "vite"), ["preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
const out = [];
let failed = false;
try {
  await waitForServer(server);
  const { chromium } = await loadPlaywright();
  for (const viewport of VIEWPORTS) await run(chromium, viewport, out);
} catch (error) {
  failed = true;
  out.push(`FAILED: ${error.message.split("\n")[0]}`);
} finally {
  server.kill();
}
process.stdout.write(out.join("\n") + "\n");
process.exitCode = failed ? 1 : 0;
