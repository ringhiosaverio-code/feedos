"""Schermate di controllo: python3 tests/e2e/shot.py [larghezza altezza tema] [--file=FitoOS-demo.html] [--full] hash1 hash2 ...
Si fotografa solo una build pubblica (la demo di FeedOS se non si indica il file); cartella: $SHOTS o shots/."""
import asyncio, sys, time, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
FILE = next((a.split('=', 1)[1] for a in args if a.startswith('--file=')), 'FeedOS-16-demo.html'); args = [a for a in args if not a.startswith('--file=')]
BASE = (ROOT / 'dist' / FILE).as_uri()
OUT = os.environ.get('SHOTS') or 'shots'
W, H, theme = 1440, 900, 'light'
if args and args[0].isdigit(): W, H, theme = int(args[0]), int(args[1]), args[2]; args = args[3:]
full = '--full' in args; args = [a for a in args if a != '--full']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None)
        ctx = await b.new_context(viewport={'width': W, 'height': H}, color_scheme='dark' if theme == 'dark' else 'light', device_scale_factor=1 if W > 800 else 2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400]))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text[:300]) if m.type in ('error', 'warning') else None)
        t0 = time.time(); await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content', timeout=15000); await pg.wait_for_timeout(1200)
        print('avvio', round(time.time() - t0, 2), 's')
        for h in args or ['oggi']:
            await pg.evaluate(f"location.hash = '#{h}'"); await pg.wait_for_timeout(900)
            m = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight})")
            name = f"{OUT}/{h.replace('.', '_')}_{W}_{theme}.png"
            await pg.screenshot(path=name, full_page=full)
            print(h, m, '→', name)
        print('errori:', errs[:12])
        await b.close()
asyncio.run(main())
