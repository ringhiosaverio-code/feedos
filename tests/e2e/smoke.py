"""Collaudo di tutte le pagine e di tutte le schede laterali: errori della console, pagine o sezioni che non si aprono (Guard),
sbordi orizzontali, tempi. Esce con codice 1 se ci sono errori.  python3 tests/e2e/smoke.py [larghezza] [tema] [file] [starter]"""
import asyncio, sys, time, os
from pathlib import Path
from playwright.async_api import async_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
theme = sys.argv[2] if len(sys.argv) > 2 else 'light'
FILE = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3].endswith('.html') else 'FeedOS-16.html'
BASE = (Path(__file__).resolve().parents[2] / 'dist' / FILE).as_uri()
STARTER = 'starter' in sys.argv
AGRO = FILE.startswith('FitoOS')  # edizione agrofarmaci: aree e schede proprie, niente parti del mangimificio
ROUTES = ['oggi', 'oggi.cruscotto', 'oggi.attivita', 'oggi.registro',
  'direzione', 'direzione.sintesi', 'direzione.conto', 'direzione.ponte', 'direzione.budget', 'direzione.costi', 'direzione.chiusura', 'direzione.report',
  'finanza', 'finanza.crediti', 'finanza.cassa', 'finanza.circolante', 'finanza.rimanenze', 'finanza.parametri',
  'gemello',
  'formulazione', 'formulazione.formule.f-br21', 'formulazione.formule.nuova', 'formulazione.materie', 'formulazione.specifiche',
  'acquisti', 'acquisti.fabbisogni.mais', 'acquisti.scorte', 'acquisti.ordini', 'acquisti.fornitori', 'acquisti.varianze', 'acquisti.mercati', 'acquisti.mercati.olio',
  'produzione', 'produzione.registro', 'produzione.registro.nuova', 'produzione.oee', 'produzione.energia', 'produzione.energia.L1', 'produzione.manutenzione', 'produzione.bilancio',
  'qualita', 'qualita.lotti-mp', 'qualita.analisi', 'qualita.reclami', 'qualita.reclami.nuovo', 'qualita.richiamo',
  'commerciale', 'commerciale.offerte', 'commerciale.offerte.nuova', 'commerciale.listino', 'commerciale.visite', 'commerciale.rete',
  'economia', 'economia.margini', 'economia.redditivita', 'economia.pareggio', 'economia.scenari', 'economia.previsioni',
  'esg', 'esg.questionario', 'esg.questionario.persone', 'esg.questionario.filiera', 'esg.acqua', 'esg.acqua.nuova', 'esg.rifiuti', 'esg.rifiuti.nuovo', 'esg.indicatori', 'esg.energia', 'esg.passaporto', 'esg.vsme', 'esg.tesi',
  'esg.cruscotto', 'esg.clima', 'esg.filiera', 'esg.ambiente', 'esg.persone', 'esg.governance', 'esg.piano', 'esg.rischi',
  'dati', 'dati.importa', 'dati.anagrafiche', 'dati.qualita', 'dati.registro', 'dati.impostazioni',
  'direzione.conto~ytd~ap', 'economia.margini~mese-chiuso~prec']
# percorsi in più dei pacchetti: tests/e2e/routes-*.txt, uno per riga (le righe vuote e quelle che iniziano con # si saltano)
for _f in sorted((Path(__file__).resolve().parent).glob('routes-*.txt')):
    for _l in _f.read_text(encoding='utf-8').splitlines():
        _r = _l.strip()
        if _r and not _r.startswith('#') and _r not in ROUTES: ROUTES.append(_r)
if AGRO:
    HIDDEN = ('formulazione', 'gemello', 'esg.cruscotto', 'esg.passaporto', 'esg.filiera', 'esg.indicatori', 'esg.questionario', 'esg.tesi', 'esg.impronta',
              'economia.scenari', 'qualita.analisi', 'acquisti.mercati')
    SWAP = {'acquisti.fabbisogni.mais': 'acquisti.fabbisogni.cuoh', 'esg.vsme.questionari.q-caseificio-sila': 'esg.vsme.questionari.q-gdo-ortofrutta'}
    ROUTES = [SWAP.get(r, r) for r in ROUTES if not any(r == h or r.startswith(h + '.') or r.startswith(h + '~') for h in HIDDEN)]
    ROUTES += ['regolatorio', 'regolatorio.registrazioni', 'regolatorio.registrazioni.reg-fl50sc', 'regolatorio.sostanze', 'regolatorio.sostanze.rame',
               'regolatorio.sds', 'regolatorio.sds.p-cu30wg', 'regolatorio.seveso', 'commerciale.campagne', 'commerciale.campagne.premi', 'commerciale.campagne.resi',
               'esg.co2', 'esg.co2.vite', 'esg.co2.melo']
PERIOD_AREAS = {'oggi', 'direzione', 'finanza', 'gemello', 'acquisti', 'produzione', 'qualita', 'commerciale', 'economia'}
# scheda laterale: (tipo, ricerca nella barra comandi, tipo atteso del primo risultato)
DRAWERS = [('product', 'cuprarvo' if AGRO else 'lt18', 'Prodotto'), ('ingredient', 'mp01', 'Materia prima'), ('customer', 'cliente', 'Cliente'), ('offer', 'of-', 'Offerta'),
  ('complaint', 'rc-', 'Reclamo'), ('lot', 'lotto prodotto', 'Lotto prodotto'), ('ingLot', 'lotto materia prima', 'Lotto materia prima'),
  ('agent', 'agente benedetti' if AGRO else 'agente cosenza', 'Agente'), ('supplier', 'fornitore', 'Fornitore'), ('asset', 'componente', 'Componente')]
