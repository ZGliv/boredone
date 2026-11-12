import { localDate, makeOuting } from "../model";
import { manualOuting } from "./outings";

// Writing the journal: saves, plans and memories. Recreated each render so
// every handler sees the current library.
//   put(outing)        insert or replace one record (saves, attaching a place, ...)
//   remove(outing)     delete after a confirm sheet; resolves true when removed
//   addPlan(place)     open the editor on a new (or the existing) plan
//   saveVisit(place)   open the editor on a new memory dated today
//   visit(outing)      open the editor turning a plan or save into a memory
//   edit(outing)       open the editor on an existing plan or memory
//   manual(memory)     open the editor on a blank plan or memory
//   saveOuting(...)    the editor's own save; not for screens
// "Delete Gooski's", or "Delete this note" for a save with no place: a
// caption never becomes the sentence.
export function deleteTitle(outing) {
  if (outing?.place?.name) return `Delete ${outing.place.name}`;
  return outing?.source?.url ? "Delete this link" : "Delete this note";
}

export default function useOutingActions({ journal, account, setEditor, toast, confirm, navigate }) {
  const { library, libraryRef, commit, setStorageError } = journal;
  async function saveOuting(outing, originalStamp, isNew, draftId, draftStamp) {
    const current = libraryRef.current.outings,
      existing = current.find((x) => x.id === outing.id);
    if (isNew && existing) throw new Error("Saved in another tab");
    if (!isNew && !existing) throw new Error("Deleted in another tab");
    if (!isNew && existing.updatedAt !== originalStamp) throw new Error("Changed in another tab");
    if (isNew && outing.status === "planned" && current.some((x) => x.status === "planned" && x.place?.id === outing.place?.id))
      throw new Error("Already planned");
    await commit(existing ? current.map((o) => (o.id === outing.id ? outing : o)) : [outing, ...current], draftId, draftStamp);
    setEditor(null);
    toast(outing.status === "visited" ? "Saved to journal" : "Planned");
    if (outing.status === "visited") navigate("journal");
  }
  async function put(outing) {
    const current = libraryRef.current.outings;
    const next = current.some((o) => o.id === outing.id) ? current.map((o) => (o.id === outing.id ? outing : o)) : [outing, ...current];
    try {
      await commit(next);
      return true;
    } catch (e) {
      setStorageError(e.message);
      return false;
    }
  }
  function addPlan(place) {
    const existing = library.outings.find((x) => x.status === "planned" && x.place?.id === place.id);
    setEditor({ outing: existing || makeOuting(place), isNew: !existing });
  }
  function manual(memory = false) {
    setEditor({ isNew: true, outing: manualOuting(memory) });
  }
  function saveVisit(place) {
    setEditor({ isNew: true, outing: { ...makeOuting(place), status: "visited", visitDate: localDate() } });
  }
  function visit(outing) {
    setEditor({ isNew: false, outing: { ...outing, status: "visited", visitDate: localDate() } });
  }
  function edit(outing) {
    setEditor({ isNew: false, outing });
  }
  async function remove(outing) {
    if (!(await confirm(`${deleteTitle(outing)}${account?.owner ? " everywhere" : ""}?`))) return false;
    try {
      await commit(libraryRef.current.outings.filter((o) => o.id !== outing.id));
      toast("Deleted");
      return true;
    } catch (e) {
      setStorageError(e.message);
      return false;
    }
  }
  return { saveOuting, put, addPlan, manual, saveVisit, visit, edit, remove };
}
