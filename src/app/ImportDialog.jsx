import React from "react";
import { Modal } from "../Editor";

export default function ImportDialog({ account, importing, importBusy, storageError, onClose, onExport, onRestore }) {
  return (
        <Modal
          title="Bring your journal back"
          onClose={onClose}
        >
          {account?.owner?<p>This backup contains {importing.count} outings. Matching saves are skipped. Different versions are kept as separate copies; existing memories stay intact.</p>:<p>
            This backup contains {importing.count} outings. It will add{" "}
            {importing.added} and update {importing.updated} older versions.
            Your other outings and newer edits will stay.
          </p>}
          <p>
            Back up your current journal first if you want to preserve both
            versions of an edited outing.
          </p>
          {storageError && (
            <p className="notice error" role="alert">
              {storageError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="secondary" onClick={onExport}>
              Export current journal
            </button>
            <button disabled={importBusy} onClick={onRestore}>
              {importBusy ? "Merging…" : "Merge backup"}
            </button>
          </div>
        </Modal>
  );
}
