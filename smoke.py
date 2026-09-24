"""Collaudo di tutte le pagine: errori della console, sbordi orizzontali, tempi. python3 tests/e2e/smoke.py [larghezza] [tema] [file]"""
import asyncio, sys, time, json
from playwright.async_api import async_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
theme = sys.argv[2] if len(sys.argv) > 2 else 'light'
FILE = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3].endswith('.html') else 'FeedOS-16.html'
BASE = f'file:///tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f16/dist/{FILE}'
ROUTES = ['oggi', 'oggi.attivita', 'oggi.registro', 'gemello',
  'formulazione', 'formulazione.formule.f-br21', 'formulazione.formule.nuova', 'formulazione.materie', 'formulazione.specifiche',
  'acquisti', 'acquisti.fabbisogni.mais', 'acquisti.scorte', 'acquisti.ordini', 'acquisti.mercati', 'acquisti.mercati.olio',
  'produzione', 'produzione.registro', 'produzione.registro.nuova', 'produzione.energia', 'produzione.energia.L1',
  'qualita', 'qualita.lotti-mp', 'qualita.analisi', 'qualita.reclami', 'qualita.reclami.nuovo', 'qualita.richiamo',
  'commerciale', 'commerciale.offerte', 'commerciale.offerte.nuova', 'commerciale.listino', 'commerciale.visite', 'commerciale.rete',
  'economia', 'economia.scenari', 'economia.previsioni',
  'esg', 'esg.energia', 'esg.passaporto', 'esg.vsme', 'esg.tesi',
  'dati', 'dati.importa', 'dati.registro', 'dati.impostazioni']
DRAWERS = [('product', 'p-lt18'), ('ingredient', 'mais'), ('customer', 'c-1'), ('offer', 'of-1'), ('complaint', 'rc-1'), ('lot', None), ('ingLot', None)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': 900}, color_scheme=theme, device_scale_factor=1)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400]))
        pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text[:300]}') if m.type in ('error', 'warning') else None)
        t0 = time.time(); await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content h1', timeout=20000)
        print(f'avvio {time.time() - t0:.2f} s')
        if 'starter' in sys.argv:
            await pg.evaluate("location.hash = '#dati.archivio'"); await pg.wait_for_timeout(500)
            await pg.get_by_text('Inizia con i dati della tua azienda', exact=True).click(); await pg.wait_for_timeout(200)
            await pg.locator('.modal .btn.danger, .modal .btn.primary').last.click(); await pg.wait_for_timeout(1200)
            print('archivio aziendale vuoto:', await pg.evaluate("() => document.querySelector('.dataset')?.innerText || 'nessun riquadro demo'"))
        over = []; slow = []
        for r in ROUTES:
            t = time.time()
            await pg.evaluate(f"location.hash = '#{r}'"); await pg.wait_for_timeout(350)
            dt = time.time() - t
            m = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h1: document.querySelector('.content h1')?.innerText})")
            if m['sw'] > m['cw'] + 1: over.append((r, m['sw'], m['cw']))
            if dt > 1.2: slow.append((r, round(dt, 2)))
            if not m['h1']: errs.append('NESSUN TITOLO in ' + r)
            await pg.evaluate("() => { const u = window.__ui; }")
        # schede laterali
        ids = await pg.evaluate("() => null")
        for kind, id_ in DRAWERS:
            await pg.evaluate(f"location.hash = '#qualita'"); await pg.wait_for_timeout(200)
            try:
                if kind == 'lot': await pg.locator('table.t tbody tr.click').first.click(timeout=2000)
                elif kind == 'ingLot':
                    await pg.evaluate("location.hash = '#qualita.lotti-mp'"); await pg.wait_for_timeout(300); await pg.locator('table.t tbody tr.click').first.click(timeout=2000)
            except Exception:
                if 'starter' not in sys.argv: errs.append('riga non trovata per ' + kind)
                continue
            else:
                await pg.evaluate("location.hash = '#oggi'"); await pg.wait_for_timeout(150)
                await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(150)
            await pg.wait_for_timeout(250)
            if kind not in ('lot', 'ingLot'):
                await pg.keyboard.press('Escape')
            ok = await pg.evaluate("() => !!document.querySelector('.drawer')")
            if kind in ('lot', 'ingLot') and not ok and 'starter' not in sys.argv: errs.append('scheda non aperta: ' + kind)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(120)
        # barra comandi con domanda
        await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(200)
        await pg.keyboard.type('e se mais +10%'); await pg.wait_for_timeout(250)
        first = await pg.evaluate("() => document.querySelector('.pal li')?.innerText") or ''
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(900)
        h = await pg.evaluate("() => location.hash + ' · ' + (document.querySelector('#eco-results .val')?.innerText || '')")
        print('palette:', first.replace('\n', ' ') if first else None, '→', h)
        print('sbordi:', over or 'nessuno'); print('lente (>1,2 s):', slow or 'nessuna')
        print('errori:', errs[:15] or 'nessuno')
        await b.close()
asyncio.run(main())
