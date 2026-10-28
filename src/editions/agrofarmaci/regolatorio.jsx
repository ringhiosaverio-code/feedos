/* DifesaOS · Area Regolatorio: registrazioni e usi in etichetta, sostanze attive e rinnovi, schede di sicurezza, Seveso e ADR.
 * I calcoli stanno in engine/agro-reg.js; qui solo la presentazione e le poche registrazioni (invii delle schede). */
import React, { useMemo, useState } from 'react';
import { LuScale, LuSend, LuFlaskConical, LuTruck, LuLeaf, LuRotateCcw } from 'react-icons/lu';
import { useData, store, toast } from '../../core/store.js';
import { go } from '../../core/router.js';
import { appToday, signals } from '../../core/derived.js';
import { nf, eur, pct, dateIt, daysBetween, addMonths, sum, byId } from '../../core/util.js';
import { PageHead, Panel, Kpi, Table, Chip, Drawer, Kv, Seg, Btn, Bullet, NumInput, Select, Field, Empty } from '../../ui/ui.jsx';
import { Bars } from '../../ui/charts.jsx';
import { SignalList } from '../../modules/shared.jsx';
import { NAV } from '../../app/nav.js';
import {
  AGRO_RULES, rulesOf, SALE_LABEL, saleStatus, art43Due, revenueAtRisk, disposalPlan, usesMatrix, substanceBoard, sdsGaps, needsUfi,
  sevesoIndex, finishedStock, rawStock, transportUnits, productRevenue, copperBudget,
} from '../../engine/agro-reg.js';
import { AGRO_RULE_SOURCES, AGRO_ESTIMATES, RULES_CHECKED_AT } from '../../data/agro-rules.js';

const SALE_KIND = { vendibile: 'good', 'vendibile-smaltimento': 'warn', 'solo-impiego': 'warn', 'non-vendibile': 'crit', 'non-registrato': 'outline' };
const KIND_LABEL = { autorizzazione: 'Autorizzazione', 'CE-fertilizzante': 'Fertilizzante CE', 'commercio-parallelo': 'Commercio parallelo', 'emergenza-art53': 'Emergenza (art. 53)' };
const EV_LABEL = { 'rinnovo-art43': 'Rinnovo del prodotto (art. 43)', revoca: 'Revoca', 'modifica-etichetta': 'Modifica di etichetta', 'rinnovo-sostanza': 'Rinnovo della sostanza', 'estensione-uso': 'Estensione d’uso', 'domanda-autorizzazione': 'Nuova autorizzazione', 'adeguamento-clp': 'Adeguamento CLP' };
// colture degli usi in etichetta, in ordine di numero di usi (un archivio importato può averne decine)
const cropsOf = d => {
  const n = {}, name = {};
  for (const u of d.regUses || []) if (u.crop) { n[u.crop] = (n[u.crop] || 0) + 1; name[u.crop] = name[u.crop] || u.cropGroup || u.cropName || u.crop; }
  return Object.keys(n).sort((a, b) => n[b] - n[a] || (name[a] < name[b] ? -1 : 1)).map(id => ({ id, label: name[id], n: n[id] }));
};
const doseNf = v => nf(v, Number.isInteger(v) ? 0 : v < 1 ? 2 : 1);
const doseTxt = (lo, hi) => (lo == null ? '—' : lo === hi || hi == null ? doseNf(lo) : `${doseNf(lo)}–${doseNf(hi)}`);
// uso in etichetta: dose per ettolitro (anche intervallo), per ettaro, carenza (in giorni, o testo dell'etichetta)
const perHlTxt = u => (u.dosePerHl == null ? '—' : `${doseTxt(u.dosePerHl, u.dosePerHlMax ?? u.dosePerHl)} ${u.perHlUnit}`);
const perHaTxt = u => (u.doseMin == null ? '—' : `${doseTxt(u.doseMin, u.doseMax)} ${u.doseUnit}`);
const phiTxt = u => (u.phiText ? u.phiText : u.phiDays == null ? 'fioritura' : `${nf(u.phiDays)} gg`);

export function Regolatorio({ route }) {
  const d = useData();
  const tabs = NAV.regolatorio?.tabs || [];
  const tab = tabs.some(t => t.id === route.tab) ? route.tab : tabs[0]?.id;
  const today = appToday(d);
  const sig = signals(d).filter(s => s.area === 'regolatorio');
  return (
    <>
      <PageHead title={NAV.regolatorio?.label || 'Regolatorio'} lead={NAV.regolatorio?.lead} tabs={tabs} tab={tab} onTab={t => go('regolatorio', t)} />
      {!(d.registrations || []).length ? <Empty icon={LuScale} title="Nessuna registrazione nell’archivio">Importare l’elenco dei prodotti registrati (numero, data, sostanze, scadenza) da Dati › Importa, o aprire il demo per vedere l’area.</Empty>
        : tab === 'sostanze' ? <Sostanze d={d} today={today} route={route} />
        : tab === 'sds' ? <Sds d={d} today={today} route={route} />
        : tab === 'seveso' ? <Seveso d={d} today={today} />
        : tab === 'fonti' ? <Fonti d={d} />
        : <Registrazioni d={d} today={today} route={route} sig={sig} />}
    </>
  );
}

