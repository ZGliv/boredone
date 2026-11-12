import React from "react";
import { Modal } from "../Editor";

export default function ImportDialog({ account, importing, importBusy, storageError, onClose, onExport, onRestore }) {
  return (
    <Modal title="Import backup" onClose={onClose}>
      <p className="t-tab">
        {account?.owner
          ? `${importing.count} records. Different versions are kept as copies.`
          : `${importing.count} records: ${importing.added} new, ${importing.updated} updated.`}
      </p>
      {storageError && <p className="notice error" role="alert">{storageError}</p>}
      <div className="dialog-actions">
        <button className="secondary" onClick={onExport}>Export first</button>
        <button disabled={importBusy} onClick={onRestore}>{importBusy ? "Merging" : "Merge"}</button>
      </div>
    </Modal>
  );
}
