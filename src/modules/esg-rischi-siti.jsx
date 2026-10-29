/* FeedOS 18 · ESG › Rischi climatici: sottosezioni «siti» (registro, mappa, dati B5) e «fisici» (matrice dei pericoli per sito,
 * verifica con ISPRA IdroGEO). Scritture con store.batch e etichette italiane; moduli con EntityForm sui campi di esg-rischi
 * (fields-rischi.js). Prefisso di classe eri-. */
import React, { useState } from 'react';
import { LuPlus, LuPencil, LuTrash2, LuMapPin, LuX } from 'react-icons/lu';
import { store, toast } from '../core/store.js';
import { Panel, Kpi, Table, Btn, Chip, Empty, confirm } from '../ui/ui.jsx';
import { EntityForm } from '../ui/forms.jsx';
import { nf } from '../core/util.js';
import { toCSV, download, stamp } from '../core/io.js';
import { HAZARDS, hazardKey, ownedSites, hazardsOf, siteRisk, checkDue, oldestCheck, assetsOf, rischiSettings, plantCoords } from '../engine/esg-rischi.js';
import { SiteMap, LevelMeter, HighChip, eurTxt, pctTxt, dateTxt, fin } from './esg-rischi-ui.jsx';

const undoToast = text => toast(text, 'ok', { label: 'Annulla', fn: () => store.undo() });
const SHORT = { alluvione: 'Alluvione', frana: 'Frana', sisma: 'Sisma', caldo: 'Caldo', siccita: 'Siccità', 'grandine-vento': 'Grandine e vento', incendio: 'Incendio', mare: 'Mare' };
const coordTxt = s => (fin(s.lat) && fin(s.lon) ? `${nf(+s.lat, 4)} · ${nf(+s.lon, 4)}` : null);

