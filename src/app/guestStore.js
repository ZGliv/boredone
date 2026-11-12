import { readLibrary, writeLibrary, readDrafts, writeDraft, deleteDraft } from "../storage";
import { backupPayload, MAX_BACKUP_BYTES, validateBackup, validateOuting } from "../model";

// The device-only journal used when no account is signed in.
export const guestStore={read:readLibrary,save:(outings,revision,{draftId,draftStamp}={})=>writeLibrary(outings,revision,draftId,draftStamp),readDrafts,writeDraft,deleteDraft,channelName:"boredone-journal",backup:backupPayload,validateBackup,backupLimit:MAX_BACKUP_BYTES,validateOuting:value=>validateOuting(value)};
