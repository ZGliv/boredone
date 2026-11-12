import React, { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "../Editor";
import { memoryOptions } from "../memoryFilters";
import useCityData from "../city/useCityData";
import MapPage from "../pages/MapPage";
import PilePage from "../pages/PilePage";
import BoardPage from "../pages/BoardPage";
import JournalPage from "../pages/JournalPage";
import SettingsPage from "../pages/SettingsPage";
import { ToastProvider, useToast } from "../ui";
import { AppContext } from "./AppContext";
import ImportDialog from "./ImportDialog";
import TabBar from "./TabBar";
import { guestStore } from "./guestStore";
import { pageFromHash } from "./routes";
import { sortMemories, sortPlans } from "./outings";
import useJournal from "./useJournal";
import useOutingActions from "./useOutingActions";
import useBackup from "./useBackup";
import "./shell.css";

const PAGES = { map: MapPage, pile: PilePage, board: BoardPage, journal: JournalPage, settings: SettingsPage };

export default function App(props) {
  return <ToastProvider><Shell {...props} /></ToastProvider>;
}

function Shell({ store = guestStore, account = null, accountError = "" }) {
  const toast = useToast();
  const journal = useJournal(store, account);
  const { library, ready, canEdit, drafts, storageError, setStorageError, load } = journal;
  const outings = library.outings;
  const city = useCityData(outings);
  const [page, setPage] = useState(pageFromHash);
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    const sync = () => setPage(pageFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const navigate = useCallback((next) => {
    if (location.hash !== `#${next}`) location.hash = next;
    setPage(next);
    window.scrollTo(0, 0);
  }, []);
  const actions = useOutingActions({ journal, account, setEditor, toast, navigate });
  const backup = useBackup({ store, account, journal, setMessage: toast });
  const saves = useMemo(() => outings.filter((o) => o.status === "saved").sort((a, b) => (b.source?.savedAt || b.createdAt).localeCompare(a.source?.savedAt || a.createdAt)), [outings]);
  const plans = useMemo(() => sortPlans(outings), [outings]);
  const done = useMemo(() => sortMemories(outings), [outings]);
  const value = {
    page, navigate,
    cities: city.cities, cityId: city.cityId, setCityId: city.setCityId, city: city.city,
    cityStatus: city.status, cityError: city.error, retryCity: city.retry,
    places: city.places, placeById: city.placeById, states: city.states, board: city.board, progress: city.progress,
    outings, saves, plans, done, ready, canEdit, drafts,
    actions: { put: actions.put, remove: actions.remove, addPlan: actions.addPlan, saveVisit: actions.saveVisit, visit: actions.visit, edit: actions.edit, manual: actions.manual, openEditor: setEditor },
    toast, account, backup, store, journal,
  };
  const Page = PAGES[page];
  return (
    <AppContext.Provider value={value}>
      <div className={`shell shell-${page}`}>
        {(accountError || storageError) && (
          <div className="shell-alert" role="alert">
            <span>{accountError || storageError}</span>
            {storageError && <button type="button" onClick={() => { setStorageError(""); load(); }}>Reload</button>}
          </div>
        )}
        <main className="page" id="main"><Page /></main>
        <TabBar page={page} navigate={navigate} />
      </div>
      {editor && (
        <Editor key={editor.outing.id} draftStore={store} validate={store.validateOuting} preserveDate={!!account?.owner} syncEnabled={!!account?.owner}
          {...editor} onClose={() => setEditor(null)} onSave={actions.saveOuting} draftsEnabled onDraftsChanged={journal.refreshDrafts}
          people={memoryOptions(outings).people} />
      )}
      {backup.importing && <ImportDialog account={account} importing={backup.importing} importBusy={backup.importBusy} storageError={storageError} onClose={() => !backup.importBusy && backup.setImporting(null)} onExport={backup.exportJournal} onRestore={backup.restore} />}
    </AppContext.Provider>
  );
}
