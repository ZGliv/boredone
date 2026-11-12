import { useCallback, useEffect, useState } from "react";
import { hashTarget, pageFromHash } from "./routes";

// The id after "#<page>/", for a page that opens one thing when linked to.
// clear() takes it out of the address once the page has acted on it, so going
// back or reloading does not open it again.
export default function useHashTarget(page) {
  const read = () => (pageFromHash() === page ? hashTarget() : "");
  const [target, setTarget] = useState(read);
  useEffect(() => {
    const sync = () => setTarget(read());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [page]);
  const clear = useCallback(() => {
    setTarget("");
    if (hashTarget()) history.replaceState(history.state, "", `#${page}`);
  }, [page]);
  return [target, clear];
}
