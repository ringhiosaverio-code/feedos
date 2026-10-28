"""Salvataggio dei file dentro un visualizzatore come claude.ai, simulato con un window.claude finto (capacità «downloads»):
backup JSON e CSV passano da downloads.save con nome ed estensione ammessi; il rifiuto di chi guarda non dà errori; una
richiesta già aperta, un formato rifiutato o una vista senza permesso mostrano un avviso chiaro; senza visualizzatore il file
si scarica dal browser; dentro il visualizzatore la stampa spiega cosa fare. Esce con codice 1 se qualcosa non va.
python3 tests/e2e/downloads.py [file]  (predefinito: DifesaOS-demo.html)"""
import asyncio, json, sys, os
from pathlib import Path
from playwright.async_api import async_playwright

FILE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith('.html') else 'DifesaOS-demo.html'
BASE = (Path(__file__).resolve().parents[2] / 'dist' / FILE).as_uri()
ALLOWED = {'gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip', 'fig'}

# mode: 'ok' accetta; 'declined' / 'rate_limited' / 'rejected_extension' rifiutano con quel codice; 'null' = capacità assente
MOCK = """mode => {
  window.__saved = []; window.__printed = 0;
  window.print = () => { window.__printed++; };
  window.claude = { use: async name => {
    if (name !== 'downloads' || mode === 'null') return null;
    return { save: async ({ filename, data }) => {
      const text = typeof data === 'string' ? data : await data.text();
      window.__saved.push({ filename, size: text.length, head: text.slice(0, 200), blob: data instanceof Blob });
      if (mode !== 'ok') throw { code: mode, message: mode };
      return { status: 'saved' };
    } };
  } };
}"""

async def toast_text(pg):
    await pg.wait_for_timeout(400)
    return await pg.evaluate("() => [...document.querySelectorAll('.toast, .toasts > *')].map(t => t.innerText).join(' | ')")

async def run(p, mode, errs):
    b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None)
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    if mode != 'nohost':
        await ctx.add_init_script(f"({MOCK})('{mode}')")
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{mode}: PAGEERROR {str(e)[:200]}'))
    await pg.goto(BASE + '#dati.archivio'); await pg.wait_for_selector('.content h1', timeout=20000); await pg.wait_for_timeout(800)
    out = {'mode': mode}
    if mode == 'nohost':
        async with pg.expect_download(timeout=8000) as dl:
            await pg.get_by_text('Esporta backup completo', exact=True).click()
        d = await dl.value
        out['download'] = d.suggested_filename
        await b.close(); return out
    await pg.get_by_text('Esporta backup completo', exact=True).click()
    out['toast_backup'] = await toast_text(pg)
    await pg.evaluate("location.hash = '#regolatorio.fonti'"); await pg.wait_for_timeout(600)
    btn = pg.locator('.pager button', has_text='CSV').first
    if await btn.count():
        await btn.click(); await pg.wait_for_timeout(300)
    out['toast_csv'] = await toast_text(pg)
    out['saved'] = await pg.evaluate('() => window.__saved')
    await pg.evaluate("location.hash = '#finanza.rimanenze'"); await pg.wait_for_timeout(600)
    # anteprima di stampa delle rimanenze, poi «Stampa»
    pr = pg.locator('button', has_text='Stampa').first
    if await pr.count():
        await pr.click(); await pg.wait_for_timeout(400)
        exact = pg.get_by_role('button', name='Stampa', exact=True)
        if await exact.count(): await exact.last.click(); await pg.wait_for_timeout(300)
        out['printed'] = await pg.evaluate('() => window.__printed')
        out['toast_print'] = await toast_text(pg)
    await b.close()
    return out

async def main():
    errs = []
    async with async_playwright() as p:
        res = {m: await run(p, m, errs) for m in ['ok', 'declined', 'rate_limited', 'rejected_extension', 'null', 'nohost']}
    ok = res['ok']
    names = [s['filename'] for s in ok['saved']]
    print('salvati con downloads.save:', names)
    if len(ok['saved']) < 2: errs.append(f'attesi backup e CSV, salvati {len(ok["saved"])}')
    for s in ok['saved']:
        ext = s['filename'].rsplit('.', 1)[-1].lower()
        if ext not in ALLOWED: errs.append(f'estensione non ammessa: {s["filename"]}')
        if not s['blob']: errs.append(f'{s["filename"]}: atteso un Blob')
        if not s['size']: errs.append(f'{s["filename"]}: file vuoto')
    bk = next((s for s in ok['saved'] if s['filename'].endswith('.json')), None)
    if not bk: errs.append('backup JSON non salvato')
    elif '"format":"feedos16"' not in bk['head']: errs.append('backup senza il formato atteso: ' + bk['head'][:80])
    if 'Backup esportato' not in ok['toast_backup']: errs.append('nessuna conferma dopo il salvataggio: ' + ok['toast_backup'])
    if 'File pronto' not in ok['toast_csv']: errs.append('nessuna conferma dopo il CSV: ' + ok['toast_csv'])
    for m in ['declined', 'rate_limited', 'rejected_extension', 'null']:
        if 'Backup esportato' in res[m]['toast_backup']: errs.append(f'{m}: il backup risulta esportato anche se non è stato salvato')
    if 'printed' in ok:
        if ok['printed']: errs.append('window.print chiamata dentro il visualizzatore')
        if 'stampa non è disponibile' not in ok.get('toast_print', ''): errs.append('nessun avviso sulla stampa: ' + ok.get('toast_print', ''))
    print('rifiutato da chi guarda →', repr(res['declined']['toast_backup']))
    if 'non permette' in res['declined']['toast_backup'] or 'formato' in res['declined']['toast_backup']: errs.append('il rifiuto di chi guarda non deve dare errori')
    print('richiesta già aperta →', repr(res['rate_limited']['toast_backup']))
    if 'già una richiesta' not in res['rate_limited']['toast_backup']: errs.append('manca l’avviso per la richiesta già aperta')
    print('formato rifiutato →', repr(res['rejected_extension']['toast_backup']))
    if 'formato' not in res['rejected_extension']['toast_backup']: errs.append('manca l’avviso sul formato')
    print('capacità assente →', repr(res['null']['toast_backup']))
    if 'non permette di scaricare' not in res['null']['toast_backup']: errs.append('manca l’avviso per la vista senza permesso')
    print('senza visualizzatore → scaricato dal browser:', res['nohost'].get('download'))
    if not str(res['nohost'].get('download', '')).endswith('.json'): errs.append('senza visualizzatore il backup non si scarica')
    print('errori:', errs or 'nessuno')
    return 1 if errs else 0

sys.exit(asyncio.run(main()))
