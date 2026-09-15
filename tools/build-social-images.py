#!/usr/bin/env python3
"""Deterministically build Educrypt's social/brand raster assets with PIL.

No network, no AI raster: brand colours + system font, so re-running always
reproduces the same files. Output sizes follow platform guidance:
  og-cover.png          1200 x 630   (Facebook/LinkedIn/Twitter large card)
  og-cover-square.png    640 x 640   (fallback square crop)
  apple-touch-icon.png   180 x 180
  icon-512.png           512 x 512   (PWA / generic favicon)

Usage:  python3 tools/build-social-images.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img")
os.makedirs(OUT, exist_ok=True)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
NAVY = (26, 24, 39)
VIOLET = (113, 75, 151)
VIOLET_LT = (151, 111, 190)
WHITE = (255, 255, 255)
MUTED = (178, 174, 192)
LINE = (58, 54, 74)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def mark(draw, x, y, box, radius=16, lw=6):
    """The 3-bar logo glyph used across the site, drawn as vectors."""
    draw.rounded_rectangle([x, y, x + box, y + box], radius=radius, fill=VIOLET)
    inset = box * 0.28
    w = box - 2 * inset
    bar_h = box * 0.075
    ys = [y + box * 0.30, y + box * 0.47, y + box * 0.64]
    widths = [w, w * 0.62, w]
    for yy, ww in zip(ys, widths):
        draw.rounded_rectangle([x + inset, yy, x + inset + ww, yy + bar_h],
                               radius=bar_h / 2, fill=WHITE)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def grid(draw, w, h, step=48):
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill=(38, 35, 52), width=1)
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill=(38, 35, 52), width=1)


BOXES = []  # (label, (x0,y0,x1,y1)) for every run drawn on a cover


def put(d, xy, txt, fnt, fill, label):
    """Draw text and record its measured box so layout can be asserted."""
    x, y = xy
    asc, desc = fnt.getmetrics()
    wpx = d.textlength(txt, font=fnt)
    BOXES.append((label, (x, y, x + wpx, y + asc + desc)))
    d.text(xy, txt, font=fnt, fill=fill)


def overlaps(a, b, tol=1):
    return not (a[2] + tol <= b[0] or b[2] + tol <= a[0] or a[3] + tol <= b[1] or b[3] + tol <= a[1])


def fit(d, text, path, max_w, max_size, min_size=10):
    """Largest font size at which `text` fits on one line inside max_w."""
    size = max_size
    while size > min_size and d.textlength(text, font=font(path, size)) > max_w:
        size -= 1
    return font(path, size)


def cover(w, h, path, *, square=False):
    img = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    grid(d, w, h)

    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w * 0.55, -h * 0.5, w * 1.35, h * 0.55], fill=90)
    from PIL import ImageFilter
    img = Image.composite(Image.new("RGB", (w, h), VIOLET), img, glow.filter(ImageFilter.GaussianBlur(90)))
    d = ImageDraw.Draw(img)
    grid(d, w, h)

    pad = int(w * 0.075) if not square else int(w * 0.085)
    inner = w - 2 * pad

    # ---- logo + wordmark, sized to never overlap ----
    f_mark = int(min(h * 0.135, w * 0.135))
    mark(d, pad, pad, f_mark, radius=int(f_mark * 0.42), lw=max(3, int(f_mark * 0.16)))
    word_txt = "Educrypt"
    word = fit(d, word_txt, "DejaVuSans-Bold.ttf", int(inner - f_mark - w * 0.022), int(h * 0.072))
    put(d, (pad + f_mark + int(w * 0.022), pad + int(f_mark * 0.16)), word_txt, word, WHITE, "wordmark")

    # ---- footer geometry first, so body copy can never run into it ----
    fh = int(h * (0.115 if not square else 0.165))
    strip_top = h - fh
    foot_size = int(h * (0.043 if not square else 0.037))
    left_txt = "15+ years of technical execution for schools & colleges"
    right_txt = "Mon\u2013Sat \u00b7 direct engineering support"

    # ---- headline: shrink until every wrapped line also fits the vertical band ----
    head_txt = "Campus Management Systems" if square else "Campus & Enterprise Management Solutions"
    sub_txt = ("ERP \u00b7 website care \u00b7 portals \u00b7 fees" if square
               else "ERP  \u00b7  Website Management  \u00b7  Parent & Staff Portals  \u00b7  Fee Gateways")
    band_top = pad + f_mark + int(h * 0.075)
    band_bot = strip_top - int(h * (0.06 if not square else 0.045))
    size = int(h * 0.105)
    while size > 20:
        hf = font("DejaVuSans-Bold.ttf", size)
        lines = wrap(d, head_txt, hf, inner)
        lh = int(size * 1.24)
        if len(lines) <= 4 and len(lines) * lh + size * 1.5 <= band_bot - band_top:
            break
        size -= 2
    y = band_top
    for ln in lines:
        put(d, (pad, y), ln, hf, WHITE, "headline")
        y += lh
    sub = fit(d, sub_txt, "DejaVuSans.ttf", inner, int(h * 0.046), 11)
    put(d, (pad, y + int(h * 0.008)), sub_txt, sub, MUTED, "subtitle")

    # ---- footer: side-by-side when there is room, stacked when there is not ----
    lf = fit(d, left_txt, "DejaVuSans-Bold.ttf", inner, foot_size, 11)
    rect = [0, strip_top, w, h]
    if square:
        rf = fit(d, right_txt, "DejaVuSans.ttf", inner, int(h * 0.034), 11)
        d.rectangle(rect, fill=VIOLET)
        put(d, (pad, strip_top + int(fh * 0.20)), left_txt, lf, WHITE, "footer-left")
        put(d, (pad, strip_top + int(fh * 0.20) + int(fh * 0.42)), right_txt, rf, (236, 228, 246), "footer-right")
    else:
        gap = int(w * 0.03)
        # Try wide right text, then a short form, then shrink the left run until
        # both runs plus the gap provably fit inside `inner`.
        for cand in (right_txt, "Mon\u2013Sat support"):
            right_txt = cand
            rf = fit(d, right_txt, "DejaVuSans.ttf", inner, int(h * 0.038), 11)
            avail = inner - d.textlength(right_txt, font=rf) - gap
            lsize = foot_size
            while lsize > 11 and d.textlength(left_txt, font=font("DejaVuSans-Bold.ttf", lsize)) > avail:
                lsize -= 1
            lf = font("DejaVuSans-Bold.ttf", lsize)
            if d.textlength(left_txt, font=lf) + gap + d.textlength(right_txt, font=rf) <= inner:
                break
        assert d.textlength(left_txt, font=lf) + gap + d.textlength(right_txt, font=rf) <= inner, \
            "footer runs still wider than the strip after fitting"
        d.rectangle(rect, fill=VIOLET)
        ty = strip_top + int(fh * 0.30)
        put(d, (pad, ty), left_txt, lf, WHITE, "footer-left")
        put(d, (w - pad - d.textlength(right_txt, font=rf), ty + int(h * 0.004)), right_txt, rf, (236, 228, 246), "footer-right")

    t0, t1 = strip_top - int(h * 0.022), strip_top - int(h * 0.014)
    for x in range(pad, w - pad, int(w * 0.055)):
        d.rectangle([x, t0, x + int(w * 0.022), t1], fill=VIOLET_LT)

    # ---- hard guarantees, asserted not eyeballed ----
    runs = list(BOXES)
    for label, bx in runs:
        assert bx[0] >= 0 and bx[1] >= 0 and bx[2] <= w and bx[3] <= h, f"{label} drawn outside canvas: {bx}"
        assert bx[0] >= pad - 2 and bx[2] <= w - pad + 2, f"{label} ignores the {pad}px margin: {bx}"
    got = {}
    for label, bx in runs:
        got.setdefault(label, []).append(bx)
    union = {}
    for label, lst in got.items():
        union[label] = (min(b[0] for b in lst), min(b[1] for b in lst), max(b[2] for b in lst), max(b[3] for b in lst))
    names = list(union)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = union[names[i]], union[names[j]]
            assert not overlaps(a, b), f"OVERLAP {names[i]} x {names[j]}: {a} vs {b}"
    assert union["footer-left"][1] >= strip_top, "footer text sits above the strip"
    BOXES.clear()

    img.save(path, "PNG", optimize=True)
    return img.size


def app_icon(px, path, rounded=True):
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(px * 0.225) if rounded else 0
    if r:
        mask = Image.new("L", (px, px), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, px, px], radius=r, fill=255)
        base = Image.new("RGBA", (px, px), NAVY + (255,))
        img = Image.composite(base, img, mask)
        d = ImageDraw.Draw(img)
    else:
        d.rectangle([0, 0, px, px], fill=NAVY)
    box = int(px * 0.62)
    off = (px - box) // 2
    mark(d, off, off, box, radius=int(box * 0.24), lw=max(3, int(box * 0.085)))
    img.save(path, "PNG", optimize=True)
    return img.size


def status_cover(path):
    """Build a portrait WhatsApp Status card with generous mobile-safe margins."""
    w, h = 1080, 1920
    pad = 96
    img = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    grid(d, w, h, step=64)

    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w * 0.20, h * 0.12, w * 1.30, h * 0.66], fill=105)
    from PIL import ImageFilter
    img = Image.composite(Image.new("RGB", (w, h), VIOLET), img,
                          glow.filter(ImageFilter.GaussianBlur(130)))
    d = ImageDraw.Draw(img)
    grid(d, w, h, step=64)

    logo_size = 126
    mark(d, pad, 132, logo_size, radius=36)
    word = font("DejaVuSans-Bold.ttf", 66)
    d.text((pad + logo_size + 34, 158), "Educrypt", font=word, fill=WHITE)

    eyebrow = font("DejaVuSans-Bold.ttf", 28)
    d.text((pad, 430), "CAMPUS SYSTEMS  /  ERP  /  WEB OPERATIONS",
           font=eyebrow, fill=(205, 183, 226))

    headline_font = font("DejaVuSans-Bold.ttf", 92)
    headline = "Smarter systems\nfor stronger\ninstitutions."
    y = 520
    for line in headline.splitlines():
        d.text((pad, y), line, font=headline_font, fill=WHITE)
        y += 112

    body_font = font("DejaVuSans.ttf", 34)
    body = "Integrated technology for schools and colleges."
    d.text((pad, 930), body, font=body_font, fill=MUTED)

    line_y = 1060
    d.rectangle([pad, line_y, w - pad, line_y + 3], fill=VIOLET_LT)
    services = [
        ("01", "ERP setup & consultation"),
        ("02", "Website management"),
        ("03", "Parent & staff portals"),
        ("04", "Fee gateway integration"),
    ]
    number_font = font("DejaVuSans-Bold.ttf", 27)
    service_font = font("DejaVuSans-Bold.ttf", 37)
    service_y = 1130
    for number, label in services:
        d.text((pad, service_y), number, font=number_font, fill=VIOLET_LT)
        d.text((pad + 82, service_y - 4), label, font=service_font, fill=WHITE)
        service_y += 100

    strip_top = 1660
    d.rectangle([0, strip_top, w, h], fill=VIOLET)
    cta_font = font("DejaVuSans-Bold.ttf", 38)
    d.text((pad, strip_top + 88), "Build the right foundation.", font=cta_font, fill=WHITE)
    url_font = font("DejaVuSans-Bold.ttf", 53)
    d.text((pad, strip_top + 172), "educrypt.in", font=url_font, fill=WHITE)
    detail_font = font("DejaVuSans.ttf", 27)
    d.text((pad, strip_top + 270), "15+ years of technical execution", font=detail_font, fill=(236, 228, 246))

    img.save(path, "PNG", optimize=True)
    return img.size


if __name__ == "__main__":
    made = []
    made.append(("og-cover.png", cover(1200, 630, os.path.join(OUT, "og-cover.png"))))
    made.append(("og-cover-square.png", cover(640, 640, os.path.join(OUT, "og-cover-square.png"), square=True)))
    made.append(("whatsapp-status.png", status_cover(os.path.join(OUT, "whatsapp-status.png"))))
    made.append(("apple-touch-icon.png", app_icon(180, os.path.join(OUT, "apple-touch-icon.png"))))
    made.append(("icon-512.png", app_icon(512, os.path.join(OUT, "icon-512.png"))))
    for n, s in made:
        print(f"  wrote assets/img/{n}  {s[0]}x{s[1]}  {os.path.getsize(os.path.join(OUT, n)):,} bytes")
