"""Schermate di controllo: python3 tests/e2e/shot.py [larghezza altezza tema] hash1 hash2 ..."""
import asyncio, sys, time
from playwright.async_api import async_playwright
BASE = 'file:///tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f16/dist/FeedOS-16.html'
args = sys.argv[1:]
W, H, theme = 1440, 900, 'light'
if args and args[0].isdigit(): W, H, theme = int(args[0]), int(args[1]), args[2]; args = args[3:]
full = '--full' in args; args = [a for a in args if a != '--full']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': H}, color_scheme='dark' if theme == 'dark' else 'light', device_scale_factor=1 if W > 800 else 2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:400]))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text[:300]) if m.type in ('error', 'warning') else None)
        t0 = time.time(); await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content', timeout=15000); await pg.wait_for_timeout(1200)
        print('avvio', round(time.time() - t0, 2), 's')
        for h in args or ['oggi']:
            await pg.evaluate(f"location.hash = '#{h}'"); await pg.wait_for_timeout(900)
            m = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight})")
            name = f"shots/{h.replace('.', '_')}_{W}_{theme}.png"
            await pg.screenshot(path=name, full_page=full)
            print(h, m, '→', name)
        print('errori:', errs[:12])
        await b.close()
asyncio.run(main())
