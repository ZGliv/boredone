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
    sheet: pick(".sheet .sheet-title"),
    mapCanvas: !!document.querySelector(".world-map canvas"),
    count: pick(".map-count, .board-total").join(" | "),
    rows: document.querySelectorAll(".row").length,
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
      `dialog: ${s.dialog.join(" | ")}`, `sheet: ${s.sheet.join(" | ")}`, `map canvas: ${s.mapCanvas}`,
      `count: ${s.count}`, `rows: ${s.rows}`,
      `buttons: ${s.buttons.join(" | ")}`, `links: ${s.links.join(" | ")}`, "");
  };
  const tab = (name) => page.locator(`a.tab[href="#${name}"]`).click();

  // 1. Load: the map, nothing selected, the city count.
  await page.goto(ORIGIN + "/");
  await page.locator(".map-count").waitFor();
  await record("1 map");

  // 2. City switcher lists the packs.
  await page.locator(".city-switcher").click();
  await page.locator(".sheet").waitFor();
  await record("2 city switcher");
  await page.keyboard.press("Escape");
  await page.locator(".sheet").waitFor({ state: "detached" });

  // 3. Save a note to the Pile.
  await tab("pile");
  await page.getByRole("button", { name: "Add to pile" }).click();
  await page.locator("#pile-add-input").fill("that ramen place Sam mentioned");
  await page.locator(".pile-add").getByRole("button", { name: "Save" }).click();
  await page.locator(".row").first().waitFor();
  await record("3 pile with a save");

  // 4. Board.
  await tab("board");
  await page.locator(".board-total").waitFor();
  await record("4 board");

  // 5. Plan something from the Journal.
  await tab("journal");
  await page.getByRole("radio", { name: /Planned/ }).click();
  await page.getByRole("button", { name: "Add a plan" }).click();
  await page.locator("#dialog-title").waitFor();
  await record("5 plan editor");
  await page.getByLabel("Name").fill("Row House Cinema");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.locator("#dialog-title").waitFor({ state: "detached" });
  await record("6 plan saved");

  // 6. Reload: the plan and the save survive.
  await page.reload();
  await page.getByRole("radio", { name: /Planned/ }).click();
  await page.locator(".row").first().waitFor();
  await record("7 journal after reload");

  // 7. Mark it done.
  await page.getByRole("button", { name: "Went" }).first().click();
  await page.locator("#dialog-title").waitFor();
  await record("8 done editor");
  await page.getByRole("button", { name: "Save to journal" }).click();
  await page.locator("#dialog-title").waitFor({ state: "detached" });
  await page.getByRole("radio", { name: /Done/ }).click();
  await page.locator(".row").first().click();
  await page.locator("#memory-heading").waitFor();
  await record("9 memory");
  await page.getByRole("button", { name: "Journal" }).click();
  await record("10 journal");

  // 8. Settings.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await record("11 settings");

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
