/* FeedOS 17 · Punti di innesto dei pacchetti nelle schede laterali e nel menu (fondazione).
 * DrawerHost apre anche le schede di EXTRA_DRAWERS; la scheda cliente mostra CUSTOMER_SECTIONS dopo i KPI,
 * la scheda prodotto PRODUCT_SECTIONS. Ogni innesto è isolato: un errore mostra un avviso, non chiude la scheda. */
import React from 'react';
import { AgentD } from './agenti.jsx';
import { SupplierD } from './fornitori.jsx';
import { AssetD } from './manutenzione.jsx';
import { CustomerProfit } from './redditivita.jsx';
import { CustomerCredit } from './finanza.jsx';
import { ProductActualVsStd } from './varianze.jsx';
import { DqBadge } from './qualitaDati.jsx';

export { AgentD, SupplierD, AssetD, CustomerProfit, CustomerCredit, ProductActualVsStd, DqBadge };

/** Schede laterali aggiunte dai pacchetti: tipo → componente ({d, id}). */
export const EXTRA_DRAWERS = { agent: AgentD, supplier: SupplierD, asset: AssetD };
/** Sezioni della scheda cliente ({d, id}), in ordine. */
export const CUSTOMER_SECTIONS = [CustomerProfit, CustomerCredit];
/** Sezioni della scheda prodotto ({d, id}), in ordine. */
export const PRODUCT_SECTIONS = [ProductActualVsStd];

/** Isola un innesto: se si interrompe mostra fallback (di base un avviso breve) invece di far cadere la scheda. */
export class SlotGuard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.warn('FeedOS: sezione non mostrata', err); } catch { /* ignora */ } }
  render() {
    if (!this.state.err) return this.props.children;
    return this.props.fallback !== undefined ? this.props.fallback : <div className="note warn small" role="status">Questa sezione non si è aperta: i dati salvati non sono stati toccati.</div>;
  }
}
