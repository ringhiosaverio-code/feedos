/* DifesaOS · Foto delle prove di campo e dei prodotti: foto vere salvate nel browser (core/persist.js, archivio «media», fuori dai
 * salvataggi dell'archivio) e illustrazioni del demo disegnate dall'app (art.js). Caricamento con riduzione e data e posizione
 * dello scatto lette dalla foto (core/images.js); ingrandimento con didascalia modificabile ed eliminazione annullabile. */
import React, { useEffect, useRef, useState } from 'react';
import { LuCamera, LuImageOff, LuTrash2, LuMapPin, LuX } from 'react-icons/lu';
import { store, toast } from '../../core/store.js';
import { getMedia, putMedia } from '../../core/persist.js';
import { compressImage } from '../../core/images.js';
import { uid, dateIt, nf } from '../../core/util.js';
import { Btn, Chip, Field } from '../../ui/ui.jsx';
import { symptomArt, packArt } from './art.js';

const cache = new Map(); // mediaId → data URL già letti

/** Sorgente immediata (illustrazione o foto già letta), altrimenti null. */
export function photoSrcSync(ph) {
  if (!ph) return null;
  if (ph.kind === 'illustrazione') return ph.art?.kind === 'confezione' ? null : symptomArt(ph.art);
  return ph.mediaId ? cache.get(ph.mediaId) || null : null;
}

/** Sorgente di una foto: le foto vere si leggono dal browser la prima volta. → data URL | null (assente) | undefined (in lettura) */
export function usePhotoSrc(ph) {
  const [src, setSrc] = useState(() => photoSrcSync(ph) ?? (ph?.mediaId ? undefined : null));
  useEffect(() => {
    let live = true;
    const s = photoSrcSync(ph);
    if (s || !ph?.mediaId) { setSrc(s); return undefined; }
    setSrc(undefined);
    getMedia(ph.mediaId).then(r => { if (!live) return; if (r?.dataUrl) cache.set(ph.mediaId, r.dataUrl); setSrc(r?.dataUrl || null); });
    return () => { live = false; };
  }, [ph?.id, ph?.mediaId, ph?.kind]);
  return src;
}

/** Una foto con didascalia; onOpen la ingrandisce. */
export function Photo({ ph, onOpen, caption = true }) {
  const src = usePhotoSrc(ph);
  const Tag = onOpen ? 'button' : 'div';
  return (
    <figure className="pr-ph">
      <Tag className="pr-ph-img" {...(onOpen ? { type: 'button', onClick: () => onOpen(ph), title: 'Ingrandisci' } : {})}>
        {src ? <img src={src} alt={ph.caption || 'Foto'} /> : <span className="pr-ph-miss"><LuImageOff aria-hidden="true" />{src === undefined ? 'Caricamento…' : 'Foto non presente in questo browser: si recupera dal backup'}</span>}
      </Tag>
      {caption && <figcaption>{ph.caption || 'Foto'}<span className="muted"> · {dateIt(ph.date)}{ph.lat != null ? ' · posizione GPS' : ''}</span></figcaption>}
    </figure>
  );
}

/** Immagine della confezione: la foto caricata (ruolo «confezione») o l'illustrazione disegnata dall'app. */
export function PackImage({ d, p }) {
  const ph = [...(d.photos || [])].reverse().find(x => x.productId === p?.id && x.role === 'confezione');
  const src = usePhotoSrc(ph);
  if (ph && src) return <figure className="pr-pack"><img src={src} alt={`Confezione di ${p.name}`} /></figure>;
  return <figure className="pr-pack"><img src={packArt(p)} alt={`Illustrazione della confezione di ${p?.name}`} /></figure>;
}

