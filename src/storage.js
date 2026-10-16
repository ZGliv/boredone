import {
  blankLibrary,
  validateOuting,
  VERSION,
  MAX_OUTINGS,
  MAX_BACKUP_BYTES,
  backupPayload,
} from "./model";
let dbPromise;
function openDb() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          new Error(
            "This browser cannot store outings. Try a regular browser window with storage enabled.",
          ),
        );
        return;
      }
      const req = indexedDB.open("boredone-private-journal", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("library");
      req.onerror = () =>
        reject(
          new Error(
            "Could not open your journal. Your browser may have storage disabled.",
          ),
        );
      req.onblocked = () =>
        reject(
          new Error(
            "Close other Boredone tabs and reload to open your journal.",
          ),
        );
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
    });
  return dbPromise;
}
export async function readLibrary() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("library", "readonly"),
      req = tx.objectStore("library").get("current");
    req.onsuccess = () => {
      const data = req.result;
      if (!data) return resolve(blankLibrary());
      try {
        if (
          data.version !== VERSION ||
          !Array.isArray(data.outings) ||
          data.outings.length > MAX_OUTINGS ||
          !Number.isInteger(data.revision)
        )
          throw new Error();
        data.outings.forEach(validateOuting);
        resolve(data);
      } catch {
        reject(
          new Error(
            "The saved journal could not be read. It has not been changed. Restore a valid backup in a fresh browser or contact the project owner.",
          ),
        );
      }
    };
    req.onerror = () => reject(new Error("Could not read your saved outings."));
  });
}
export async function writeLibrary(outings, revision) {
  if (outings.length > MAX_OUTINGS)
    throw new Error(
      "Your journal supports 500 outings. Export before making space.",
    );
  outings.forEach(validateOuting);
  if (
    new Blob([JSON.stringify(backupPayload({ outings }), null, 2)]).size >
    MAX_BACKUP_BYTES
  )
    throw new Error(
      "This change would make your journal larger than 50 MB. Export a backup, then remove some photos before adding more. Nothing was changed.",
    );
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("library", "readwrite"),
      store = tx.objectStore("library"),
      req = store.get("current");
    let next;
    let conflict = false;
    let writeError;
    req.onsuccess = () => {
      if ((req.result?.revision || 0) !== revision) {
        conflict = true;
        tx.abort();
        return;
      }
      next = { version: VERSION, revision: revision + 1, outings };
      try {
        store.put(next, "current");
      } catch (e) {
        writeError = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      if (typeof BroadcastChannel !== "undefined") {
        const c = new BroadcastChannel("boredone-journal");
        c.postMessage("changed");
        c.close();
      }
      resolve(next);
    };
    tx.onabort = () =>
      reject(
        new Error(
          conflict
            ? "Your journal changed in another tab. Reload the latest version before saving."
            : (writeError || tx.error)?.name === "QuotaExceededError"
              ? "Your browser is out of space. This change was not saved. Remove a photo or export your journal before making room."
              : "Your browser could not save this change. Your previous journal is intact.",
        ),
      );
    tx.onerror = () => {};
  });
}
export async function resizePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose JPEG, PNG or WebP photos. HEIC and videos are not supported yet.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("This image could not be opened. Try another photo."));
      img.src = url;
    });
    if (
      !image.naturalWidth ||
      image.naturalWidth * image.naturalHeight > 80000000
    )
      throw new Error("This photo is too large to process safely.");
    const ratio = Math.min(
        1,
        1600 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot prepare photos.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.78);
    if (data.length > 1400000) data = canvas.toDataURL("image/jpeg", 0.55);
    if (data.length > 1400000)
      throw new Error("This photo is still too large. Crop it and try again.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
