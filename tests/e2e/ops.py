"""Operazioni complete: accettazione lotto, reclamo, offerta, listino, scenario, acqua, rifiuti, questionario ESG, importazione CSV,
fermo, ordine di lavoro, inventario fisico, backup e ripristino, annulla."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[2]
BASE = (ROOT / 'dist' / 'FeedOS-16.html').as_uri()
FIX = str(ROOT / 'tests' / 'e2e' / 'fixtures') + '/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None); ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
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
        # con l'ancora del demo a oggi il cliente proposto può essere oltre il fido: si indica chi autorizza l'eccezione
        if await pg.locator('#of-credit').count(): await pg.fill('#of-credit', 'Amministrazione')
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
        # 6b acqua: lettura del contatore con consumo calcolato dalla lettura precedente
        await go('esg.acqua.nuova'); await pg.wait_for_timeout(600)
        await pg.locator('#esg-water-form .seg button', has_text='Pozzo').click(); await pg.wait_for_timeout(200)
        await pg.locator('#esg-water-form input[type=month]').fill('2030-01')
        await pg.locator('#esg-water-form .btn.primary').click(); await pg.wait_for_timeout(300)
        print('6b mese futuro:', await toast())
        await pg.locator('#esg-water-form input[type=month]').fill(await pg.evaluate("() => new Date().toISOString().slice(0, 7)"))
        before = await pg.evaluate("() => document.querySelector('.kpi .val')?.innerText")
        reading = pg.get_by_label('Lettura del contatore'); await reading.fill('99999'); await reading.press('Tab')
        cons = pg.get_by_label('Consumo del mese'); await cons.fill('150'); await cons.press('Tab')
        await pg.locator('#esg-water-form .btn.primary').click(); await pg.wait_for_timeout(500)
        print('6b acqua:', await toast(), '· righe', await pg.evaluate("() => document.querySelectorAll('table.t tbody tr').length"))
        # 6c rifiuto pericoloso a smaltimento
        await go('esg.rifiuti.nuovo'); await pg.wait_for_timeout(600)
        await pg.locator('#esg-waste-form select').first.select_option('15 01 10*'); await pg.wait_for_timeout(150)
        haz = await pg.evaluate("() => document.querySelector('#esg-waste-form .chip')?.innerText")
        kg = pg.get_by_label('Quantità in kg'); await kg.fill('42'); await kg.press('Tab')
        await pg.locator('#esg-waste-form .btn.primary').click(); await pg.wait_for_timeout(500)
        print('6c rifiuto:', haz, '·', await toast())
        # 6d questionario: risposta, valore proposto dai dati, annulla
        await go('esg.questionario.generale'); await pg.wait_for_timeout(600)
        await pg.locator('.suggest').first.click(); await pg.wait_for_timeout(400)
        print('6d questionario (proposta):', await pg.evaluate("() => document.querySelector('#q-gen-emp .pill[aria-pressed=true]')?.innerText"))
        await go('esg.questionario.sicurezza'); await pg.wait_for_timeout(500)
        await pg.locator('#q-hs-iso .pill', has_text='Sì').click(); await pg.wait_for_timeout(400)
        await go('esg.cruscotto'); await pg.wait_for_timeout(600)
        score1 = await pg.evaluate("() => document.querySelector('.hero-score .ring-c b')?.innerText")
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(500)
        score0 = await pg.evaluate("() => document.querySelector('.hero-score .ring-c b')?.innerText")
        print('   maturità con ISO 45001:', score1, '→ dopo Ctrl Z:', score0, '·', await toast())
        # 7 importazione CSV dei prezzi
        await go('dati.importa'); await pg.wait_for_timeout(500)
        await pg.locator('#dati-csv input[type=file]').set_input_files(FIX + 'prezzi.csv'); await pg.wait_for_timeout(600)
        note = await pg.evaluate("() => document.querySelector('#dati-csv .note')?.innerText")
        await pg.locator('#dati-csv .btn.primary', has_text='Applica').click(); await pg.wait_for_timeout(500)
        print('7 CSV:', note, '·', await toast())
        # 7b produzione: fermo registrato, sostituzione della trafila pianificata ed eseguita, conta fisica registrata
        await go('produzione.oee'); await pg.wait_for_timeout(600)
        await pg.locator('#oee-log .btn.primary', has_text='Registra il fermo').click(); await pg.wait_for_timeout(400)
        print('7b fermo:', await toast())
        await go('produzione.manutenzione'); await pg.wait_for_timeout(600)
        await pg.get_by_text('Pianifica la sostituzione', exact=True).first.click(); await pg.wait_for_timeout(400)
        print('7c trafila:', await toast())
        await pg.locator('table.t tbody tr.click', has_text='Trafila linea pellet 2').first.click(); await pg.wait_for_timeout(500)
        await pg.locator('.drawer .btn.primary', has_text='Registra l’esecuzione').first.click(); await pg.wait_for_timeout(400)
        print('   eseguita:', await toast(), '·', await pg.evaluate("() => [...document.querySelectorAll('.drawer .eyebrow')].map(x => x.innerText).find(t => /^contatore/i.test(t))"))
        await pg.keyboard.press('Escape')
        await go('produzione.bilancio'); await pg.wait_for_timeout(600)
        await pg.locator('#mb-table .btn.primary', has_text='Registra').first.click(); await pg.wait_for_timeout(300)
        await pg.locator('.modal .btn.primary').click(); await pg.wait_for_timeout(500)
        print('7d inventario:', await toast())
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
