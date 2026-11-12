import { useState } from "react";
import { mergeOutings } from "../model";
import { download } from "./routes";

// Exporting the journal to a JSON file and merging one back in.
export default function useBackup({ store, account, journal, setMessage }) {
  const { library, libraryRef, commit, load, setStorageError } = journal;
  const [importing, setImporting] = useState(null),
    [importBusy, setImportBusy] = useState(false);
  async function exportJournal() {
    try {
      download(store.backup(library),store.backupLimit);
      setMessage("Backup downloaded");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  async function importFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > store.backupLimit)
        throw new Error(`Backup is over ${store.backupLimit/1024/1024} MB.`);
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
          ? "Not a Boredone backup. Nothing changed."
          : e.message,
      );
    }
  }
  async function restore() {
    setImportBusy(true);
    try {
      if(account?.owner){
        const result=await store.importLegacy(importing.incoming,libraryRef.current.revision);
        await load();setImporting(null);setStorageError('');setMessage(`Imported ${result.imported.added}`);return;
      }
      const merged = mergeOutings(
        libraryRef.current.outings,
        importing.incoming,
      );
      await commit(merged.outings);
      setImporting(null);
      setStorageError("");
      setMessage(`Merged: ${merged.added} new, ${merged.updated} updated`);
    } catch (e) {
      setStorageError(e.message);
    } finally {
      setImportBusy(false);
    }
  }
  return { importing, setImporting, importBusy, exportJournal, importFile, restore };
}
