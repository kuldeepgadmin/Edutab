#!/usr/bin/env python3
"""Bake Educrypt's site origin into every page, then build the sitemap.

    python3 tools/set-origin.py https://educrypt.in
    python3 tools/set-origin.py https://your-name.github.io/educrypt
    python3 tools/set-origin.py --check

Writes, idempotently:
  • <link rel="canonical">  + og:url / og:image / twitter:image  in all 6 pages
  • the SITE_ORIGIN constant in assets/js/seo.js (switches it from runtime
    guessing to the fixed value)
  • sitemap.xml (real <lastmod>, 5 URLs; the 404 is excluded on purpose)
  • the Sitemap: line in robots.txt
  • absolute ids/urls inside JSON-LD blocks that use "~/..." paths

Safe to re-run with a new domain: it replaces its own previous output.
"""
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "__EDUCRYPT_ORIGIN__"
BEGIN = "<!-- SEO:BEGIN (written by tools/set-origin.py) -->"
END = "<!-- SEO:END -->"

ALL_PAGES = ["index.html", "about.html", "services.html", "workflow.html",
             "contact.html", "404.html"]

PAGES = {
    "index.html":     ("Educrypt — Enterprise & Campus Management Solutions", 1.0, "weekly"),
    "about.html":      ("About Educrypt — 15 Years of Technical Execution",     0.8, "monthly"),
    "services.html":  ("Educrypt Services — ERP, Websites, Portals, Fees",     0.9, "weekly"),
    "workflow.html":  ("How Educrypt Works — 4-Step Deployment Model",         0.7, "monthly"),
    "contact.html":   ("Contact Educrypt — Book a Consultation",               0.9, "monthly"),
}


def norm(origin):
    """Accept https://host  and  https://host/base/path  (GitHub Pages projects
    live under a subpath), reject anything else. Trailing slash is normalised."""
    origin = origin.strip().rstrip("/")
    if not re.match(r"^https?://[^/]+(/[^/?\#]*)*$", origin):
        sys.exit(f"error: '{origin}' must start with http:// or https:// and contain a host, e.g.\n"
                 f"       https://educrypt.in\n"
                 f"       https://your-name.github.io/educrypt\n"
                 f"  (no query string, no spaces, no trailing slash needed)")
    return origin


def url_for(origin, page):
    return origin + ("/" if page == "index.html" else "/" + page)


def block(origin, page, title):
    u = url_for(origin, page)
    img = origin + "/assets/img/og-cover.png"
    return "\n".join([
        BEGIN,
        f'<link rel="canonical" href="{u}">',
        f'<meta property="og:url" content="{u}">',
        f'<meta property="og:image" content="{img}">',
        f'<meta property="og:image:secure_url" content="{img}">',
        f'<meta property="og:image:width" content="1200">',
        f'<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="Educrypt — Campus & Enterprise Management Solutions">',
        f'<meta name="twitter:image" content="{img}">',
        f'<meta name="twitter:url" content="{u}">',
        END,
    ])


LD_RE = re.compile(r'(<script type="application/ld\+json"[^>]*>)(.*?)(</script>)', re.S)


def _rel(u):
    """https://host/some/page.html -> ~/some/page.html"""
    m = re.match(r"^https?://[^/]+(/.*)?$", u)
    return "~/" + ((m.group(1) or "/").lstrip("/"))


def bake_ld(html, origin):
    """Normalise every URL inside JSON-LD to ~/, then bake the new origin.
    Domain change + re-runs therefore can never leave a stale host behind."""
    def swap(m):
        head, body, tail = m.group(1), m.group(2), m.group(3)
        body = re.sub(r'"(https?://[^"]+)"', lambda mm: json.dumps(_rel(mm.group(1))), body)
        body = re.sub(r'"~/([^"]*)"', lambda mm: json.dumps(origin + "/" + mm.group(1)), body)
        body = re.sub(r'"~"', json.dumps(origin), body)
        return head + body + tail
    return LD_RE.sub(swap, html)


def patch_pages(origin):
    changed = []
    for page in list(PAGES) + ["404.html"]:
        p = os.path.join(ROOT, page)
        s = open(p, encoding="utf-8").read()
        title = PAGES.get(page, ("Educrypt — Page not found", 0, ""))[0]
        new = block(origin, page, title) if page != "404.html" else BEGIN + "\n" + END
        if BEGIN in s:
            s2 = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), new, s, flags=re.S)
        else:  # markers missing -> insert before </head>
            s2 = s.replace("</head>", new + "\n</head>", 1)
        s2 = s2.replace('name="educrypt:origin" content="' + TOKEN + '"',
                'name="educrypt:origin" content="' + origin + '"')
        s2 = re.sub(r'name="educrypt:origin" content="[^"]*"',
                'name="educrypt:origin" content="' + origin + '"', s2)
        s2 = bake_ld(s2, origin)
        if s2 != s:
            open(p, "w", encoding="utf-8").write(s2)
            changed.append(page)
    return changed


