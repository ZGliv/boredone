import React, { useEffect, useRef, useState } from "react";
import MemoriesPage, { MemoryDetail } from "../pages/MemoriesPage";
import { memoryOptions } from "../memoryFilters";
import Editor from "../Editor";
import FindPage from "../pages/FindPage";
import PlansPage from "../pages/PlansPage";
import SettingsPage from "../pages/SettingsPage";
import { blankLibrary } from "../model";
import useTheme from "../useTheme";
import AppHeader from "./AppHeader";
import DraftRecovery from "./DraftRecovery";
import ImportDialog from "./ImportDialog";
import { guestStore } from "./guestStore";
import { pageFromHash } from "./routes";
import { sortMemories, sortPlans } from "./outings";
import useIconStyle from "./useIconStyle";
import useJournal from "./useJournal";
import useDiscovery from "./useDiscovery";
import useOutingActions from "./useOutingActions";
import useBackup from "./useBackup";

export default function App({store=guestStore,account=null,accountError=""}) {
  const [theme,toggleTheme]=useTheme();
  const [iconStyle, setIconStyle] = useIconStyle();
  const journal = useJournal(store, account);
  const { library, demoMode, canEdit, ready, drafts, storageError, setStorageError, load } = journal;
  const discovery = useDiscovery(demoMode);
  const { setSelected } = discovery;
  const [page, setPage] = useState(pageFromHash),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState(null),
    [query, setQuery] = useState(""),
    [memoryDetail, setMemoryDetail] = useState(null);
  useEffect(() => { if (memoryDetail) document.getElementById("memory-heading")?.focus(); }, [memoryDetail]);
  const memoryScroll = useRef(0),
    noticeRef = useRef(null);
  function openMemory(outing) { memoryScroll.current = window.scrollY; setMemoryDetail(outing); window.scrollTo(0,0); }
  function closeMemory() { setMemoryDetail(null); requestAnimationFrame(() => window.scrollTo(0,memoryScroll.current)); }
  useEffect(() => {
    const handler = () => {const next=pageFromHash();setPage(next);if(next!=="memories")setMemoryDetail(null);setSelected(null);setQuery("");};
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  function navigate(next) {
    location.hash = next;
    setPage(next);
    setQuery("");
    setSelected(null);
    setMemoryDetail(null);
    window.scrollTo(0, 0);
  }
  function showMemory(memory) { navigate("memories"); setMemoryDetail(memory); }
  const actions = useOutingActions({ journal, account, page, navigate, setEditor, setMemoryDetail, setSelected, setMessage });
  const backup = useBackup({ store, account, journal, setMessage });
  function enterDemo() {
    discovery.enterDemoArea();
    journal.setDemoLibrary(blankLibrary());
    journal.setDemoMode(true);
    setMessage("");
    navigate("find");
  }
  function leaveDemo() {
    journal.setDemoMode(false);
    journal.setDemoLibrary(blankLibrary());
    discovery.leaveDemoArea();
    setMessage("");
    navigate("find");
  }
  const plans = sortPlans(library.outings);
  const memories = sortMemories(library.outings);
  return (
    <>
      <AppHeader page={page} plans={plans} memories={memories} drafts={drafts} theme={theme} toggleTheme={toggleTheme} navigate={navigate}/>
      <main className={`main-shell ${page === "find" ? "world-main" : ""}`}>
        {demoMode && page !== "find" && <div className="demo-banner" role="status"><div><strong>You’re exploring a sample day.</strong><span>Fictional places. Plans and memories stay in this demo only and disappear when you leave or reload.</span></div><button className="secondary" onClick={leaveDemo}>Leave demo</button></div>}
        {accountError&&<p className="notice error" role="alert">{accountError}</p>}
        {storageError && (
          <div className="notice error" role="alert">
            {storageError}
            <button
              className="text-button"
              onClick={() => {
                setStorageError("");
                load();
              }}
            >
              Reload journal
            </button>
          </div>
        )}
        {message && (
          <div className="notice success" role="status" ref={noticeRef}>
            {message}
          </div>
        )}
        {page !== 'find' && !demoMode && !memoryDetail && <DraftRecovery store={store} drafts={drafts} draftError={journal.draftError} setDraftError={journal.setDraftError} refreshDrafts={journal.refreshDrafts} canEdit={canEdit} setEditor={setEditor}/>}
        {page === "find" && <FindPage theme={theme} discovery={discovery} library={library} canEdit={canEdit} demoMode={demoMode} plans={plans} memories={memories} actions={actions} navigate={navigate} onDemo={enterDemo} onLeaveDemo={leaveDemo} openMemoryFromFind={showMemory}/>}
        {page === "memories" && <MemoriesPage memories={memories} canEdit={canEdit} memoryDetail={memoryDetail} actions={actions} openMemory={openMemory}/>}
        {page === "plans" && !memoryDetail && <PlansPage plans={plans} query={query} setQuery={setQuery} canEdit={canEdit} navigate={navigate} actions={actions} setEditor={setEditor}/>}
        {page === "settings" && <SettingsPage account={account} library={library} plans={plans} memories={memories} ready={ready} demoMode={demoMode} canEdit={canEdit} navigate={navigate} actions={actions} openMemoryFromJournal={showMemory} load={load} backup={backup} setMessage={setMessage} iconStyle={iconStyle} setIconStyle={setIconStyle} discovery={discovery}/>}
      {memoryDetail && <MemoryDetail memoryDetail={memoryDetail} canEdit={canEdit} actions={actions} setEditor={setEditor} setMemoryDetail={setMemoryDetail} closeMemory={closeMemory}/>}
        <footer className="app-footer">
          <span>boredone</span>
          <button className="text-button" onClick={() => navigate("settings")}>
            Backup & privacy
          </button>
        </footer>
      </main>

      {editor && (
        <Editor
          key={editor.outing.id}
          draftStore={store}
          validate={store.validateOuting}
          preserveDate={!!account?.owner}
          syncEnabled={!!account?.owner}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={actions.saveOuting}
          draftsEnabled={!demoMode}
          onDraftsChanged={journal.refreshDrafts}
          people={memoryOptions(library.outings).people}
        />
      )}
      {backup.importing && <ImportDialog account={account} importing={backup.importing} importBusy={backup.importBusy} storageError={storageError} onClose={() => !backup.importBusy && backup.setImporting(null)} onExport={backup.exportJournal} onRestore={backup.restore}/>}
    </>
  );
}