/** Sottosezione «Siti»: registro con modulo, mappa senza tessere, dati della biodiversità (B5) e del caldo. */
export function SitiView({ d, today }) {
  const S = rischiSettings(d);
  const [edit, setEdit] = useState(null); // null | {} (nuovo) | sito
  const sites = (d.sites || []).filter(Boolean);
  const owned = ownedSites(d);
  const assets = owned.reduce((a, s) => a + assetsOf(s), 0);
  const area = sites.reduce((a, s) => a + (fin(s.areaM2) ? +s.areaM2 : 0), 0);
  const sealed = sites.reduce((a, s) => a + (fin(s.sealedM2) ? +s.sealedM2 : 0), 0);
  const sens = sites.filter(s => s.sensitive === true || (fin(s.natura2000Km) && +s.natura2000Km <= S.natura2000NearKm)).length;
  const plant = plantCoords(d);
  const save = (v, id) => {
    const clean = { ...v, owned: v.owned !== false };
    if (id) store.batch([{ kind: 'update', coll: 'sites', id, patch: clean }], `Rischi · sito aggiornato: ${clean.name}`);
    else store.batch([{ kind: 'add', coll: 'sites', obj: clean }], `Rischi · nuovo sito: ${clean.name}`);
    setEdit(null); undoToast(id ? 'Sito aggiornato' : 'Sito aggiunto');
  };
  const remove = s => confirm('Eliminare il sito?', `«${s.name}» e i suoi pericoli resteranno senza sito. Si può annullare subito dopo.`, () => {
    store.batch([{ kind: 'remove', coll: 'sites', id: s.id }], `Rischi · sito eliminato: ${s.name}`); setEdit(null); undoToast('Sito eliminato');
  }, { ok: 'Elimina', danger: true });
  return (
    <>
      <div className="kpis">
        <Kpi label="Siti registrati" value={sites.length} foot={`${owned.length} di proprietà, ${sites.length - owned.length} in locazione`} />
        <Kpi label="Valore dei beni di proprietà" value={nf(assets)} unit="€" foot="terreni, fabbricati, impianti, attrezzature" />
        <Kpi label="Superficie impermeabilizzata" value={area ? pctTxt(sealed / area) : '—'} foot={area ? `${nf(sealed)} m² su ${nf(area)} m²` : 'da inserire nei siti'} />
        <Kpi label="Siti in o vicino ad aree sensibili" value={sites.length ? sens : '—'} foot={`vicino = entro ${nf(S.natura2000NearKm, 0)} km da Natura 2000 o con vincolo`} />
      </div>
      <Panel title="Mappa dei siti" sub="Posizioni relative al centro dello stabilimento: nessuno sfondo geografico. Punti piccoli: clienti entro 40 km." id="eri-mappa">
        <SiteMap plant={plant} sites={sites} customers={d.customers || []} ariaLabel="Mappa dei siti dello stabilimento e dei clienti vicini" />
        <p className="small muted">{plant ? `Centro: ${plant.source}.` : 'Coordinate dello stabilimento non ancora impostate.'} Le coordinate dei siti si modificano nel registro.</p>
      </Panel>
      <Panel title="Registro dei siti" sub="Sito per sito: tipo, posizione, superfici (dati B1 e B5 del VSME), valore dei beni per la polizza catastrofale" flush
        actions={<Btn small kind="primary" icon={edit ? LuX : LuPlus} onClick={() => setEdit(edit ? null : {})}>{edit ? 'Chiudi' : 'Nuovo sito'}</Btn>}>
        {edit && (
          <div className="eri-form">
            <EntityForm coll="sites" d={d} rec={edit.id ? edit : { kind: 'stabilimento', owned: true, main: false }} saveLabel={edit.id ? 'Salva il sito' : 'Aggiungi il sito'}
              onSave={v => save(v, edit.id)} onCancel={() => setEdit(null)} />
            {edit.id && <div className="eri-form-x"><Btn small kind="danger" icon={LuTrash2} onClick={() => remove(edit)}>Elimina il sito</Btn></div>}
          </div>
        )}
        {!sites.length ? <Empty icon={LuMapPin} title="Nessun sito registrato">Inserisci lo stabilimento e i magazzini: servono per la mappa, la copertura catastrofale e i dati B1 e B5 del VSME.</Empty> : (
          <Table rows={sites} rowKey={s => s.id} exportName="rischi-siti" onRow={s => setEdit(s)} cols={[
            { key: 'name', label: 'Sito', render: s => <><b>{s.name}</b><span className="sub">{s.kind || '—'}{s.main ? ' · principale' : ''}</span></> },
            { key: 'comune', label: 'Comune', render: s => <span className="small">{s.comune || '—'}{s.provincia ? ` (${s.provincia})` : ''}</span>, csv: s => `${s.comune || ''} ${s.provincia || ''}`.trim() },
            { key: 'coord', label: 'Coordinate', csv: s => coordTxt(s) || '', render: s => (coordTxt(s) ? <span className="small mono">{coordTxt(s)}</span> : <Chip kind="warn">mancanti</Chip>) },
            { key: 'areaM2', label: 'Superficie m²', align: 'r', sort: s => +s.areaM2 || 0, csv: s => s.areaM2 ?? '', render: s => (fin(s.areaM2) ? nf(+s.areaM2) : '—') },
            { key: 'sealed', label: 'Impermeabilizzata', align: 'r', sort: s => (+s.sealedM2 || 0) / (+s.areaM2 || 1), csv: s => (fin(s.areaM2) && fin(s.sealedM2) ? +s.sealedM2 / +s.areaM2 : ''), render: s => (fin(s.areaM2) && fin(s.sealedM2) ? pctTxt(+s.sealedM2 / +s.areaM2) : '—') },
            { key: 'n2k', label: 'Natura 2000', align: 'r', sort: s => (fin(s.natura2000Km) ? +s.natura2000Km : 999), csv: s => s.natura2000Km ?? '', render: s => (fin(s.natura2000Km) ? `${nf(+s.natura2000Km, 1)} km` : '—') },
            { key: 'owned', label: 'Titolo', csv: s => (s.owned === false ? 'locato' : 'proprietà'), render: s => (s.owned === false ? <Chip kind="outline">in locazione</Chip> : <Chip kind="good">proprietà</Chip>) },
            { key: 'assets', label: 'Valore dei beni', align: 'r', sort: s => assetsOf(s), csv: s => assetsOf(s), render: s => (s.owned === false ? '—' : eurTxt(assetsOf(s))) },
            { key: 'edit', label: '', nosort: true, render: s => <Btn small icon={LuPencil} title={`Modifica ${s.name}`} onClick={e => { e.stopPropagation(); setEdit(s); }} /> },
          ]} />
        )}
      </Panel>
    </>
  );
}

