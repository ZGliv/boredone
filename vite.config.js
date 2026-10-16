import { defineConfig } from "vite";
import { discoveryHandler } from "./server/discovery.js";
export default defineConfig({
  plugins: [
    {
      name: "discovery-api",
      configureServer(server) {
        server.middlewares.use("/api/discover", (req, res) =>
          discoveryHandler(req, res),
        );
      },
    },
  ],
});