/** Galleria con ingrandimento; editable permette di cambiare la didascalia e di eliminare. */
export function PhotoGrid({ photos, editable = false, max, empty = 'Nessuna foto' }) {
  const [open, setOpen] = useState(null);
  const list = max ? photos.slice(0, max) : photos;
  if (!photos.length) return <p className="small muted">{empty}</p>;
  return (
    <>
      <div className="pr-grid">{list.map(ph => <Photo key={ph.id} ph={ph} onOpen={setOpen} />)}</div>
      {max && photos.length > max && <p className="small muted">e altre {nf(photos.length - max)} foto</p>}
      {open && <Lightbox ph={photos.find(x => x.id === open.id) || open} editable={editable && open.kind !== 'illustrazione'} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ ph, editable, onClose }) {
  const src = usePhotoSrc(ph);
  const [cap, setCap] = useState(ph.caption || '');
  const box = useRef(null);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    box.current?.querySelector('button')?.focus();
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  const save = () => { if (cap !== (ph.caption || '')) { store.update('photos', ph.id, { caption: cap }, 'Didascalia della foto'); toast('Didascalia salvata', 'ok', { label: 'Annulla', fn: () => store.undo() }); } onClose(); };
  const del = () => { store.remove('photos', ph.id, 'Foto eliminata'); toast('Foto eliminata', 'ok', { label: 'Annulla', fn: () => store.undo() }); onClose(); };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="pr-lightbox" role="dialog" aria-modal="true" aria-label={ph.caption || 'Foto'} ref={box}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <b>{ph.kind === 'illustrazione' ? 'Illustrazione dimostrativa' : 'Foto'}</b>
          <Btn small kind="ghost" icon={LuX} title="Chiudi" onClick={onClose} />
        </div>
        {src ? <img src={src} alt={ph.caption || 'Foto'} /> : <span className="pr-ph-miss"><LuImageOff aria-hidden="true" />Foto non presente in questo browser</span>}
        <div className="row gap-s small muted" style={{ flexWrap: 'wrap' }}>
          <span>{dateIt(ph.date)}{ph.takenAt ? ` · scattata ${ph.takenAt.slice(11, 16)}` : ''}</span>
          {ph.lat != null && <a href={`https://www.openstreetmap.org/?mlat=${ph.lat}&mlon=${ph.lon}#map=16/${ph.lat}/${ph.lon}`} target="_blank" rel="noopener noreferrer"><LuMapPin aria-hidden="true" /> {nf(ph.lat, 5)}, {nf(ph.lon, 5)}</a>}
          {ph.w && <span>{nf(ph.w)} × {nf(ph.h)} px{ph.bytes ? ` · ${nf(ph.bytes / 1024)} kB` : ''}</span>}
        </div>
        {editable ? (
          <div className="pr-lb-edit">
            <Field label="Didascalia"><input className="input" value={cap} onChange={e => setCap(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} /></Field>
            <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
              <Btn kind="ghost" icon={LuTrash2} onClick={del}>Elimina</Btn>
              <Btn kind="primary" onClick={save}>Salva</Btn>
            </div>
          </div>
        ) : <p className="small">{ph.caption}</p>}
      </div>
    </>
  );
}

/**
 * Pulsante «Aggiungi foto»: riduce le foto scelte, le salva nel browser e aggiunge le schede in photos con meta
 * ({trialId, thesisId, productId, role, date}); data e posizione dello scatto vengono dalla foto quando ci sono.
 */
export function AddPhotos({ meta = {}, label = 'Aggiungi foto', small = true, kind = '' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const onFiles = async e => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const ops = [];
    let volatile = false;
    for (const f of files) {
      try {
        const c = await compressImage(f);
        const mediaId = uid('md');
        if ((await putMedia({ id: mediaId, dataUrl: c.dataUrl, w: c.w, h: c.h, bytes: c.bytes, name: c.name, savedAt: new Date().toISOString() })) === 'memory') volatile = true;
        cache.set(mediaId, c.dataUrl);
        const { caption, date, ...rest } = meta;
        ops.push({ kind: 'add', coll: 'photos', obj: {
          id: uid('ph'), kind: 'foto', role: 'prova', ...rest, mediaId, caption: caption || f.name.replace(/\.[^.]+$/, ''),
          date: (c.takenAt || '').slice(0, 10) || date || new Date().toISOString().slice(0, 10), takenAt: c.takenAt, lat: c.lat, lon: c.lon, w: c.w, h: c.h, bytes: c.bytes,
        } });
      } catch (err) { toast(err?.message || 'Foto non leggibile', 'err'); }
    }
    setBusy(false);
    if (!ops.length) return;
    store.batch(ops, ops.length === 1 ? 'Foto aggiunta' : `${ops.length} foto aggiunte`);
    toast(volatile ? 'Foto aggiunte solo per questa sessione: il browser non le conserva, esportare un backup prima di chiudere'
      : ops.length === 1 ? 'Foto aggiunta' : `${nf(ops.length)} foto aggiunte`, volatile ? 'err' : 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={onFiles} aria-label={label} />
      <Btn small={small} kind={kind} icon={LuCamera} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Riduco le foto…' : label}</Btn>
    </>
  );
}

/** Segno «illustrazione» per le tabelle. */
export const IllustrationChip = () => <Chip kind="outline">illustrazione</Chip>;
