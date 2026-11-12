// SettingsPage — owner: builder C.
//
// Contract: takes no props; reads from useApp() (src/app/AppContext.js):
//   account, journal (library, sync), backup {exportJournal, importFile},
//   ready, canEdit, outings, city, navigate.
// Reached from the Journal header only. Licence credits for the map and
// place data live here because the map carries no info icon.
import React from "react";
import AccountPanel, { syncLabel } from "../AccountPanel";
import { useApp } from "../app/AppContext";
import { count } from "../city/placeText";
import { Button, Row } from "../ui";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { account, journal, backup, ready, canEdit, outings, navigate } = useApp();
  return (
    <div className="settings">
      <Button variant="text" icon="back" className="settings-back" onClick={() => navigate("journal")}>Journal</Button>
      <h1 className="page-title">Settings</h1>

      <h2 className="t-caps section-label">Journal</h2>
      <Row title={syncLabel(account, journal.library.sync)} trail={`${count(outings.length)} records`} />
      {account && <AccountPanel account={account} library={journal.library} onChanged={journal.load} onExport={backup.exportJournal} />}
      <div className="settings-actions">
        <Button variant="quiet" disabled={!ready} onClick={backup.exportJournal}>Export backup</Button>
        <label className={`btn btn-quiet${canEdit ? "" : " is-disabled"}`}>
          Import backup
          <input className="sr-only" type="file" accept="application/json,.json" onChange={backup.importFile} disabled={!canEdit} />
        </label>
      </div>

      <h2 className="t-caps section-label">Privacy</h2>
      <ul className="settings-facts">
        <li>{account?.owner ? "Synced privately to your account" : "Stored in this browser only"}</li>
        <li>Not encrypted on this device</li>
        <li>No analytics, no ads</li>
        <li>Map tiles reveal the area you view</li>
      </ul>

      <h2 className="t-caps section-label">Sources</h2>
      <ul className="settings-facts">
        <li>Places: <a href="https://overturemaps.org" target="_blank" rel="noreferrer">Overture Maps Foundation</a>, CDLA-Permissive-2.0</li>
        <li>Map: <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>, <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a>, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></li>
        <li>Notes: <a href="https://en.wikivoyage.org" target="_blank" rel="noreferrer">Wikivoyage contributors</a>, CC BY-SA 4.0</li>
        <li>Photos: Wikimedia Commons, credited on each photo</li>
      </ul>
    </div>
  );
}