/* ================= Registrazioni ================= */
function Registrazioni({ d, today, route, sig }) {
  const prods = byId(d.products || []);
  const rev = useMemo(() => productRevenue(d, today), [d, today]);
  const rar = useMemo(() => revenueAtRisk(d, today), [d, today]);
  const rByReg = Object.fromEntries(rar.rows.map(r => [r.registrationId, r]));
  const crops = useMemo(() => cropsOf(d), [d]);
  const [cropSel, setCrop] = useState(null);
  const crop = crops.some(c => c.id === cropSel) ? cropSel : crops[0]?.id || null;
  const rows = (d.registrations || []).map(r => ({ ...r, product: prods[r.productId], sale: saleStatus(r, today), revenue: rev[r.productId]?.revenue || 0, risk: rByReg[r.id]?.r ?? 0 }));
  const sel = rows.find(r => r.id === route.id);
  const valid = rows.filter(r => r.sale === 'vendibile').length;
  const deadlines = useMemo(() => regDeadlines(d, today), [d, today]);
  const soon = deadlines.filter(x => x.days >= 0 && x.days <= 90).length;
  const uses = usesMatrix(d, { crop, today });
  return (
    <>
      <div className="kpis">
        <Kpi label="Registrazioni vendibili" value={nf(valid)} foot={`su ${nf(rows.length)} prodotti a catalogo`} />
        <Kpi label="In revoca o in smaltimento" value={nf(rows.filter(r => r.saleUntil).length)} foot="vendita e impiego fino alle date del decreto" status={rows.some(r => r.saleUntil) ? 'warn' : 'ok'} />
        <Kpi label="Ricavi a rischio a 36 mesi" value={nf(rar.rar / 1e6, 1)} unit="M€" foot={`${pct(rar.share, 0)} dei ricavi · stima`} status={rar.share > 0.2 ? 'bad' : rar.share > 0.1 ? 'warn' : 'ok'} />
        <Kpi label="Scadenze entro 90 giorni" value={nf(soon)} foot="rinnovi, etichette, fine vendita" status={soon ? 'warn' : 'ok'} />
      </div>
      {sig.length > 0 && <Panel title="Decisioni regolatorie in sospeso" sub="Dai segnali di «Oggi»"><SignalList items={sig} limit={6} compact /></Panel>}
      <div className="split">
        <Panel title="Scadenze" sub="Prossimi 18 mesi, in ordine di data" id="reg-deadlines">
          <ul className="list">
            {deadlines.filter(x => x.days >= -30 && x.days <= 548).slice(0, 12).map(x => (
              <li key={x.key} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span style={{ minWidth: 0 }}><b>{dateIt(x.date)}</b> · {x.label}{x.basis && <Chip kind="outline" title="Data stimata sul massimo di legge: si aggiorna con il decreto">stima</Chip>}</span>
                <Chip kind={x.days < 0 ? 'crit' : x.days <= 30 ? 'crit' : x.days <= 90 ? 'warn' : 'outline'}>{x.days < 0 ? `${nf(-x.days)} gg fa` : `tra ${nf(x.days)} gg`}</Chip>
              </li>))}
          </ul>
        </Panel>
        <Panel title="Ricavi a rischio per prodotto" sub={`Probabilità di mancato rinnovo entro ${rulesOf(d).horizonMonths} mesi: stime dell’azienda, si cambiano in Regole e fonti`}>
          <Bars data={rar.rows.filter(r => r.rar > 0).slice(0, 8).map(r => ({ key: r.productId, label: `${r.name} (${nf(r.r * 100)}%)`, value: r.rar / 1000, color: r.r >= 1 ? 'var(--s2)' : 'var(--s1)' }))} unit="mila €" ariaLabel="Ricavi a rischio per prodotto" onClick={x => go('regolatorio', 'registrazioni', rows.find(r => r.productId === x.key)?.id)} />
          <p className="small muted">Prodotto con più sostanze: r = 1 − Π(1 − r sostanza). Candidata alla sostituzione {nf(rulesOf(d).pNonRenewal.cfs * 100)}%, in rinnovo {nf(rulesOf(d).pNonRenewal['in rinnovo'] * 100)}%, basso rischio {nf(rulesOf(d).pNonRenewal['basso rischio'] * 100)}%; revoca o mancato rinnovo 100%.</p>
        </Panel>
      </div>
      <Panel title="Registrazioni" sub="Clic su una riga per usi, procedimenti e piano di smaltimento" flush>
        <Table rows={rows} selected={sel?.id} onRow={r => go('regolatorio', 'registrazioni', r.id)} initialSort={{ key: 'revenue', dir: 'desc' }} exportName="registrazioni" cols={[
          { key: 'name', label: 'Prodotto', sort: r => r.product?.name, render: r => <span><b>{r.product?.name}</b> <span className="muted small">{r.product?.code}</span></span>, csv: false },
          { key: 'regNumber', label: 'Registrazione', render: r => r.regNumber || '—' },
          { key: 'kind', label: 'Tipo', render: r => KIND_LABEL[r.kind] || r.kind },
          { key: 'sale', label: 'Stato', render: r => <Chip kind={SALE_KIND[r.sale]}>{SALE_LABEL[r.sale]}{r.status === 'in-rinnovo' ? ' · in rinnovo' : r.status === 'in-revoca' ? ' · in revoca' : ''}</Chip> },
          { key: 'expiryDate', label: 'Scadenza', render: r => (r.expiryDate ? dateIt(r.expiryDate) : '—') },
          { key: 'organic', label: 'Bio', render: r => (r.organic ? <Chip kind="good" icon={LuLeaf}>bio</Chip> : '') },
          { key: 'labelVersion', label: 'Etichetta', align: 'r', render: r => (r.labelVersion ? `v${r.labelVersion}` : '—') },
          { key: 'revenue', label: 'Ricavi 12 mesi', align: 'r', render: r => eur(r.revenue) },
          { key: 'risk', label: 'Rischio', align: 'r', render: r => (r.risk ? pct(r.risk, 0) : '—') },
        ]} />
      </Panel>
      <div className={(d.regEvents || []).length ? 'split' : 'stack'}>
        <Panel title="Usi autorizzati per coltura" sub={`Dose per ettolitro e per ettaro, trattamenti all’anno, carenza (${d.settings?.dataset === 'demo' ? 'dati di etichetta dimostrativi' : 'dall’archivio: vale sempre l’etichetta autorizzata'})`} id="reg-uses"
          actions={crops.length > 6 ? <Select value={crop || ''} onChange={setCrop} options={crops.map(c => ({ id: c.id, label: `${c.label} (${nf(c.n)})` }))} ariaLabel="Coltura" />
            : crops.length > 1 ? <Seg options={crops.map(({ id, label }) => ({ id, label }))} value={crop} onChange={setCrop} label="Coltura" /> : null}>
          <Table rows={uses} pageSize={30} exportName={`usi-${crop}`} cols={[
            ...(crops.find(c => c.id === crop)?.label !== uses[0]?.cropName || uses.some(u => u.cropName !== uses[0].cropName) ? [{ key: 'cropName', label: 'Coltura' }] : []),
            { key: 'pest', label: 'Avversità' },
            { key: 'product', label: 'Prodotto', render: r => <span>{r.product}{r.organic && <> <Chip kind="good">bio</Chip></>}{r.sale && r.sale !== 'vendibile' && <> <Chip kind="warn">{SALE_LABEL[r.sale]}</Chip></>}</span> },
            { key: 'dosePerHl', label: 'Dose/hl', align: 'r', render: perHlTxt },
            { key: 'doseMin', label: 'Dose/ha', align: 'r', render: perHaTxt },
            { key: 'maxApplications', label: 'Tratt./anno', align: 'r' },
            { key: 'phiDays', label: 'Carenza', align: 'r', render: phiTxt },
          ]} />
          <p className="small muted">Se l’etichetta indica solo la dose per ettolitro, la dose per ettaro si ottiene con un volume standard: circa 15 hl/ha per fruttiferi e vite a forme espanse, 10 hl/ha per erbacee e vite a forme ridotte. Prima dell’uso vale sempre l’etichetta del prodotto.</p>
        </Panel>
        {(d.regEvents || []).length > 0 && <Panel title="Procedimenti" sub="Domande, rinnovi, modifiche e revoche" flush>
          <Table rows={(d.regEvents || []).map(e => ({ ...e, product: prods[d.registrations.find(r => r.id === e.registrationId)?.productId]?.name || 'Nuovo prodotto' }))} initialSort={{ key: 'when', dir: 'desc' }} pageSize={12} cols={[
            { key: 'kind', label: 'Procedimento', render: e => <span>{EV_LABEL[e.kind] || e.kind}<div className="muted small">{e.product}</div></span> },
            { key: 'when', label: 'Data', sort: e => e.decisionDate || e.submittedDate || e.dueDate, render: e => (e.decisionDate ? `decisione ${dateIt(e.decisionDate)}` : e.submittedDate ? `presentato ${dateIt(e.submittedDate)}` : e.dueDate ? <b>entro {dateIt(e.dueDate)}</b> : '—') },
            { key: 'outcome', label: 'Esito', render: e => <Chip kind={e.outcome === 'accolta' ? 'good' : e.outcome === 'respinta' ? 'crit' : e.dueDate && !e.submittedDate ? 'warn' : 'outline'}>{e.dueDate && !e.submittedDate ? 'da presentare' : e.outcome}</Chip> },
            { key: 'fee', label: 'Costo', align: 'r', render: e => (e.fee ? eur(e.fee) : '—') },
          ]} />
        </Panel>}
      </div>
      {sel && <RegDrawer d={d} today={today} reg={sel} />}
    </>
  );
}

