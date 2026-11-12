import { createContext, useContext } from "react";

// Everything a screen needs, from one hook: const app = useApp().
//
// Navigation
//   page                  "map" | "pile" | "board" | "journal" | "settings"
//   navigate(page)        change tab/page (also updates the URL hash)
// City (one set of places everywhere; see src/city/cityPlaces.js)
//   cities                [{id, name}] packs that exist
//   cityId, setCityId(id) current pack; remembered on this device
//   city                  {id, name, center:{lat,lng}, radiusKm, builtAt, source, licences}
//   cityStatus            "loading" | "ready" | "error"; cityError; retryCity()
//   places                the city's places [{id, name, lat, lng, category, kind,
//                         neighborhood, address, website, recommendation?, photo?}]
//   placeById             Map id -> place
//   states                Map id -> "done" | "planned" | "saved"
//   board                 cityBoard board (null while loading)
//   progress              boardProgress(board, outings) (null while loading)
// Journal (private, on this device unless signed in)
//   outings               every record
//   saves                 status "saved", newest first (the Pile)
//   plans                 status "planned", soonest first
//   done                  status "visited", newest first (memories)
//   ready, canEdit        journal loaded / writable
//   actions               {put, remove, addPlan, saveVisit, visit, edit, manual,
//                         openEditor({outing, isNew, recovery}) for drafts}
//                         (src/app/useOutingActions.js)
//   toast(text, {action}) one-line confirmation at the top of the screen
//   confirm(title, {action}) a sheet asking yes/no; resolves true on the action
// Settings plumbing: account, backup, store, journal, drafts
export const AppContext = createContext(null);
export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp() needs <App>.");
  return app;
}
