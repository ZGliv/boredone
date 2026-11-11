import React, {useMemo, useState} from 'react';
import {displayDate} from './model';
import {filterMemories, groupMemories, memoryOptions, monthLabel} from './memoryFilters';
import {placeIcon} from './exploration';
import './memoryTimeline.css';

export default function MemoryTimeline({memories, canEdit, onAdd, onOpen}) {
  const [query, setQuery] = useState(''), [person, setPerson] = useState(''),
    [place, setPlace] = useState(''), [month, setMonth] = useState('');
  const options = useMemo(() => memoryOptions(memories), [memories]);
  const filtered = filterMemories(memories, {query, person, place, month});
  const active = Boolean(query || person || place || month);
  const clear = () => {setQuery('');setPerson('');setPlace('');setMonth('');};
  return <section className="memory-timeline" aria-label="Memory timeline">
    <header className="collection-intro">
      <div><h1>Your memories</h1><p>Places, people, good days.</p></div>
      <button onClick={onAdd} disabled={!canEdit}>Add a memory</button>
    </header>
    {memories.length > 0 && <div className="memory-filters">
      <label className="memory-search"><span className="sr-only">Search memories</span><input type="search" placeholder="Find a day, a place, a memory…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="memory-selects">
        <label>Who with<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">Everyone</option>{options.people.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Place<select value={place} onChange={e=>setPlace(e.target.value)}><option value="">Everywhere</option>{options.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="">Any time</option>{options.months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
      </div>
      <div className="memory-results"><span role="status">{filtered.length} {filtered.length===1?'memory':'memories'}{active?` of ${memories.length}`:''}</span>{active && <button className="text-button" onClick={clear}>Clear filters</button>}</div>
    </div>}
    {!filtered.length && <div className="memory-empty">
      <h2>{active?'No memories match these filters.':'Your good days, kept together.'}</h2>
      <p>{active?'Try another person, place or month.':'Start with a place you went and a few favorite photos.'}</p>
      <button className="secondary" disabled={!active && !canEdit} onClick={active?clear:onAdd}>{active?'Show all memories':'Add your first memory'}</button>
    </div>}
    {groupMemories(filtered).map(group=><section className="memory-month" key={group.month} aria-label={monthLabel(group.month)}>
      <div className="memory-month-heading"><h2>{monthLabel(group.month)}</h2><span>{group.outings.length} {group.outings.length===1?'visit':'visits'}</span></div>
      <div className="timeline-grid">{group.outings.map(outing=><article className="timeline-card" key={outing.id}>
        <button className="timeline-open" onClick={()=>onOpen(outing)} aria-label={`Open ${outing.place.name}, ${displayDate(outing.visitDate)}`}>
          {outing.photos.length ? <div className={`timeline-photos ${outing.photos.length>1?'has-more':''}`}>
            {outing.photos.slice(0,3).map((photo,i)=><img key={i} src={photo} alt="" loading="lazy" decoding="async"/>)}
            <span className="timeline-photo-count">{outing.photos.length} {outing.photos.length===1?'photo':'photos'}</span>
          </div> : <div className="timeline-no-photo"><span className={`landmark-sprite landmark-${placeIcon(outing.place.category)}`} aria-hidden="true"/><span>{outing.place.category?.replaceAll('_',' ') || 'A day out'}</span></div>}
          <div className="timeline-caption"><h3>{outing.place.name}</h3><time dateTime={outing.visitDate}>{displayDate(outing.visitDate)}</time>{outing.with && <p>With {outing.with}</p>}</div>
        </button>
      </article>)}</div>
    </section>)}
  </section>;
}