/** Scadenze regolatorie: art. 43, fine vendita e impiego, rietichettatura, scadenze di approvazione e registrazione. */
function regDeadlines(d, today) {
  const prods = byId(d.products || []), out = [];
  const name = r => prods[r.productId]?.name || r.productId;
  for (const x of art43Due(d, today)) if (!x.done) out.push({ key: 'a43' + x.registrationId + x.asId, date: x.due, label: `Domanda di rinnovo di ${prods[x.productId]?.name} (art. 43, ${x.asName})` });
  for (const r of d.registrations || []) {
    if (r.status === 'in-revoca' && r.expiryDate) out.push({ key: 'rv' + r.id, date: r.expiryDate, label: `Revoca di ${name(r)}` });
    if (r.saleUntil) out.push({ key: 'su' + r.id, date: r.saleUntil, label: `Fine vendita di ${name(r)}`, basis: r.graceBasis && r.graceBasis !== 'decreto' });
    if (r.useUntil) out.push({ key: 'uu' + r.id, date: r.useUntil, label: `Fine impiego di ${name(r)}`, basis: r.graceBasis && r.graceBasis !== 'decreto' });
    if (r.relabelDeadline) out.push({ key: 're' + r.id, date: r.relabelDeadline, label: `Etichetta v${r.labelVersion} di ${name(r)} su tutte le confezioni` });
    if (r.dataProtectionUntil) out.push({ key: 'dp' + r.id, date: r.dataProtectionUntil, label: `Fine della protezione dei dati di ${name(r)}` });
    if (r.expiryDate && r.status !== 'in-revoca' && r.status !== 'revocata') out.push({ key: 'ex' + r.id, date: r.expiryDate, label: `Scadenza della registrazione di ${name(r)}${r.status === 'in-rinnovo' ? ' (in rinnovo)' : ''}` });
  }
  for (const a of d.activeSubstances || []) if (a.approvalExpiry) out.push({ key: 'as' + a.id, date: a.approvalExpiry, label: `Scadenza dell’approvazione: ${a.name}${a.status === 'in rinnovo' ? ' (prorogabile, rinnovo in corso)' : ''}` });
  return out.map(x => ({ ...x, days: daysBetween(today, x.date) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function RegDrawer({ d, today, reg }) {
  const p = reg.product;
  const as = byId(d.activeSubstances || []);
  const uses = (d.regUses || []).filter(u => u.registrationId === reg.id);
  const evs = (d.regEvents || []).filter(e => e.registrationId === reg.id);
  const plan = reg.saleUntil ? disposalPlan(d, today, reg.id) : null;
  const close = () => go('regolatorio', 'registrazioni');
  return (
    <Drawer title={p?.name || reg.id} sub={`Registrazione ${reg.regNumber || '—'}`} onClose={close} wide icon={<LuScale />}>
      <div className="stack">
        <Kv items={[
          ['Stato', <Chip kind={SALE_KIND[reg.sale]}>{SALE_LABEL[reg.sale]}</Chip>], ['Tipo', KIND_LABEL[reg.kind] || reg.kind], ['Titolare', reg.holderName],
          ['Data di registrazione', reg.regDate ? dateIt(reg.regDate) : '—'], ['Scadenza', reg.expiryDate ? dateIt(reg.expiryDate) : reg.kind === 'autorizzazione' ? 'non inserita' : 'nessuna'],
          reg.saleUntil && ['Vendita fino al', `${dateIt(reg.saleUntil)}${reg.graceBasis !== 'decreto' ? ' (stima)' : ''}`], reg.useUntil && ['Impiego fino al', dateIt(reg.useUntil)],
          ['Uso', reg.professionalOnly ? 'solo professionale (con abilitazione)' : 'anche non professionale'], ['Agricoltura biologica', reg.organic ? 'impiegabile' : 'no'],
          ['Etichetta', `${reg.labelVersion ? `versione ${reg.labelVersion}` : 'versione non inserita'}${reg.labelDate ? ` del ${dateIt(reg.labelDate)}` : ''}${reg.relabelDeadline ? ` · da applicare entro il ${dateIt(reg.relabelDeadline)} (${nf(reg.oldLabelUnits)} confezioni con la precedente)` : ''}`],
          reg.dataProtectionUntil && ['Protezione dei dati', `fino al ${dateIt(reg.dataProtectionUntil)}`],
          ['Composizione dichiarata', (reg.declared || []).map(x => `${as[x.asId]?.name || x.asId} ${nf(x.content)} ${x.unit}`).join(' + ') || '—'],
          ['Gruppo di resistenza', p?.moa || '—'],
        ]} />
        {reg.note && <div className="note">{reg.note}</div>}
        {plan && <DisposalPlan plan={plan} R={rulesOf(d)} />}
        {uses.length > 0 && <Table rows={uses} pageSize={20} cols={[
          { key: 'cropName', label: 'Coltura' }, { key: 'pest', label: 'Avversità' },
          { key: 'doseMin', label: 'Dose/ha', align: 'r', render: u => (u.doseMin == null ? perHlTxt(u) : perHaTxt(u)) },
          { key: 'maxApplications', label: 'Tratt.', align: 'r' }, { key: 'phiDays', label: 'Carenza', align: 'r', render: phiTxt },
        ]} />}
        {evs.length > 0 && <ul className="list">{evs.map(e => <li key={e.id}><b>{EV_LABEL[e.kind] || e.kind}</b> · {e.decisionDate ? `deciso il ${dateIt(e.decisionDate)}` : e.submittedDate ? `presentato il ${dateIt(e.submittedDate)}` : e.dueDate ? `da presentare entro il ${dateIt(e.dueDate)}` : ''} · {e.outcome}{e.note ? ` — ${e.note}` : ''}</li>)}</ul>}
      </div>
    </Drawer>
  );
}

function DisposalPlan({ plan, R }) {
  const tech = sum(plan.rawRows, x => x.tonnes);
  return (
    <Panel title="Piano di smaltimento delle scorte" sub={`${plan.canProduce ? `Revoca dal ${dateIt(plan.withdrawal)} · ` : ''}vendita fino al ${dateIt(plan.saleUntil)} · impiego fino al ${dateIt(plan.useUntil)}`} inset>
      <div className="kpis">
        <Kpi label="Domanda stimata" value={nf(plan.demandT, 1)} unit="t" foot={`stesso periodo dell’anno prima × ${nf(R.graceDemandFactor * 100)}% (stima)`} />
        <Kpi label="Prodotto in magazzino" value={nf(plan.stockT, 1)} unit="t" foot={tech ? `più ${nf(tech, 1)} t di sostanza tecnica` : 'nessuna sostanza tecnica'} />
        {plan.canProduce && <Kpi label="Ultima produzione utile" value={nf(plan.makeT, 1)} unit="t" foot={`entro il ${dateIt(plan.withdrawal)}`} />}
        <Kpi label="Accantonamento" value={eur(plan.provision)} foot={`invenduto ${nf(plan.unsoldT, 1)} t equivalenti`} status={plan.provision > 5e4 ? 'bad' : plan.provision > 0 ? 'warn' : 'ok'} />
      </div>
      <ol className="list">{plan.actions.map(a => <li key={a.id}>{a.label}{a.valueEur ? ` (${eur(a.valueEur)})` : ''}</li>)}</ol>
    </Panel>
  );
}

/* ================= Sostanze attive ================= */
const RISK_LABEL = { 'non rinnovata': 'non rinnovata', revocata: 'revocata', cfs: 'candidata alla sostituzione', 'in rinnovo': 'in rinnovo', standard: 'scadenza nell’orizzonte', 'basso rischio': 'basso rischio' };
function Sostanze({ d, today, route }) {
  const rows = useMemo(() => substanceBoard(d, today), [d, today]);
  const sel = rows.find(a => a.id === route.id);
  const maxDays = 6 * 365;
  const cfs = rows.filter(a => a.cfs);
  return (
    <>
      <div className="kpis">
        <Kpi label="Sostanze attive nel portafoglio" value={nf(rows.length)} foot={`${nf(rows.filter(a => a.lowRisk).length)} a basso rischio`} />
        <Kpi label="Candidate alla sostituzione" value={nf(cfs.length)} foot={`${eur(sum(cfs, a => a.revenue))} di ricavi in 12 mesi`} status={cfs.length ? 'warn' : 'ok'} />
        <Kpi label="In rinnovo" value={nf(rows.filter(a => a.status === 'in rinnovo').length)} foot="approvazione prorogata in attesa della decisione" />
        <Kpi label="Non rinnovate" value={nf(rows.filter(a => a.status === 'non rinnovata').length)} foot="prodotti in revoca" status={rows.some(a => a.status === 'non rinnovata') ? 'bad' : 'ok'} />
      </div>
      <Panel title="Scadenze delle approvazioni" sub={`Da oggi a 6 anni; la barra arriva alla scadenza dell’approvazione europea${d.settings?.dataset === 'demo' ? ' (date dimostrative)' : ''}`} id="as-timeline">
        <div className="stack" style={{ gap: 6 }}>
          {rows.map(a => {
            const w = a.days == null ? 100 : Math.max(0, Math.min(100, (a.days / maxDays) * 100));
            const kind = a.days == null ? 'none' : a.days < 0 ? 'crit' : a.status === 'in rinnovo' ? 'warn' : a.cfs ? 'maize' : 'good';
            return (
              <button key={a.id} className="linkish" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 30%) 1fr', gap: 8, alignItems: 'center', textAlign: 'left', width: '100%' }} onClick={() => go('regolatorio', 'sostanze', a.id)}>
                <span className="small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{a.name}</b> <span className="muted">{a.moa}</span></span>
                <span style={{ position: 'relative', height: 14, background: 'var(--line)', borderRadius: 7, overflow: 'hidden' }} title={a.approvalExpiry ? `${dateIt(a.approvalExpiry)} · ${a.status}` : `scadenza non inserita · ${a.status}`}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${a.days != null && a.days < 0 ? 100 : w}%`, background: kind === 'none' ? 'repeating-linear-gradient(45deg, var(--line), var(--line) 4px, transparent 4px, transparent 8px)' : `var(--${kind === 'crit' ? 's2' : kind === 'warn' ? 's5' : kind === 'maize' ? 's4' : 's3'})`, opacity: a.days != null && a.days < 0 ? 0.35 : 0.85 }} />
                </span>
              </button>);
          })}
        </div>
        <p className="small muted">Verde approvata, giallo candidata alla sostituzione, arancio in rinnovo, rosso scaduta o non rinnovata, tratteggio scadenza non inserita. Dopo il rinnovo di una sostanza le registrazioni dei prodotti vanno rinnovate entro {AGRO_RULES.art43Months} mesi (art. 43).</p>
      </Panel>
      <Panel title="Sostanze attive" flush>
        <Table rows={rows} selected={sel?.id} onRow={a => go('regolatorio', 'sostanze', a.id)} exportName="sostanze-attive" cols={[
          { key: 'name', label: 'Sostanza', render: a => <b>{a.name}</b> },
          { key: 'moa', label: 'Gruppo di resistenza' },
          { key: 'status', label: 'Stato', render: a => <Chip kind={a.status === 'approvata' ? 'good' : a.status === 'in rinnovo' ? 'warn' : ['non rinnovata', 'revocata'].includes(a.status) ? 'crit' : 'outline'}>{a.status}</Chip> },
          { key: 'approvalExpiry', label: 'Scadenza', render: a => (a.approvalExpiry ? dateIt(a.approvalExpiry) : '—') },
          { key: 'flags', label: 'Profilo', render: a => <span className="row gap-s">{a.cfs && <Chip kind="maize">sostituzione</Chip>}{a.lowRisk && <Chip kind="good">basso rischio</Chip>}</span>, csv: false },
          { key: 'nprod', label: 'Prodotti', align: 'r', sort: a => a.products.length, render: a => nf(a.products.length) },
          { key: 'revenue', label: 'Ricavi 12 mesi', align: 'r', render: a => eur(a.revenue) },
        ]} />
      </Panel>
      <div className="split">
        <CopperCalc d={d} />
        <Panel title="Rame dei programmi consigliati" sub="Rame metallo per ettaro all’anno dai programmi di difesa (ESG › CO₂ dei programmi)">
          {(d.cropProgrammes || []).length ? <Bars data={(d.cropProgrammes || []).map(pr => ({ key: pr.id, label: pr.name, value: copperBudget(pr.applications, d), color: copperBudget(pr.applications, d) > 4 ? 'var(--s2)' : 'var(--s3)' }))} unit="kg/ha" decimals={2} ariaLabel="Rame per ettaro dei programmi" onClick={x => go('esg', 'co2', (d.cropProgrammes || []).find(p => p.id === x.key)?.crop)} />
            : <Empty title="Nessun programma di difesa registrato" />}
        </Panel>
      </div>
      {sel && (
        <Drawer title={sel.name} sub="Sostanza attiva" onClose={() => go('regolatorio', 'sostanze')} icon={<LuFlaskConical />}>
          <Kv items={[['Stato', sel.status], ['Scadenza dell’approvazione', `${sel.approvalExpiry ? dateIt(sel.approvalExpiry) : 'non inserita'}${sel.days != null ? ` (${sel.days < 0 ? `${nf(-sel.days)} giorni fa` : `tra ${nf(sel.days)} giorni`})` : ''}`],
            sel.renewedOn && ['Rinnovata il', `${dateIt(sel.renewedOn)} · rinnovo dei prodotti entro il ${dateIt(addMonths(sel.renewedOn, AGRO_RULES.art43Months))}`],
            ['Gruppo di resistenza', sel.moa], ['Candidata alla sostituzione', sel.cfs ? 'sì' : 'no'], ['Basso rischio', sel.lowRisk ? 'sì' : 'no'], ['Classe di rischio', sel.riskClass ? RISK_LABEL[sel.riskClass] : sel.approvalExpiry ? 'scadenza oltre l’orizzonte' : 'non stimata: scadenza non inserita'],
            sel.conditions && ['Condizioni d’uso', sel.conditions], sel.mrlReview && ['Limiti di residuo', sel.mrlReview], sel.taskForce && ['Dossier', sel.taskForce],
            ['Prodotti', sel.products.map(p => p.name).join(', ') || '—'], ['Ricavi 12 mesi', eur(sel.revenue)]]} />
          {sel.note && <div className="note">{sel.note}</div>}
        </Drawer>)}
    </>
  );
}

function CopperCalc({ d }) {
  const cu = (d.products || []).filter(p => (p.actives || []).some(x => x.as === 'rame'));
  const [pid, setPid] = useState(cu[0]?.id || '');
  const [dose, setDose] = useState(2);
  const [n, setN] = useState(5);
  const p = cu.find(x => x.id === pid);
  const kg = copperBudget([{ productId: pid, dose, n }], d);
  return (
    <Panel title="Bilancio del rame per ettaro" sub="Massimo 28 kg di rame metallo per ettaro in 7 anni (Reg. UE 2018/1981); molti Stati membri fissano anche 4 kg all’anno. Vale l’etichetta del prodotto" id="as-copper">
      {!cu.length ? <Empty title="Nessun prodotto rameico" /> : (
        <div className="stack">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <Field label="Prodotto"><Select value={pid} onChange={setPid} options={cu.map(x => ({ id: x.id, label: x.name }))} /></Field>
            <Field label={`Dose (${p?.uom === 'L' ? 'L' : 'kg'}/ha)`}><NumInput value={dose} onChange={v => setDose(v ?? 0)} decimals={2} min={0} ariaLabel="Dose per ettaro" /></Field>
            <Field label="Trattamenti all’anno"><NumInput value={n} onChange={v => setN(v ?? 0)} decimals={0} min={0} ariaLabel="Trattamenti all’anno" /></Field>
          </div>
          <div className="kpis two">
            <Kpi label="Rame metallo all’anno" value={nf(kg, 2)} unit="kg/ha" status={kg > 4 ? 'bad' : kg > 3.2 ? 'warn' : 'ok'} foot={`${nf((p?.actives || []).find(x => x.as === 'rame')?.g || 0)} g di rame per ${p?.uom === 'L' ? 'litro' : 'kg'}`} />
            <Kpi label="In 7 anni allo stesso ritmo" value={nf(kg * 7, 1)} unit="kg/ha" status={kg * 7 > 28 ? 'bad' : 'ok'} foot="limite 28 kg/ha" />
          </div>
          <Bullet value={kg} lo={0} hi={6} min={0} max={4} />
        </div>)}
    </Panel>
  );
}

/* ================= Schede di sicurezza ================= */
function Sds({ d, today, route }) {
  const g = useMemo(() => sdsGaps(d, today), [d, today]);
  const prods = byId(d.products || []);
  const [prodFilter, setProdFilter] = useState(route.id && prods[route.id] ? route.id : '');
  const gaps = g.gaps.filter(x => !prodFilter || x.productId === prodFilter);
  const send = list => {
    if (!list.length) return;
    store.batch(list.map(x => ({ kind: 'add', coll: 'sdsDispatches', obj: { customerId: x.customerId, productId: x.productId, version: x.version, date: today, channel: 'posta elettronica' } })), `Schede di sicurezza inviate: ${list.length}`);
    toast(`${nf(list.length)} invii registrati`, 'ok', { label: 'Annulla', fn: () => store.undo() });
  };
  const docs = Object.values(g.latest).map(s => ({ ...s, product: prods[s.productId], stat: g.byProduct.find(x => x.productId === s.productId) }));
  const recent = docs.filter(s => daysBetween(s.date, today) <= 90).length;
  const ufiOk = g.ufi.filter(u => u.ok).length;
  return (
    <>
      <div className="kpis">
        <Kpi label="Destinatari con la scheda in vigore" value={pct(g.coverage, 0)} foot={`${nf(g.recipients - g.missing)} su ${nf(g.recipients)} coppie cliente-prodotto`} status={g.coverage >= 0.98 ? 'ok' : g.coverage >= 0.9 ? 'warn' : 'bad'} />
        <Kpi label="Invii mancanti" value={nf(g.missing)} foot="REACH art. 31(9): destinatari degli ultimi 12 mesi" status={g.missing ? 'warn' : 'ok'} />
        <Kpi label="UFI e notifica PCN" value={`${nf(ufiOk)}/${nf(g.ufi.length)}`} foot="miscele con pericoli per la salute o fisici" status={ufiOk < g.ufi.length ? 'bad' : 'ok'} />
        <Kpi label="Revisioni negli ultimi 90 giorni" value={nf(recent)} foot="nuova versione da distribuire" />
      </div>
      {g.ufi.some(u => !u.ok) && <div className="note crit">{g.ufi.filter(u => !u.ok).map(u => `${u.name}: ${u.ufi ? 'notifica PCN da ripresentare' : 'UFI mancante'}`).join(' · ')}. Senza notifica ai centri antiveleni la miscela non può essere immessa sul mercato (CLP, allegato VIII).</div>}
      <Panel title="Invii da fare" sub="Clienti serviti nei 12 mesi prima della revisione o dopo, senza la versione in vigore" id="sds-gaps"
        actions={<>
          <Select value={prodFilter} onChange={setProdFilter} options={[{ id: '', label: 'Tutti i prodotti' }, ...g.byProduct.filter(x => x.missing).map(x => ({ id: x.productId, label: prods[x.productId]?.name || x.productId }))]} ariaLabel="Filtra per prodotto" />
          <Btn small icon={LuSend} onClick={() => send(gaps)} disabled={!gaps.length}>Registra {nf(gaps.length)} invii</Btn>
        </>} flush>
        <Table rows={gaps} pageSize={15} exportName="schede-da-inviare" empty="Tutti i destinatari hanno la scheda in vigore" cols={[
          { key: 'customer', label: 'Cliente' }, { key: 'product', label: 'Prodotto' },
          { key: 'version', label: 'Da inviare', align: 'r', render: x => `v${x.version} del ${dateIt(x.since, 'dm')}` },
          { key: 'have', label: 'Inviata', align: 'r', render: x => (x.have ? `v${x.have}` : 'nessuna') },
          { key: 'days', label: 'Da', align: 'r', render: x => `${nf(x.days)} gg` },
          { key: 'act', label: '', nosort: true, csv: false, render: x => <Btn small kind="ghost" onClick={e => { e.stopPropagation(); send([x]); }}>Inviata</Btn> },
        ]} />
      </Panel>
      <Panel title="Schede per prodotto" sub="Versione in vigore, classificazione (nel demo indicativa), UFI e notifica" flush>
        <Table rows={docs} initialSort={{ key: 'date', dir: 'desc' }} exportName="schede-di-sicurezza" cols={[
          { key: 'name', label: 'Prodotto', sort: s => s.product?.name, render: s => <b>{s.product?.name}</b> },
          { key: 'version', label: 'Versione', align: 'r', render: s => `v${s.version}` },
          { key: 'date', label: 'Data', render: s => dateIt(s.date) },
          { key: 'h', label: 'Indicazioni di pericolo', render: s => (s.product?.hazard?.h || []).join(', ') || 'nessuna', sort: s => (s.product?.hazard?.h || []).length },
          { key: 'ufi', label: 'UFI', render: s => (needsUfi(s.product) ? (s.ufi ? <span className="num small">{s.ufi}</span> : <Chip kind="crit">mancante</Chip>) : <span className="muted small">non richiesto</span>) },
          { key: 'pcnDate', label: 'PCN', render: s => (!needsUfi(s.product) ? '—' : s.pcnDate ? dateIt(s.pcnDate) : <Chip kind="crit">da notificare</Chip>) },
          { key: 'cov', label: 'Destinatari', align: 'r', sort: s => s.stat?.recipients || 0, render: s => (s.stat ? `${nf(s.stat.recipients - s.stat.missing)}/${nf(s.stat.recipients)}` : '—') },
          { key: 'changes', label: 'Modifiche' },
        ]} />
      </Panel>
    </>
  );
}

/* ================= Seveso e ADR ================= */
function Seveso({ d, today }) {
  const fin = useMemo(() => finishedStock(d), [d]), raw = useMemo(() => rawStock(d), [d]);
  const sv = useMemo(() => sevesoIndex(d), [d]);
  const [pid, setPid] = useState((d.products || []).find(p => (p.hazard?.seveso || []).includes('E1'))?.id || '');
  const [addT, setAddT] = useState(40);
  const sim = useMemo(() => (pid && addT ? sevesoIndex(d, undefined, { finished: { ...fin, [pid]: (fin[pid] || 0) + (+addT || 0) }, raw }) : null), [d, pid, addT, fin, raw]);
  const tu = useMemo(() => transportUnits(d, today, 30), [d, today]);
  const full = tu.filter(x => x.full).length;
  const ds375 = sum(tu, x => x.exemptQty);
  const env = sv.groups.find(g => g.id === 'ambiente');
  const tierKind = t => (t === 'superiore' ? 'crit' : t === 'inferiore' ? 'warn' : 'good');
  return (
    <>
      <div className="kpis">
        <Kpi label="Soglia dalle giacenze di oggi" value={sv.tier} foot={sv.declaredTier ? `notificata: soglia ${sv.declaredTier}` : 'nessuna notifica registrata'} status={sv.declaredTier && sv.declaredTier !== sv.tier ? 'bad' : 'ok'} />
        <Kpi label="Indice ambiente, soglia superiore" value={pct(env?.hi, 0)} foot={`soglia inferiore ${pct(env?.lo, 0)}`} status={env?.hi >= 1 ? 'warn' : 'ok'} />
        <Kpi label="Categorie oltre il notificato" value={nf(sv.over.length)} foot={sv.over.map(c => c.id).join(', ') || 'nessuna'} status={sv.over.length ? 'bad' : 'ok'} />
        <Kpi label="Trasporti in ADR completo (30 giorni)" value={`${nf(full)}/${nf(tu.length)}`} foot={`${nf(ds375 / 1000, 1)} t esenti con la DS 375 (confezioni ≤ 5 kg o L)`} />
      </div>
      <div className="split">
        <Panel title="Indici di sommatoria" sub="Σ quantità presente / soglia, per gruppo di pericolo (D.Lgs. 105/2015, allegato 1, nota 4)" id="sev-index">
          <div className="stack">
            {sv.groups.map(g => (
              <div key={g.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b>{g.label}</b><span className="num small">inferiore {pct(g.lo, 0)} · superiore {pct(g.hi, 0)}</span></div>
                <Bullet value={Math.min(g.hi, 3)} lo={0} hi={3} min={0} max={1} />
              </div>))}
          </div>
          <Table rows={sv.cats.filter(c => c.tonnes > 0 || sv.notified[c.id] != null)} pageSize={10} cols={[
            { key: 'id', label: 'Categoria', render: c => <span title={c.label}>{c.id}</span> },
            { key: 'tonnes', label: 'Presenti', align: 'r', render: c => `${nf(c.tonnes, 1)} t` },
            { key: 'notified', label: 'Notificate', align: 'r', render: c => (sv.notified[c.id] != null ? `${nf(sv.notified[c.id], 0)} t` : '—') },
            { key: 'q', label: 'Soglie', align: 'r', render: c => `${nf(c.q[0])} / ${nf(c.q[1])} t` },
            { key: 'hi', label: 'q/Q sup.', align: 'r', render: c => <span className={c.hi >= 1 ? 'neg' : ''}>{nf(c.hi, 2)}</span> },
          ]} />
        </Panel>
        <Panel title="Che cosa c’è in magazzino" sub="Prodotti e materie prime con una categoria Seveso, dalla classificazione delle schede di sicurezza (nel demo indicativa)">
          <Bars data={sv.items.slice(0, 10).map(x => ({ key: x.kind + x.id + x.cat, label: `${x.name} · ${x.cat}`, value: x.tonnes, color: x.kind === 'prodotto' ? 'var(--s1)' : 'var(--s4)' }))} unit="t" decimals={1} ariaLabel="Giacenze per categoria Seveso" />
        </Panel>
      </div>
      <div className="split">
        <Panel title="Prima di produrre per la campagna" sub="Simula una produzione in più a magazzino e guarda gli indici" id="sev-sim">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label="Prodotto"><Select value={pid} onChange={setPid} options={(d.products || []).filter(p => (p.hazard?.seveso || []).length).map(p => ({ id: p.id, label: `${p.name} (${p.hazard.seveso.join(', ')})` }))} /></Field>
            <Field label="Tonnellate in più"><NumInput value={addT} onChange={v => setAddT(v ?? 0)} decimals={0} min={0} ariaLabel="Tonnellate in più" /></Field>
          </div>
          {sim && <div className="kpis two" style={{ marginTop: 10 }}>
            {sim.groups.filter(g => g.hi > 0.01).map(g => { const b = sv.groups.find(x => x.id === g.id); return <Kpi key={g.id} label={g.label} value={pct(g.hi, 0)} foot={`oggi ${pct(b.hi, 0)} della soglia superiore`} status={g.hi >= 1 && b.hi < 1 ? 'bad' : 'ok'} />; })}
            <Kpi label="Soglia" value={sim.tier} foot={sim.tier !== sv.tier ? `cambia da «${sv.tier}»` : 'invariata'} status={sim.tier !== sv.tier ? 'bad' : 'ok'} />
          </div>}
          {sim && sim.over.length > sv.over.length && <div className="note warn">Con questa produzione si supera la quantità notificata di {sim.over.filter(c => !sv.over.some(o => o.id === c.id)).map(c => c.id).join(', ')}: aggiornare la notifica prima di stoccare.</div>}
        </Panel>
        <Panel title="ADR: unità di trasporto degli ultimi 30 giorni" sub={`Punti = Σ quantità × moltiplicatore della categoria; oltre ${nf(AGRO_RULES.adrLimit)} punti servono veicolo, conducente e documenti ADR`} flush>
          <Table rows={tu} pageSize={10} exportName="trasporti-adr" initialSort={{ key: 'points', dir: 'desc' }} cols={[
            { key: 'date', label: 'Data', render: x => dateIt(x.date, 'dm') }, { key: 'customer', label: 'Cliente' },
            { key: 'tonnes', label: 't', align: 'r', render: x => nf(x.tonnes, 1) },
            { key: 'points', label: 'Punti', align: 'r', render: x => nf(x.points) },
            { key: 'full', label: 'Regime', render: x => <Chip kind={x.full ? 'warn' : 'good'} icon={x.full ? LuTruck : undefined}>{x.full ? 'ADR completo' : 'esenzione 1.1.3.6'}</Chip>, sort: x => (x.full ? 1 : 0) },
          ]} />
        </Panel>
      </div>
      <p className="small muted">Soglie e regole con riferimento e fonte in Regolatorio › Regole e fonti (verificate il {dateIt(RULES_CHECKED_AT)}). La classificazione dei prodotti del demo è indicativa: in azienda viene dalle schede di sicurezza. UN3077 e UN3082 in imballaggi fino a 5 kg o 5 L non sono soggetti all’ADR (disposizione speciale 375, facoltativa).</p>
    </>
  );
}


/* ================= Regole e fonti ================= */
const ST_KIND = { verificato: 'good', parziale: 'warn', stima: 'outline' };
const getPath = (o, k) => k.split('.').length > 1 && k.startsWith('pNonRenewal.') ? o.pNonRenewal?.[k.slice(12)] : o[k];
function Fonti({ d }) {
  const R = rulesOf(d), saved = d.settings?.agro?.rules || {};
  const setEst = (k, v) => store.settings(s => {
    const a = s.agro || {}, r = { ...(a.rules || {}) };
    if (k.startsWith('pNonRenewal.')) r.pNonRenewal = { ...(r.pNonRenewal || {}), [k.slice(12)]: v };
    else r[k] = v;
    return { ...s, agro: { ...a, rules: r } };
  }, 'Stima regolatoria modificata');
  const reset = () => { store.settings(s => ({ ...s, agro: { ...(s.agro || {}), rules: {} } }), 'Stime regolatorie riportate ai valori di partenza'); toast('Stime riportate ai valori di partenza', 'ok', { label: 'Annulla', fn: () => store.undo() }); };
  const ver = AGRO_RULE_SOURCES.filter(r => r.status === 'verificato').length;
  return (
    <>
      <div className="kpis">
        <Kpi label="Regole verificate" value={`${nf(ver)}/${nf(AGRO_RULE_SOURCES.length)}`} foot={`controllo del ${dateIt(RULES_CHECKED_AT)}`} status={ver === AGRO_RULE_SOURCES.length ? 'ok' : 'warn'} />
        <Kpi label="Da completare" value={nf(AGRO_RULE_SOURCES.length - ver)} foot={AGRO_RULE_SOURCES.filter(r => r.status !== 'verificato').map(r => r.area).join(', ') || 'nessuna'} />
        <Kpi label="Stime dell’azienda" value={nf(AGRO_ESTIMATES.length)} foot={Object.keys(saved).length ? 'modificate in questo archivio' : 'valori di partenza'} />
      </div>
      <Panel title="Regole usate dai calcoli" sub="Riferimento normativo, fonte consultata e stato della verifica. Prima di una decisione vale sempre il testo in vigore e il decreto del prodotto" id="reg-sources" flush>
        <Table rows={AGRO_RULE_SOURCES} pageSize={30} exportName="regole-e-fonti" cols={[
          { key: 'area', label: 'Ambito' },
          { key: 'rule', label: 'Regola', render: r => <span>{r.rule}{r.note && <div className="muted small">{r.note}</div>}</span> },
          { key: 'value', label: 'Valore', render: r => <b>{r.value}</b> },
          { key: 'law', label: 'Riferimento' },
          { key: 'status', label: 'Stato', render: r => <Chip kind={ST_KIND[r.status] || 'outline'}>{r.status}</Chip> },
          { key: 'sources', label: 'Fonti', csv: true, render: r => (r.sources.length ? <span className="small" style={{ wordBreak: 'break-all' }}>{r.sources.map((u, i) => <div key={i}><a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https?:\/\//, '').slice(0, 60)}{u.length > 68 ? '…' : ''}</a></div>)}</span> : <span className="muted small">indicazione tecnica</span>) },
        ]} />
      </Panel>
      <Panel title="Stime dell’azienda" sub="Non sono regole: probabilità e parametri usati per ricavi a rischio e piani di smaltimento. Si salvano nell’archivio" id="reg-estimates"
        actions={<Btn small kind="ghost" icon={LuRotateCcw} onClick={reset} disabled={!Object.keys(saved).length}>Valori di partenza</Btn>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {AGRO_ESTIMATES.map(e => (
            <Field key={e.key} label={`${e.label} (${e.unit})`}>
              <NumInput id={`est-${e.key.replace(/[^a-z]/gi, '')}`} value={(getPath(R, e.key) ?? 0) * e.scale} decimals={e.scale === 100 ? 0 : 0} min={e.min} max={e.max}
                onChange={v => v != null && setEst(e.key, v / e.scale)} ariaLabel={e.label} />
            </Field>))}
        </div>
      </Panel>
    </>
  );
}
