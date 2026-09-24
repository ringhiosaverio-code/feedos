"""Operazioni complete: accettazione lotto, reclamo, offerta, listino, scenario, backup e ripristino, importazione CSV, annulla."""
import asyncio, json
from playwright.async_api import async_playwright
BASE = 'file:///tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f16/dist/FeedOS-16.html'
FIX = '/tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f16/tests/e2e/fixtures/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content h1'); await pg.wait_for_timeout(800)
        go = lambda h: pg.evaluate(f"location.hash = '#{h}'")
        toast = lambda: pg.evaluate("() => [...document.querySelectorAll('.toast span')].map(x => x.innerText).pop()")
        # 1 arrivo + accettazione del lotto
        await go('acquisti.ordini'); await pg.wait_for_timeout(500)
        await pg.get_by_text('Arrivo', exact=True).first.click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Registra arrivo', exact=True).click(); await pg.wait_for_timeout(500)
        await go('qualita.lotti-mp'); await pg.wait_for_timeout(500)
        await pg.get_by_text('In attesa', exact=True).first.click(); await pg.wait_for_timeout(300)
        await pg.locator('table.t tbody tr.click').first.click(); await pg.wait_for_timeout(400)
        await pg.locator('.drawer input').nth(2).fill('3,1'); await pg.locator('.drawer input').nth(2).press('Tab')
        await pg.locator('.drawer .ft .btn.primary').click(); await pg.wait_for_timeout(400)
        print('1 accettazione:', await toast())
        await pg.keyboard.press('Escape')
        # 2 nuovo reclamo
        await go('qualita.reclami.nuovo'); await pg.wait_for_timeout(500)
        await pg.fill('#rc-desc', 'Pellet con molta polvere sul fondo del silo'); await pg.get_by_text('Registra reclamo', exact=True).click(); await pg.wait_for_timeout(600)
        print('2 reclamo:', await toast(), '·', await pg.evaluate("() => location.hash"))
        await pg.keyboard.press('Escape')
        # 3 nuova offerta al prezzo obiettivo
        await go('commerciale.offerte.nuova'); await pg.wait_for_timeout(500)
        await pg.locator('#com-offer .btn', has_text='Prezzo obiettivo').click(); await pg.wait_for_timeout(200)
        esito = await pg.evaluate("() => document.querySelector('.offer-check .chip')?.innerText")
        await pg.get_by_text('Registra come inviata', exact=True).click(); await pg.wait_for_timeout(500)
        print('3 offerta:', esito, '·', await toast())
        await pg.keyboard.press('Escape')
        # 4 listino allineato
        await go('commerciale.listino'); await pg.wait_for_timeout(500)
        await pg.get_by_text('Allinea al prezzo obiettivo', exact=True).click(); await pg.wait_for_timeout(200)
        await pg.locator('.modal .btn.primary').click(); await pg.wait_for_timeout(500)
        print('4 listino:', await toast(), '· segnali economia:', await pg.evaluate("() => [...document.querySelectorAll('.nav a')].find(a => a.innerText.includes('Economia'))?.innerText.replace(/\\n/g,' ')"))
        # 5 annulla (Ctrl Z) e ripeti
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(400); u = await toast()
        await pg.keyboard.press('Control+y'); await pg.wait_for_timeout(400)
        print('5 annulla/ripeti:', u, '→', await toast())
        # 6 scenario salvato
        await go('economia.scenari'); await pg.wait_for_timeout(600)
        await pg.get_by_text('Energia +25%', exact=True).click(); await pg.wait_for_timeout(900)
        await pg.get_by_text('Salva', exact=True).click(); await pg.wait_for_timeout(400)
        print('6 scenario:', await toast(), '·', await pg.evaluate("() => document.querySelector('#eco-results .val')?.innerText"))
        # 7 importazione CSV dei prezzi
        await go('dati.importa'); await pg.wait_for_timeout(500)
        await pg.locator('#dati-csv input[type=file]').set_input_files(FIX + 'prezzi.csv'); await pg.wait_for_timeout(600)
        note = await pg.evaluate("() => document.querySelector('#dati-csv .note')?.innerText")
        await pg.locator('#dati-csv .btn.primary', has_text='Applica').click(); await pg.wait_for_timeout(500)
        print('7 CSV:', note, '·', await toast())
        # 8 backup: esportazione e ripristino
        await go('dati.archivio'); await pg.wait_for_timeout(500)
        async with pg.expect_download() as dl: await pg.get_by_text('Esporta backup completo', exact=True).click()
        d = await dl.value; path = FIX + 'backup.json'; await d.save_as(path)
        size = len(open(path).read()); j = json.load(open(path))
        print('8 backup:', d.suggested_filename, f'{size/1e6:.1f} MB', '· formato', j['format'], '· formule', len(j['data']['formulas']), '· prezzo mais', [i['price'] for i in j['data']['ingredients'] if i['id'] == 'mais'])
        await go('dati.impostazioni'); await pg.wait_for_timeout(300)
        await go('dati.archivio'); await pg.wait_for_timeout(400)
        await pg.locator('#dati-backup input[type=file]').set_input_files(path); await pg.wait_for_timeout(400)
        await pg.locator('.modal .btn.primary').click(); await pg.wait_for_timeout(1200)
        print('   ripristino:', await toast())
        # 9 rigenera demo
        await pg.get_by_text('Rigenera il mangimificio dimostrativo', exact=True).click(); await pg.wait_for_timeout(200)
        await pg.locator('.modal .btn.primary').click(); await pg.wait_for_timeout(1500)
        print('9 demo:', await toast(), '·', await pg.evaluate("() => location.hash"))
        # 10 persistenza: ricarica e verifica
        await pg.reload(); await pg.wait_for_selector('.content h1'); await pg.wait_for_timeout(800)
        print('10 dopo ricarica:', await pg.evaluate("() => document.querySelector('.dataset')?.innerText.replace(/\\n/g,' ')"))
        print('errori:', errs or 'nessuno')
        await b.close()
asyncio.run(main())
