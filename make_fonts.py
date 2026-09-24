#!/usr/bin/env python3
"""Sottoinsiemi WOFF dei caratteri usati da FeedOS 16 (latino + simboli tecnici).
TeX Gyre Heros / Heros Cn (GUST Font License) e DejaVu Sans Mono (licenza Bitstream Vera):
i sottoinsiemi sono rinominati 'FeedOS Sans', 'FeedOS Display', 'FeedOS Mono'."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

TG = Path('/usr/share/texmf/fonts/opentype/public/tex-gyre')
DJ = Path('/usr/share/fonts/truetype/dejavu')
OUT = Path(__file__).resolve().parent / 'fonts'
OUT.mkdir(exist_ok=True)

# Latino di base + Latin-1 + punteggiatura tipografica e simboli usati nell'app
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x152, 0x153), (0x2013, 0x2014), (0x2018, 0x201E), (0x2022, 0x2022),
          (0x2026, 0x2026), (0x2030, 0x2030), (0x2032, 0x2033), (0x2039, 0x203A), (0x20AC, 0x20AC),
          (0x2070, 0x2079), (0x2080, 0x2089), (0x2122, 0x2122), (0x2190, 0x2199), (0x2212, 0x2212),
          (0x2248, 0x2248), (0x2260, 0x2265), (0x00B5, 0x00B5), (0x2082, 0x2082), (0x25B2, 0x25BC), (0x2713, 0x2713)]
UNI = sorted({c for a, b in RANGES for c in range(a, b + 1)})

JOBS = [
    (TG / 'texgyreheros-regular.otf', 'FeedOS Sans', 'Regular', 'sans-400'),
    (TG / 'texgyreheros-bold.otf', 'FeedOS Sans', 'Bold', 'sans-700'),
    (TG / 'texgyreheros-italic.otf', 'FeedOS Sans', 'Italic', 'sans-400i'),
    (TG / 'texgyreheroscn-bold.otf', 'FeedOS Display', 'Bold', 'display-700'),
    (TG / 'texgyreheroscn-regular.otf', 'FeedOS Display', 'Regular', 'display-400'),
    (DJ / 'DejaVuSansMono.ttf', 'FeedOS Mono', 'Regular', 'mono-400'),
    (DJ / 'DejaVuSansMono-Bold.ttf', 'FeedOS Mono', 'Bold', 'mono-700'),
]

def rename(font, family, style):
    name = font['name']
    full = f'{family} {style}'
    ps = (family + '-' + style).replace(' ', '')
    for rec in list(name.names):
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID in (2, 17):
            rec.string = style
        elif rec.nameID == 4:
            rec.string = full
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 3:
            rec.string = f'{ps};FeedOS16'

for src, family, style, out in JOBS:
    opts = subset.Options()
    opts.flavor = 'woff'
    opts.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'pnum', 'sups', 'subs', 'frac']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    font = TTFont(str(src))
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNI)
    sub.subset(font)
    rename(font, family, style)
    path = OUT / f'{out}.woff'
    font.flavor = 'woff'
    font.save(str(path))
    print(f'{path.name:18s} {path.stat().st_size // 1024:4d} KB  <- {src.name}')
