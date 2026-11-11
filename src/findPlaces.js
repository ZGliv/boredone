// A user-requested search also saves a bounded neighborhood guide. It never
// downloads areas in the background or in response to map movement.
export async function findPlaces(params, {
  signal, fetcher = fetch, onPhase = () => {}, areaOnly = false,
  liveTimeoutMs = 5000, areaTimeoutMs = 20000,
} = {}) {
  const query = new URLSearchParams(params);
  async function request(endpoint, timeoutMs) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timer, onAbort;
    const stopped = new Promise((_, reject) => {
      onAbort = () => { controller.abort(signal.reason); reject(signal.reason); };
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        const error = new DOMException("Search timed out", "TimeoutError");
        controller.abort(error); reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([stopped, (async () => {
        const response = await fetcher(`/api/${endpoint}?${query}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Places are temporarily unavailable.");
        return validatePlaces(data);
      })()]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  if (!areaOnly) {
    onPhase("Checking nearby places…");
    try { return await request("discover", liveTimeoutMs); }
    catch { signal?.throwIfAborted(); }
  }
  onPhase("Saving your neighborhood guide…");
  try {
    const data = await request("offline-area", areaTimeoutMs);
    return { ...data, discoveryFallback: !areaOnly };
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(error.name === "TimeoutError"
      ? "The neighborhood guide took too long to download. Your saved places are still here. Try a smaller radius or try again."
      : "We couldn’t update this area just now. Your saved places are still here. Check your connection, try again, or add your own idea.");
  }
}

// Editorial text is optional; a stalled source must not hold the usable guide open.
export async function findEditorial(params, {signal, fetcher = fetch, timeoutMs = 8000} = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timer, onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => { controller.abort(signal.reason); reject(signal.reason); };
    signal?.addEventListener('abort', onAbort, {once:true});
    timer = setTimeout(() => {
      const error = new DOMException('Guide enrichment timed out', 'TimeoutError');
      controller.abort(error); reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetcher(`/api/editorial?${new URLSearchParams(params)}`, {signal:controller.signal});
      if (!response.ok) throw new Error('Guide enrichment unavailable');
      const data = await response.json();
      validatePlaces(data);
      return data;
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function validatePlaces(data) {
  if (!data || !Array.isArray(data.places) || data.places.length > 1500 || data.places.some(p =>
    !p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name ||
    typeof p.category !== 'string' || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 ||
    !Number.isFinite(p.lng) || Math.abs(p.lng) > 180
  )) throw new Error('The place source returned an unreadable guide. Try again.');
  return data;
}
