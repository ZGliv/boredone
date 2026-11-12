import { useState } from "react";
import { mergeOutings } from "../model";
import { download } from "./routes";

// Exporting the journal to a JSON file and merging one back in.
export default function useBackup({ store, account, journal, setMessage }) {
  const { library, libraryRef, demoMode, commit, load, setStorageError } = journal;
  const [importing, setImporting] = useState(null),
    [importBusy, setImportBusy] = useState(false);
  async function exportJournal() {
    if (demoMode) { setMessage("Leave the demo to export your real journal."); return; }
    try {
      download(store.backup(library),store.backupLimit);
      setMessage(
        "Backup download started. Keep it somewhere private; it includes your photos and notes.",
      );
    } catch (e) {
      setStorageError(e.message);
    }
  }
  async function importFile(event) {
    if (demoMode) { event.target.value = ""; setMessage("Leave the demo to import into your real journal."); return; }
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > store.backupLimit)
        throw new Error(`Choose a backup smaller than ${store.backupLimit/1024/1024} MB.`);
      const incoming = store.validateBackup(JSON.parse(await file.text()));
      if(account?.owner){setImporting({incoming,count:incoming.length});return;}
      const preview = mergeOutings(libraryRef.current.outings, incoming);
      setImporting({
        incoming,
        added: preview.added,
        updated: preview.updated,
        count: incoming.length,
      });
    } catch (e) {
      setStorageError(
        e instanceof SyntaxError
          ? "This is not a readable JSON backup. Your journal has not changed."
          : e.message,
      );
    }
  }
  async function restore() {
    setImportBusy(true);
    try {
      if(account?.owner){
        const result=await store.importLegacy(importing.incoming,libraryRef.current.revision);
        await load();setImporting(null);setStorageError('');setMessage(`Imported ${result.imported.added} outings. Different versions were kept as copies.`);return;
      }
      const merged = mergeOutings(
        libraryRef.current.outings,
        importing.incoming,
      );
      await commit(merged.outings);
      setImporting(null);
      setStorageError("");
      setMessage(
        `Backup merged: ${merged.added} added, ${merged.updated} updated. Existing newer outings were kept.`,
      );
    } catch (e) {
      setStorageError(e.message);
    } finally {
      setImportBusy(false);
    }
  }
  return { importing, setImporting, importBusy, exportJournal, importFile, restore };
}