/** Sottosezione «Fisici»: matrice dei pericoli per sito (ogni cella si apre), stato della verifica, guida a ISPRA IdroGEO. */
export function FisiciView({ d, today }) {
  const S = rischiSettings(d);
  const [edit, setEdit] = useState(null); // {siteId, hazard, row?}
  const sites = (d.sites || []).filter(Boolean);
  const keys = Object.keys(HAZARDS);
  const hazardOf = (siteId, k) => hazardsOf(d, siteId).find(h => hazardKey(h.hazard) === k) || null;
  const save = (v, id) => {
    const clean = { ...v, level: fin(v.level) ? Math.round(+v.level) : v.level };
    if (id) store.batch([{ kind: 'update', coll: 'siteHazards', id, patch: clean }], 'Rischi · pericolo aggiornato');
    else store.batch([{ kind: 'add', coll: 'siteHazards', obj: clean }], 'Rischi · pericolo registrato');
    setEdit(null); undoToast('Pericolo registrato');
  };
  const rows = (d.siteHazards || []).filter(Boolean);
  return (
    <>
      <Panel title="Matrice dei pericoli per sito" sub="Scala 0–4: 0 trascurabile, 4 molto alto. Clic su una cella per modificarla o registrarla. Vuoto = non ancora valutato." flush id="eri-pericoli">
        {!sites.length ? <Empty title="Nessun sito">Registra prima i siti nella scheda Siti.</Empty> : (
          <div className="eri-scroll">
            <table className="eri-hz">
              <thead><tr><th scope="col">Sito</th>{keys.map(k => <th scope="col" key={k}>{SHORT[k]}</th>)}<th scope="col">Verifica</th><th scope="col">Caldo</th></tr></thead>
              <tbody>
                {sites.map(s => {
                  const sr = siteRisk(s, hazardsOf(d, s.id));
                  const due = checkDue(hazardsOf(d, s.id), today, S.hazardMaxAgeMonths);
                  return (
                    <tr key={s.id}>
                      <th scope="row"><b>{s.name}</b><span className="sub"><HighChip n={sr.count ? sr.high : null} /></span></th>
                      {keys.map(k => {
                        const h = hazardOf(s.id, k);
                        return (
                          <td key={k}>
                            <button type="button" className="eri-cell" onClick={() => setEdit({ siteId: s.id, hazard: k, row: h })} aria-label={`${s.name}, ${HAZARDS[k]}: ${h ? `livello ${h.level}` : 'non valutato'}`}>
                              {h ? <LevelMeter level={h.level} /> : <span className="eri-na">—</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td><span className="small">{oldestCheck(hazardsOf(d, s.id)) ? dateTxt(oldestCheck(hazardsOf(d, s.id))) : '—'}</span>{due.due && <span className="sub"><Chip kind="warn">da ripetere</Chip></span>}</td>
                      <td className="small">{fin(s.heatDays) ? `${nf(+s.heatDays)} giorni` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {edit && (
          <div className="eri-form">
            <EntityForm coll="siteHazards" d={d} rec={edit.row || { siteId: edit.siteId, hazard: edit.hazard, source: 'autovalutazione', checkedAt: today }}
              saveLabel={edit.row ? 'Salva il pericolo' : 'Registra il pericolo'} onSave={v => save(v, edit.row?.id)} onCancel={() => setEdit(null)} />
          </div>
        )}
      </Panel>
      <Panel title="Come verificare, con ISPRA IdroGEO" sub="Il registro accetta livelli di qualunque fonte, purché indicata e datata">
        <ol className="eri-steps">
          <li>Apri il servizio ISPRA IdroGEO e usa l’hazard check con l’indirizzo del sito: indica la pericolosità di alluvione e frana entro 500 metri.</li>
          <li>Registra il livello da 0 a 4 e la data della verifica, con fonte «ISPRA IdroGEO (verifica manuale)».</li>
          <li>Per il sisma usa la classificazione sismica del comune (zone 1–4) e registra il livello con la sua fonte.</li>
          <li>Per caldo, siccità, grandine e incendio registra l’autovalutazione con i dati del sito, per esempio i giorni di caldo sopra 35 °C.</li>
          <li>Ripeti la verifica ogni {S.hazardMaxAgeMonths} mesi: il calendario e i segnali di «Oggi» ricordano le date scadute.</li>
        </ol>
        <p className="small muted">La mappa IdroGEO è dell’ente pubblico e i livelli dell’azienda sono una lettura del rischio, non una valutazione ufficiale: la fonte resta visibile nel registro e nel report.</p>
      </Panel>
      <Panel title="Registro dei pericoli" sub="Tutte le verifiche, con fonte e data" flush>
        <Table rows={rows} rowKey={h => h.id} exportName="rischi-pericoli" pageSize={50} cols={[
          { key: 'site', label: 'Sito', csv: h => (sites.find(s => s.id === h.siteId) || {}).name || h.siteId, render: h => <span className="small">{(sites.find(s => s.id === h.siteId) || {}).name || h.siteId}</span> },
          { key: 'hazard', label: 'Pericolo', csv: h => HAZARDS[hazardKey(h.hazard)] || h.hazard, render: h => HAZARDS[hazardKey(h.hazard)] || h.hazard },
          { key: 'level', label: 'Livello', align: 'r', csv: h => h.level ?? '', sort: h => +h.level || 0, render: h => <LevelMeter level={h.level} /> },
          { key: 'source', label: 'Fonte', csv: h => h.source || '', render: h => <span className="small">{h.source || 'mancante'}</span> },
          { key: 'checkedAt', label: 'Verifica del', csv: h => h.checkedAt || '', render: h => <span className="small">{dateTxt(h.checkedAt)}</span> },
        ]} />
      </Panel>
    </>
  );
}

/** Esportazione CSV del registro dei siti e dei pericoli (per la banca e il VSME). */
export function exportHazardsCsv(d) {
  const sites = (d.sites || []).filter(Boolean);
  const rows = (d.siteHazards || []).filter(Boolean).map(h => ({ sito: (sites.find(s => s.id === h.siteId) || {}).name || h.siteId, pericolo: HAZARDS[hazardKey(h.hazard)] || h.hazard,
    livello: h.level ?? '', fonte: h.source || '', verifica: h.checkedAt || '', nota: h.note || '' }));
  const cols = [['sito', 'Sito'], ['pericolo', 'Pericolo'], ['livello', 'Livello (0–4)'], ['fonte', 'Fonte'], ['verifica', 'Verifica del'], ['nota', 'Nota']].map(([key, label]) => ({ key, label }));
  download(`feedos-rischi-pericoli-${stamp()}.csv`, toCSV(rows, cols), 'text/csv;charset=utf-8');
}
