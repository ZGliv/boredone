import { localDate, makeOuting } from "../model";
import { manualOuting } from "./outings";

// Creating, saving and deleting plans and memories. Recreated each render so
// every handler sees the current page, library and demo state.
export default function useOutingActions({ journal, account, page, navigate, setEditor, setMemoryDetail, setSelected, setMessage }) {
  const { library, libraryRef, commit, demoMode, setStorageError } = journal;
  async function saveOuting(outing, originalStamp, isNew, draftId, draftStamp) {
    const current = libraryRef.current.outings,
      existing = current.find((x) => x.id === outing.id);
    if (isNew && existing) throw new Error("This outing was already saved in another tab. Your draft is still here; reopen the saved memory before making further changes.");
    if (!isNew && (!existing || existing.updatedAt !== originalStamp))
      throw new Error(
        "This outing changed in another tab. Close this editor and open it again to see the latest version.",
      );
    if (
      isNew && outing.status === "planned" &&
      current.some(
        (x) => x.status === "planned" && x.place.id === outing.place.id,
      )
    )
      throw new Error(
        "This place is already in your plans. Open it from Do it.",
      );
    await commit(
      existing
        ? current.map((o) => (o.id === outing.id ? outing : o))
        : [outing, ...current], draftId, draftStamp,
    );
    setEditor(null);
    setMemoryDetail(null);
    setSelected(null);
    setMessage(
      outing.status === "visited"
        ? (demoMode ? "Sample memory saved for this demo." : (account?.owner ? "Memory saved. Sync will continue when connected." : "Memory saved in this browser."))
        : "Your plan is saved.",
    );
    // Planning from the map should leave the explorer at their chosen view.
    // Journal-page edits continue to return to the corresponding collection.
    if (outing.status === "visited") { navigate("memories"); setMemoryDetail(outing); }
    else if (page !== "find") navigate("plans");
  }
  function addPlan(place) {
    const existing = library.outings.find(
      (x) => x.status === "planned" && x.place.id === place.id,
    );
    setSelected(null);
    setEditor({ outing: existing || makeOuting(place), isNew: !existing });
  }
  function manual(memory = false) {
    setEditor({ isNew: true, outing: manualOuting(memory) });
  }
  function saveVisit(place) {
    const outing = makeOuting(place);
    setSelected(null);
    setEditor({isNew:true,outing:{...outing,status:'visited',visitDate:localDate()}});
  }
  function visit(outing) {
    setMemoryDetail(null);
    setEditor({
      isNew: false,
      outing: { ...outing, status: "visited", visitDate: localDate() },
    });
  }
  async function remove(outing) {
    if (
      !window.confirm(
        `Delete “${outing.place.name}” and its saved photos ${account?.owner?'from your account and synced devices':'from this browser'}? Export a backup first if you want to keep a copy.`,
      )
    )
      return;
    try {
      await commit(
        libraryRef.current.outings.filter((o) => o.id !== outing.id),
      );
      setMemoryDetail(null);
      setMessage("Outing removed.");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  return { saveOuting, addPlan, manual, saveVisit, visit, remove };
}
