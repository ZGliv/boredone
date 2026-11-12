// SettingsPage — owner: builder C.
//
// Contract: takes no props; reads from useApp() (src/app/AppContext.js):
//   account, journal (library, sync), backup {exportJournal, importFile},
//   ready, canEdit, outings, city, navigate.
// Reached from the Journal header only. Licence credits for the map and
// place data live here because the map carries no info icon.
import React, { useState } from "react";
import AccountPanel, { syncLabel } from "../AccountPanel";
import { useApp } from "../app/AppContext";
import { count } from "../city/placeText";
import { Button } from "../ui";
import { version } from "../../package.json";
import "./SettingsPage.css";

// "Text (https://x)" -> text with the URL as a link.
function Licence({ text }) {
  const parts = text.split(/\s*\((https:\/\/[^)\s]+)\)/);
  return <li>{parts.map((part, i) => (i % 2 ? <React.Fragment key={i}> <a href={part} target="_blank" rel="noreferrer">{new URL(part).hostname.replace(/^www\./, "")}</a></React.Fragment> : part))}</li>;
}

export default function SettingsPage() {
  const { account, journal, backup, ready, canEdit, outings, city, navigate, store, drafts, toast, confirm } = useApp();
  const [erasing, setErasing] = useState(false);
  const owner = !!account?.owner;

  async function eraseDevice() {
    if (!(await confirm(`Delete ${count(outings.length)} ${outings.length === 1 ? "record" : "records"} and photos?`, { action: "Delete all" }))) return;
    setErasing(true);
    try {
      await journal.commit([]);
      for (const draft of drafts) await store.deleteDraft(draft.id, draft.savedAt);
      await journal.refreshDrafts();
      toast("Deleted");
    } catch (e) {
      journal.setStorageError(e.message);
    } finally {
      setErasing(false);
    }
  }

  return (
    <div className="settings">
      <Button variant="text" icon="back" className="settings-back" onClick={() => navigate("journal")}>Journal</Button>
      <h1 className="page-title">Settings</h1>

      <h2 className="t-caps section-label">Journal</h2>
      <dl className="settings-facts">
        <div><dt>{syncLabel(account, journal.library.sync)}</dt><dd className="t-tab">{count(outings.length)} {outings.length === 1 ? "record" : "records"}</dd></div>
      </dl>
      <div className="settings-actions">
        <Button variant="quiet" disabled={!ready || !outings.length} onClick={backup.exportJournal}>Export backup</Button>
        <label className={`btn btn-quiet${canEdit ? "" : " is-disabled"}`}>
          Import backup
          <input className="sr-only" type="file" accept="application/json,.json" onChange={backup.importFile} disabled={!canEdit} />
        </label>
      </div>

      {account && <AccountPanel account={account} library={journal.library} onChanged={journal.load} onExport={backup.exportJournal} />}

      <h2 className="t-caps section-label">Privacy</h2>
      <ul className="settings-list">
        <li>No analytics, no ads</li>
        <li>Map tiles reveal the area you view</li>
      </ul>
      {!owner && (
        <div className="settings-actions">
          <Button variant="quiet" className="settings-erase" disabled={!canEdit || erasing || (!outings.length && !drafts.length)} onClick={eraseDevice}>
            {erasing ? "Deleting" : "Delete everything"}
          </Button>
        </div>
      )}

      <h2 className="t-caps section-label">Sources</h2>
      <ul className="settings-list settings-sources">
        {(city.licences || []).map((text) => <Licence key={text} text={text} />)}
        <li>Map: OpenFreeMap, OpenMapTiles, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</li>
        <li>Notes: Wikivoyage contributors, CC BY-SA 4.0</li>
        <li>Photos: Wikimedia Commons contributors</li>
      </ul>

      <p className="settings-version t-tab">Boredone {version}{city.builtAt ? ` · ${city.name} places ${city.builtAt.slice(0, 10)}` : ""}</p>
    </div>
  );
}