def patch_js(origin):
    p = os.path.join(ROOT, "assets", "js", "seo.js")
    s = open(p, encoding="utf-8").read()
    s2 = re.sub(r'var SITE_ORIGIN = "[^"]*";', f'var SITE_ORIGIN = "{origin}";', s, count=1)
    if s2 != s:
        open(p, "w", encoding="utf-8").write(s2)
        return True
    return False


def write_sitemap(origin):
    today = datetime.date.today().isoformat()
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for page, (title, prio, freq) in PAGES.items():
        out += ["  <url>",
                f"    <loc>{url_for(origin, page)}</loc>",
                f"    <lastmod>{today}</lastmod>",
                f"    <changefreq>{freq}</changefreq>",
                f"    <priority>{prio:.1f}</priority>",
                "  </url>"]
    out += ["</urlset>", ""]
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(out))
    return len(PAGES)


def patch_robots(origin):
    p = os.path.join(ROOT, "robots.txt")
    s = open(p, encoding="utf-8").read()
    line = f"Sitemap: {origin}/sitemap.xml"
    if re.search(r"^Sitemap:", s, re.M):
        s2 = re.sub(r"^Sitemap:.*$", line, s, flags=re.M)
    else:
        s2 = s.rstrip("\n") + "\n\n" + line + "\n"
    # the placeholder guidance is obsolete as soon as the real line is in place
    s2 = re.sub(r"\n?# After deploying.*?\n# Sitemap:.*?\n", "\n", s2, flags=re.S)
    s2 = re.sub(r"\n{3,}", "\n\n", s2)  # no triple blank lines from the edit
    if s2 != s:
        open(p, "w", encoding="utf-8").write(s2)
        return True
    return False


def check():
    s = open(os.path.join(ROOT, "assets", "js", "seo.js"), encoding="utf-8").read()
    m = re.search(r'var SITE_ORIGIN = "([^"]*)";', s)
    val = m.group(1) if m else ""
    if not val or TOKEN in val:
        print("not baked yet — pages rely on runtime resolution")
        print(f"  run:  python3 tools/set-origin.py https://your-domain")
        return 2
    bad = []
    for page in list(PAGES) + ["404.html"]:
        html = open(os.path.join(ROOT, page), encoding="utf-8").read()
        want = url_for(val, page)
        if page in PAGES and f'<link rel="canonical" href="{want}">' not in html:
            bad.append(f"{page}: canonical is not {want}")
        # every absolute URL on the page must live under the baked origin,
        # excluding vocabulary namespaces (schema.org / w3.org) which are fixed.
        for u in re.findall(r'"(https?://[^"]+)"', html):
            if "schema.org" in u or "w3.org" in u:
                continue
            if not (u == val or u.startswith(val + "/")):
                bad.append(f"{page}: {u} is not under {val}")
        if page in PAGES and f'content="{val}/assets/img/og-cover.png"' not in html:
            bad.append(f"{page}: og:image not absolute to {val}")
    sm = os.path.join(ROOT, "sitemap.xml")
    if not os.path.isfile(sm):
        bad.append("sitemap.xml missing")
    else:
        txt = open(sm, encoding="utf-8").read()
        if val not in txt:
            bad.append("sitemap.xml: stale origin")
        for u in re.findall(r"<loc>([^<]+)</loc>", txt):
            if not u.startswith(val + "/"):
                bad.append(f"sitemap.xml: {u} outside {val}")
    if not re.search(rf"^Sitemap: {re.escape(val)}/sitemap\.xml$",
                     open(os.path.join(ROOT, "robots.txt"), encoding="utf-8").read(), re.M):
        bad.append("robots.txt: Sitemap line missing or stale")
    if TOKEN in "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in ALL_PAGES):
        bad.append("an unfilled " + TOKEN + " token is still present")
    if bad:
        print("inconsistent:")
        for b in dict.fromkeys(bad):
            print("  - " + b)
        return 1
    print(f"baked origin: {val}")
    print("canonicals, og:url, og:image, JSON-LD urls, sitemap.xml and robots.txt all agree")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        sys.exit(check())
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    origin = norm(sys.argv[1])
    changed = patch_pages(origin)
    patch_js(origin)
    n = write_sitemap(origin)
    patch_robots(origin)
    print(f"origin baked: {origin}")
    print(f"  pages updated : {', '.join(changed) if changed else 'already current'}")
    print(f"  sitemap.xml   : {n} URLs")
    print(f"  robots.txt    : Sitemap line -> {origin}/sitemap.xml")
    print("next: commit + push; then submit the sitemap URL in Google Search Console.")
