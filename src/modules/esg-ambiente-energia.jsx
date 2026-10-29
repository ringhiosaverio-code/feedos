/* FeedOS 18 · ESG › Registri ambientali › Energia: prestazioni (ENPI) e diagnosi energetica. Modello mensile kWh = a + b·t linea principale
 * + c·t altre linee (minimi quadrati sui mesi chiusi, base sui mesi precedenti gli ultimi tre), scostamento, z e CUSUM, riferimento del
 * mangimificio (33 kWh elettrici e 32 kWh termici per tonnellata pellettata), obbligo di diagnosi (D.Lgs. 102/2014) e audit energetici. */
import React, { useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { nf, dateIt, monthLabel } from '../core/util.js';
import { Panel, Kpi, Table, Btn, Drawer, Chip, Empty, Bullet, Kv } from '../ui/ui.jsx';
import { LineChart, SERIES } from '../ui/charts.jsx';
import { sectorOf } from '../engine/esg-years.js';
import { ambienteSettings, auditDuty, ENERGY_AUDIT_TYPES } from '../engine/esg-ambiente.js';
import { PACK_AMBIENTE } from '../data/pack-ambiente.js';
import { numTxt, saveRecord, removeRecord, RecordForm } from './esg-ambiente-ui.jsx';

/** Nome della linea principale nell’edizione: pellet nel mangimificio, granuli nell’azienda di agrofarmaci (niente parole d’altro settore). */
export const mainWord = d => (sectorOf(d) === 'agrofarmaci' ? 'granuli' : 'pellet');

/** Sezione «energia-prestazioni». */
export function EnergiaSection({ d, P, S }) {
  const E = S.enpi, M = E.model, K = ambienteSettings(d), A = S.audit || auditDuty(d, P, null);
  const [edit, setEdit] = useState(null);
  const word = mainWord(d);
  const rows = M && M.ok ? M.rows : [];
  const inP = rows.filter(r => r.month >= P.from.slice(0, 7) && r.month <= P.to.slice(0, 7));
  const elMWh = inP.reduce((s, r) => s + r.el, 0) / 1000, thMWh = inP.reduce((s, r) => s + r.th, 0) / 1000;
  const allT = rows.reduce((s, r) => s + r.tTot, 0), otherShare = allT > 0 ? rows.reduce((s, r) => s + r.tOther, 0) / allT : 0;
  const bench = K.benchmark, perMain = E.elPerMain, thPerMain = E.thPerMain;
  const audits = (d.energyAudits || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = rows.at(-1) || null;
  return (
    <>
      <div className="kpis eam-kpis">
        <Kpi label="Scostamento dal modello (periodo)" value={E.devPct != null ? nf(E.devPct, 1) : '—'} unit="%" status={E.devPct != null && E.devPct > 1 ? 'warn' : 'ok'}
          foot={last && last.dev != null ? `ultimo mese ${nf(last.dev * 100, 1)}%` : 'serve un modello di almeno sei mesi'} />
        <Kpi label="Elettricità del periodo" value={inP.length ? nf(elMWh, 0) : '—'} unit="MWh" foot="prelievo più fotovoltaico autoconsumato" />
        <Kpi label="Energia termica del GPL" value={inP.length ? nf(thMWh, 0) : '—'} unit="MWh" foot="GPL in kWh con potere calorifico di 47,3 MJ/kg" />
        <Kpi label="Energia totale per la diagnosi" value={A.tj != null ? nf(A.tj, 1) : '—'} unit="TJ/anno" foot={`soglia audit 10 TJ · sistema di gestione 85 TJ`} />
      </div>
      <Panel title="Modello ENPI" sub={M && M.ok ? `Base ${M.baselineFrom} – ${M.baselineTo} · R² ${numTxt(M.r2, 3)} · errore standard ${numTxt(M.s, 0)} kWh` : 'Modello non disponibile'}>
        {M && M.ok ? (
          <>
            <p className="small eam-model">kWh elettrici del mese = <b>{numTxt(M.beta.a, 0)}</b> kWh di base + <b>{numTxt(M.beta.b, 1)}</b> kWh per tonnellata di {word} + <b>{numTxt(M.beta.c, 1)}</b> kWh per tonnellata delle altre linee.
              {otherShare < 0.2 && <span className="muted"> Le altre linee pesano meno del 20% delle tonnellate: il loro coefficiente è poco preciso.</span>}</p>
            <LineChart ariaLabel="Elettricità del mese: misurata e attesa dal modello" unit="kWh" decimals={0} height={220} markLast={false}
              labels={rows.map(r => monthLabel(r.month, true))}
              series={[{ key: 'el', label: 'Misurata', color: SERIES[0], values: rows.map(r => r.el) },
                { key: 'ex', label: 'Attesa', color: SERIES[3], dashed: true, values: rows.map(r => r.expected) }]} />
            <LineChart ariaLabel="CUSUM dei residui del modello ENPI" unit="" decimals={1} height={160} markLast={false}
              labels={rows.map(r => monthLabel(r.month, true))} refs={[{ y: 4, label: 'soglia 4', kind: 'crit' }]}
              series={[{ key: 'cu', label: 'CUSUM', color: SERIES[1], values: rows.map(r => r.cusum) }]} />
            <Table rows={rows.slice().reverse()} rowKey={r => r.month} pageSize={12} exportName="enpi-mesi" cols={[
              { key: 'month', label: 'Mese', render: r => monthLabel(r.month, true) },
              { key: 'el', label: 'Misurata kWh', align: 'r', render: r => nf(r.el, 0) },
              { key: 'expected', label: 'Attesa kWh', align: 'r', render: r => nf(r.expected, 0) },
              { key: 'dev', label: 'Scostamento', align: 'r', render: r => (r.dev == null ? '—' : `${r.dev >= 0 ? '+' : ''}${nf(r.dev * 100, 1)}%`) },
              { key: 'z', label: 'z (errori standard)', align: 'r', render: r => numTxt(r.z, 2) },
              { key: 'cusum', label: 'CUSUM', align: 'r', render: r => numTxt(r.cusum, 2) },
              { key: 'state', label: 'Stato', nosort: true, render: r => (!r.monitor ? <Chip kind="outline">base</Chip> : (M.alarms.includes(r.month) ? <Chip kind="warn">deriva</Chip> : <Chip kind="good">in linea</Chip>)) },
            ]} />
            <p className="small muted eam-note">Deriva: mese di controllo con scostamento oltre l’1% e oltre due errori standard del modello. CUSUM sopra 4 indica uno spostamento durevole. {M.cusumAlarm ? 'Il CUSUM ha superato la soglia nell’archivio.' : 'Il CUSUM resta sotto la soglia.'}</p>
          </>
        ) : <Empty title="Modello non disponibile">{E.model?.reason || 'Servono i registri di energia e di produzione per almeno sei mesi chiusi.'}</Empty>}
      </Panel>
      {M && M.ok && (
        <div className="g2 eam-two">
          <Panel title="Riferimento di settore" sub={bench ? 'Confronto per tonnellata pellettata con un dato pubblicato di mangimificio francese (non verificato per l’Italia)' : 'Nessun riferimento di settore per questa edizione'}>
            {bench && perMain != null ? (
              <div className="eam-gauges">
                <div className="eam-gauge">
                  <span className="small">Elettricità: {numTxt(perMain, 1)} kWh per tonnellata (riferimento {numTxt(bench.elPellet, 0)})</span>
                  <Bullet value={perMain} min={0} max={bench.elPellet} lo={0} hi={bench.elPellet * 2} />
                </div>
                <div className="eam-gauge">
                  <span className="small">Termico: {numTxt(thPerMain, 1)} kWh per tonnellata (riferimento {numTxt(bench.thPellet, 0)})</span>
                  <Bullet value={thPerMain} min={0} max={bench.thPellet} lo={0} hi={bench.thPellet * 2} />
                </div>
                <p className="small muted">Il dato rapporta tutta l’elettricità dello stabilimento alle tonnellate pellettate: è un confronto prudente, non la misura di un solo processo.</p>
              </div>
            ) : <p className="small muted">Nessun riferimento impostato: il confronto per tonnellata si può fare con il dato storico dell’azienda (la linea principale resta in {word}).</p>}
          </Panel>
          <Panel title="Diagnosi energetica" sub="Obbligo secondo il D.Lgs. 102/2014 art. 8 e la direttiva rifusa: da verificare"
            actions={<Btn small kind="ghost" icon={LuPlus} onClick={() => setEdit({})}>Nuovo audit</Btn>}>
            <Kv items={[
              ['Energia del periodo', `${numTxt(A.tj, 2)} TJ/anno (elettricità più GPL)`],
              ['Grande impresa', A.large == null ? 'da verificare: mancano addetti o fatturato in settings' : A.large ? 'sì: diagnosi quadriennale obbligatoria' : 'no (sotto 250 addetti o sotto le soglie di fatturato)'],
              ['Audit con la soglia della direttiva rifusa (10 TJ)', A.eedAudit ? 'superata' : 'non superata'],
              ['Sistema di gestione dell’energia (85 TJ)', A.eedEnMS ? 'superata' : 'non superata'],
              ['Prossima scadenza della diagnosi', `${dateIt(A.nextDeadline)} (da verificare)`],
            ]} />
            <Table rows={audits} rowKey={x => x.id} pageSize={6} onRow={x => setEdit(x)} empty="Nessun audit registrato" cols={[
              { key: 'date', label: 'Data', render: x => dateIt(x.date), sort: true },
              { key: 'type', label: 'Tipo', render: x => x.type || '—' },
              { key: 'auditor', label: 'Auditor', render: x => x.auditor || '—' },
              { key: 'nextDue', label: 'Prossima scadenza', render: x => (x.nextDue ? dateIt(x.nextDue) : '—') },
            ]} />
          </Panel>
        </div>
      )}
      {edit && <AuditDrawer d={d} rec={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      <p className="small muted eam-note">Soglie e norme: {PACK_AMBIENTE.source}. Valori di sintesi, da verificare.</p>
    </>
  );
}

/** Audit energetico (nuovo o modifica). */
function AuditDrawer({ d, rec, onClose }) {
  return (
    <Drawer title={rec ? `Audit del ${dateIt(rec.date)}` : 'Nuovo audit energetico'} sub={`Tipi: ${ENERGY_AUDIT_TYPES.join(', ')}`} wide onClose={onClose}
      actions={rec ? <Btn kind="danger" icon={LuTrash2} onClick={() => removeRecord('energyAudits', rec.id, 'Audit energetico', 'questo audit')}>Elimina</Btn> : null}>
      <RecordForm coll="energyAudits" rec={rec} d={d} defaults={{ type: 'interno' }} saveLabel={rec ? 'Salva' : 'Aggiungi'} onCancel={onClose}
        onSave={v => { saveRecord('energyAudits', rec, v, 'Audit energetico'); onClose(); }} />
    </Drawer>
  );
}
