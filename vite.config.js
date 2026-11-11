import {accountRemovalHandler} from "./server/account-removal.js";
import { readFileSync } from "node:fs";
import { offlineShellPlugin } from "./server/offline-shell.js";
import { defineConfig } from "vite";
import { offlineAreaHandler } from "./server/offline-area.js";
import { editorialHandler } from "./server/editorial.js";
import { discoveryHandler } from "./server/discovery.js";
const deploymentHeaders = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url))).headers[0].headers;
export default defineConfig({
  // Archived venue HTML in output/ is research material, not application entry points.
  optimizeDeps: { entries: ['index.html'], include: ['@supabase/supabase-js'] },
  preview: { headers: Object.fromEntries(deploymentHeaders.map(({key, value}) => [key, value])) },
  plugins: [
    offlineShellPlugin(),
    {
      name: "discovery-api",
      configurePreviewServer(server) {
        server.middlewares.use("/api/account-removal", (req,res)=>accountRemovalHandler(req,res));
        server.middlewares.use("/api/editorial", (req, res) => editorialHandler(req, res));
        server.middlewares.use("/api/offline-area", (req, res) => offlineAreaHandler(req, res));
        server.middlewares.use("/api/discover", (req, res) => discoveryHandler(req, res));
      },
      configureServer(server) {
        server.middlewares.use("/api/account-removal", (req,res)=>accountRemovalHandler(req,res));
        server.middlewares.use("/api/editorial", (req, res) => editorialHandler(req, res));
        server.middlewares.use("/api/offline-area", (req, res) => offlineAreaHandler(req, res));
        server.middlewares.use("/api/discover", (req, res) =>
          discoveryHandler(req, res),
        );
      },
    },
  ],
});
