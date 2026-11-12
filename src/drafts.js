import {validateOuting, localDate, MAX_BACKUP_BYTES} from './model.js';
export const DRAFT_PREFIX = 'draft:';
export function validateDraft(record,{preserveCalendarDate=false}={}) {
  if (!record || record.version!==1 || typeof record.id!=='string' || !/^[\w-]{1,100}$/.test(record.id) || typeof record.isNew!=='boolean' || !Number.isFinite(Date.parse(record.savedAt)) || typeof record.originalStamp!=='string') throw Error('This unfinished outing could not be read. Your saved journal is unchanged.');
  const source=record.outing;
  // An unresolved save has no place yet; keep it null rather than inventing one.
  const unresolved=source?.status==='saved'&&source?.place===null;
  const outing=validateOuting({...source,place:unresolved?null:{...source?.place,name:source?.place?.name || 'Unfinished outing'},visitDate:source?.status==='visited'&&!source?.visitDate?localDate():source?.visitDate},{preserveCalendarDate});
  if(!unresolved&&!source.place.name)outing.place.name='';
  if(!source.visitDate)outing.visitDate='';
  if(new Blob([JSON.stringify(outing)]).size>MAX_BACKUP_BYTES)throw Error('This draft is too large to save. Remove a photo and try again.');
  return {...record,outing};
}
