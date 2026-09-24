"""Percorsi interattivi: python3 tests/e2e/flow.py nome_percorso [larghezza]
Ogni passo: ('go', hash) · ('click', testo o selettore css) · ('fill', selettore, valore) · ('wait', ms) · ('shot', nome) · ('eval', js)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = 'file:///tmp/claude-0/-home-claude/26da914b-e289-5e67-a6c7-37fe3f4316b6/scratchpad/f16/dist/FeedOS-16.html'
FLOWS = json.load(open('tests/e2e/flows.json'))
name = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
theme = sys.argv[3] if len(sys.argv) > 3 else 'light'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': 900}, color_scheme=theme, device_scale_factor=1 if W > 800 else 2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:500]))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text[:300]) if m.type in ('error', 'warning') else None)
        await pg.goto(BASE + '#oggi'); await pg.wait_for_selector('.content', timeout=15000); await pg.wait_for_timeout(1000)
        for st in FLOWS[name]:
            k = st[0]
            try:
                if k == 'go': await pg.evaluate(f"location.hash = '#{st[1]}'"); await pg.wait_for_timeout(700)
                elif k == 'click':
                    sel = st[1]
                    loc = pg.locator(sel) if sel.startswith(('.', '#', '[', 'button', 'text=', 'role=')) else pg.get_by_text(sel, exact=True)
                    await loc.first.click(); await pg.wait_for_timeout(st[2] if len(st) > 2 else 500)
                elif k == 'fill': await pg.locator(st[1]).first.fill(st[2]); await pg.locator(st[1]).first.press('Tab'); await pg.wait_for_timeout(300)
                elif k == 'select': await pg.locator(st[1]).first.select_option(st[2]); await pg.wait_for_timeout(400)
                elif k == 'wait': await pg.wait_for_timeout(st[1])
                elif k == 'eval': print('eval', st[1][:60], '→', await pg.evaluate(st[1]))
                elif k == 'shot':
                    full = len(st) > 2 and st[2] == 'full'
                    m = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
                    await pg.screenshot(path=f"shots/flow_{name}_{st[1]}_{W}.png", full_page=full); print('shot', st[1], m)
            except Exception as e:
                print('PASSO FALLITO', st, str(e)[:300])
        print('errori:', errs[:12])
        await b.close()
asyncio.run(main())
