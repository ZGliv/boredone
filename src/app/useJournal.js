import { useEffect, useRef, useState } from "react";
import { blankLibrary } from "../model";

// The saved (or demo) journal, its drafts, and keeping both fresh across tabs.
export default function useJournal(store, account) {
  const [drafts,setDrafts]=useState([]),[draftError,setDraftError]=useState('');
  async function refreshDrafts(){try{setDrafts(await store.readDrafts());setDraftError('');}catch(e){setDraftError(e.message);}}
  const [savedLibrary, setSavedLibrary] = useState(blankLibrary),
    [demoLibrary, setDemoLibrary] = useState(blankLibrary),
    [demoMode, setDemoMode] = useState(false),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const library = demoMode ? demoLibrary : savedLibrary;
  const canEdit = (ready || demoMode) && !account?.removal;
  const setLibrary = demoMode ? setDemoLibrary : setSavedLibrary;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  async function load() {
    try {
      const data = await store.read();
      setSavedLibrary(previous=>data.revision>=previous.revision?data:previous);
      setReady(true);
      setStorageError("");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  useEffect(() => {
    load();refreshDrafts();
    let channel;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(store.channelName);
        channel.onmessage = () => {load();refreshDrafts();};
      }
    } catch { /* Storage still works when cross-tab messaging is restricted. */ }
    const refresh = () => { if (document.visibilityState === "visible") {load();refreshDrafts();} };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      try { channel?.close(); } catch {}
    };
  }, []);
  useEffect(()=>{if(account?.refresh){load();refreshDrafts();}},[account?.refresh]);
  async function commit(outings, draftId, draftStamp) {
    const next = demoMode
      ? { ...libraryRef.current, outings, revision: libraryRef.current.revision + 1 }
      : await store.save(outings, libraryRef.current.revision, {draftId,draftStamp});
    setLibrary(next);
    libraryRef.current = next;
    return next;
  }
  return {
    drafts, draftError, setDraftError, refreshDrafts,
    library, libraryRef, setDemoLibrary, demoMode, setDemoMode,
    ready, canEdit, storageError, setStorageError, load, commit,
  };
}
