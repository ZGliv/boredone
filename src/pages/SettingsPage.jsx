import React from "react";
import AccountPanel, { syncLabel } from "../AccountPanel";
import { placeIcon } from "../exploration";
import { clearDiscoveryCache } from "../discoveryCache";
import { bundledArea } from "../preloaded";
import { displayDate } from "../model";

// "Your journal": counts, recent memories, backup, appearance and privacy.
export default function SettingsPage({ account, library, plans, memories, ready, demoMode, canEdit, navigate, actions, openMemoryFromJournal, load, backup, setMessage, iconStyle, setIconStyle, discovery }) {
  const { exportJournal, importFile } = backup;
  return <>
          <section className="collection-intro"><div><h1>Your journal</h1><p>{syncLabel(account,library.sync)}.</p></div><button onClick={() => actions.manual(true)} disabled={!canEdit}>+ Add a memory</button></section>
          <div className="journal-counts"><button onClick={() => navigate("plans")}><strong>{plans.length}</strong><span>Plans ↗</span></button><button onClick={() => navigate("memories")}><strong>{memories.length}</strong><span>Memories ↗</span></button><div><strong>{new Set(memories.map(outing => outing.place.id)).size}</strong><span>Places visited</span></div></div>
          <div className="journal-layout"><section className="journal-recent"><h2>Recently remembered</h2>
            {memories.length ? memories.slice(0, 4).map(outing => <button className="journal-entry" key={outing.id} onClick={() => openMemoryFromJournal(outing)}>{outing.photos[0] ? <img src={outing.photos[0]} alt=""/> : <span className={`landmark-sprite landmark-${placeIcon(outing.place.category)}`} aria-hidden="true"/>}<span><strong>{outing.place.name}</strong><small>{displayDate(outing.visitDate)}</small>{outing.notes && <span className="journal-excerpt">{outing.notes}</span>}</span><span aria-hidden="true">↗</span></button>) : <div className="journal-empty"><p>Your memories will collect here.</p><button className="secondary" onClick={() => navigate("find")}>Find an outing</button></div>}
          </section><aside className="journal-tools">{account&&<AccountPanel account={account} library={library} onChanged={load} onExport={exportJournal}/>}<section className="settings-card"><h2>Keep a copy</h2><p>{account?.owner?"Export a private copy of the visits and photos on this device.":"No cloud sync. Export a backup to keep your photos and notes safe."}</p><div className="button-row"><button disabled={!ready&&!demoMode} onClick={exportJournal}>Export your journal</button><label className={`button secondary file-button ${!canEdit ? "disabled" : ""}`}>Import a backup<input type="file" accept="application/json,.json" aria-label="Import a backup" onChange={importFile} disabled={!canEdit}/></label></div><details className="quiet-details"><summary>Backup help</summary><p>Clearing browser data or losing this device can remove your journal. {account?.owner?"Imports keep different versions as separate copies.":"Imports merge by outing ID, keeping the newer edit."} The JSON includes photos and notes; keep it private. Up to 500 outings{account?.owner?"; 50 MB of unique photos, 80 MB per backup":" and 50 MB"}. Finish unfinished outings before exporting; drafts stay on this device.</p><button className="text-button" onClick={async () => {try {const granted = await navigator.storage?.persist?.();setMessage(granted ? "Persistent storage enabled." : "Keep regular backups; persistent storage was not granted.");} catch {setMessage("Persistent storage unavailable. Keep regular backups.");}}}>Ask browser to keep this journal</button></details></section>
          <section className="settings-card"><h2>Map icons</h2><div className="icon-choices" aria-label="Map icon style">{[["line","Line"],["solid","Solid"]].map(([value,label]) => <button key={value} aria-pressed={iconStyle === value} onClick={() => setIconStyle(value)}><span className={`icon-preview icon-preview-${value}`} aria-hidden="true">{["garden","cafe","gallery","play"].map(kind => <span key={kind} className={`landmark-sprite landmark-${kind}`}/>)}</span>{label}</button>)}</div></section>
          </aside></div>
              <details className="quiet-details privacy-details">
                <summary>Privacy, offline storage & data sources</summary>
                <p>
                  {account?.owner?"Visits, companions and photos saved in your account are uploaded privately to Supabase for syncing. Your Google account is used only for sign-in. Device saves are uploaded only when you choose to copy them.":"Your notes, companions and photos in this device journal are never uploaded by Boredone."} Photos are resized locally and embedded metadata is
                  removed before saving. Anyone with access to this browser
                  profile can read the journal.
                </p>
                <p>
                  Searching places sends only an approximate search center,
                  radius and category to our server, then to{" "}
                  <a
                    href="https://overpass.private.coffee/#privacy-policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Private.coffee
                  </a>{" "}
                  or its fallback,{" "}
                  <a
                    href="https://maps.mail.ru/osm/tools/overpass/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    VK Maps
                  </a>
                  . The results name the provider used. No journal content is
                  sent to either service. The illustrated map loads vector tiles from{" "}
                  <a
                    href="https://openfreemap.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenFreeMap
                  </a>
                  ; tile requests reveal the viewed area and your IP address.
                  Use “Hide map” to stop loading tiles.
                </p>
                <p>Editorial descriptions come from Wikivoyage contributors (CC BY-SA 4.0). Licensed Commons photos include author credits and work offline. Venue website previews load directly from the linked website or its image host, which receives your IP address; Boredone sends no referrer. These online images are not bundled for offline use or treated as openly licensed photos. Venue services never receive your saved notes or personal photos.</p>
                <p>Up to 12 recent place searches are kept in this browser with their original retrieval dates: live searches for 24 hours, explicitly saved map areas for 30 days. This public directory cache is separate from your journal and lets you keep exploring during an outage. After a successful online visit in a supported browser, the production app also caches its public files so you can reopen offline. Map tiles and live searches still require internet; browser storage may be evicted.</p>
                <button className="secondary" onClick={() => { clearDiscoveryCache(); discovery.setResult(bundledArea(discovery.city, discovery.radius)); setMessage("Saved place searches cleared. Your journal is unchanged."); }}>Clear saved place searches</button>
                <p>
                  City lookup uses a bundled{" "}
                  <a
                    href="https://www.geonames.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GeoNames
                  </a>{" "}
                  directory under{" "}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY 4.0
                  </a>
                  . No external city-search API is called.
                </p>
                <p className="hint">
                  Local journal storage is not encrypted. Boredone has no
                  analytics or advertising trackers.
                </p>
              </details>
  </>;
}
