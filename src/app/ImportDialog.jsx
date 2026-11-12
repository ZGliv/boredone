import React from "react";
import { Button, Sheet } from "../ui";

export default function ImportDialog({ account, importing, importBusy, storageError, onClose, onExport, onRestore }) {
  return (
    <Sheet title="Import backup" onClose={importBusy ? () => {} : onClose} className="import-sheet">
      <p className="import-facts t-tab">
        {account?.owner
          ? `${importing.count} to merge`
          : `${importing.added} new · ${importing.updated} updated`}
      </p>
      {storageError && <p className="page-status" role="alert">{storageError}</p>}
      <div className="confirm-actions">
        <Button variant="quiet" onClick={onExport}>Export first</Button>
        <Button variant="primary" disabled={importBusy} onClick={onRestore}>{importBusy ? "Merging" : "Merge"}</Button>
      </div>
    </Sheet>
  );
}
