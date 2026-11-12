import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { guestStore } from "./app/guestStore";
import JournalRoot from "./JournalRoot";
import "./styles.css";
import "./world.css";
import "./theme.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready)
    .then(registration => registration.active?.postMessage("warm-guide-photos")).catch(() => {});
}

createRoot(document.getElementById("root")).render(<JournalRoot App={App} guestStore={guestStore}/>);