OPTIONAL = {'supplier', 'asset'}  # nel demo compaiono quando i pacchetti aggiungono fornitori e componenti
GUARD_JS = """() => {
  const t = s => [...document.querySelectorAll(s)].map(x => x.innerText);
  return [...t('.guard-err h1'), ...t('.drawer .hd').filter(x => x.includes('non si è aperta')), ...t('.note').filter(x => x.includes('sezione non si è aperta'))];
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None)
        ctx = await b.new_context(viewport={'width': W, 'height': 900}, color_scheme=theme, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []; guard = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400]))
        pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text[:300]}') if m.type in ('error', 'warning') else None)
        t0 = time.time(); await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content h1', timeout=20000)
        print(f'avvio {time.time() - t0:.2f} s')
        if STARTER:
            await pg.evaluate("location.hash = '#dati.archivio'"); await pg.wait_for_timeout(500)
            await pg.get_by_text('Inizia con i dati della tua azienda', exact=True).click(); await pg.wait_for_timeout(200)
            await pg.locator('.modal .btn.danger, .modal .btn.primary').last.click(); await pg.wait_for_timeout(1200)
            print('archivio aziendale vuoto:', await pg.evaluate("() => document.querySelector('.dataset')?.innerText || 'nessun riquadro demo'"))
        if await pg.evaluate("() => !!document.querySelector('.banner')"):
            errs.append('avviso d’archivio inatteso: ' + await pg.evaluate("() => document.querySelector('.banner').innerText"))
        over = []; slow = []
        for r in ROUTES:
            t = time.time()
            await pg.evaluate(f"location.hash = '#{r}'"); await pg.wait_for_timeout(350)
            dt = time.time() - t
            m = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h1: document.querySelector('.content h1')?.innerText, pbar: !!document.querySelector('.subbar .pbar')})")
            if m['sw'] > m['cw'] + 1: over.append((r, m['sw'], m['cw']))
            if dt > 1.2: slow.append((r, round(dt, 2)))
            if not m['h1']: errs.append('NESSUN TITOLO in ' + r)
            area = r.split('~')[0].split('.')[0]
            if m['pbar'] != (area in PERIOD_AREAS): errs.append(f'barra del periodo {"assente" if area in PERIOD_AREAS else "inattesa"} in {r}')
            for g in await pg.evaluate(GUARD_JS): guard.append(f'{r}: {g[:120]}')
        # il periodo nell'indirizzo arriva alla barra
        await pg.evaluate("location.hash = '#direzione.conto~ytd~ap'"); await pg.wait_for_timeout(300)
        lbl = await pg.evaluate("() => document.querySelector('.pbar .p-cmp select')?.value")
        if lbl != 'ap': errs.append(f'confronto dall’indirizzo non applicato: {lbl}')
        await pg.evaluate("location.hash = '#oggi'"); await pg.wait_for_timeout(200)
        # schede laterali dalla barra comandi
        opened = []
        for kind, q, want in DRAWERS:
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(80)
            await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(200)
            await pg.keyboard.type(q); await pg.wait_for_timeout(250)
            got = await pg.evaluate("() => document.querySelector('.pal li .g')?.innerText || ''")
            if got != want:
                await pg.keyboard.press('Escape')
                if kind not in OPTIONAL and not STARTER: errs.append(f'nessuna voce «{want}» per la scheda {kind} (primo risultato: {got or "nessuno"})')
                continue
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
            ok = await pg.evaluate("() => !!document.querySelector('.drawer')")
            if not ok: errs.append('scheda non aperta: ' + kind)
            else: opened.append(kind)
            for g in await pg.evaluate(GUARD_JS): guard.append(f'scheda {kind}: {g[:120]}')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        print('schede aperte:', ', '.join(opened) or 'nessuna')
        # barra comandi con domanda
        await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(200)
        await pg.keyboard.type('e se rame +10%' if AGRO else 'e se mais +10%'); await pg.wait_for_timeout(250)
        first = await pg.evaluate("() => document.querySelector('.pal li')?.innerText") or ''
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(900)
        h = await pg.evaluate("() => location.hash + ' · ' + (document.querySelector('#eco-results .val')?.innerText || '')")
        print('palette:', first.replace('\n', ' ') if first else None, '→', h)
        # vista Agente: scelta dell'agente nella testata, aree di direzione non previste
        if W > 720:
            await pg.locator('.tb select').select_option('agente'); await pg.wait_for_timeout(300)
            for a in ('direzione', 'finanza', 'economia'):
                await pg.evaluate(f"location.hash = '#{a}'"); await pg.wait_for_timeout(300)
                if 'Area non prevista per la vista Agente' not in await pg.evaluate("() => document.querySelector('.content').innerText"): errs.append('vista Agente: ' + a + ' non bloccata')
            await pg.evaluate("location.hash = '#commerciale'"); await pg.wait_for_timeout(300)
            if not await pg.evaluate("() => !!document.querySelector('.subbar .agent-pick select')"): errs.append('vista Agente: manca la scelta dell’agente')
            await pg.locator('.tb select').select_option('direzione'); await pg.wait_for_timeout(200)
        print('sbordi:', over or 'nessuno'); print('lente (>1,2 s):', slow or 'nessuna')
        print('pagine o sezioni non aperte (Guard):', guard or 'nessuna')
        print('errori:', errs[:15] or 'nessuno')
        await b.close()
        return 1 if errs or guard else 0
sys.exit(asyncio.run(main()))
