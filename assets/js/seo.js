/* ============================================================
  Educrypt — SEO resolver
   ------------------------------------------------------------
   Canonical / og:url / og:image must be ABSOLUTE urls, which a
   repo without a chosen domain cannot hard-code yet. So:

   • tools/set-origin.py bakes the real values into each page once
     you know your origin (preferred — works for every crawler).
   • Until then, this script derives them from the live location at
     runtime, so a deployed-but-undecided site still self-canonicals
     correctly instead of shipping a wrong or placeholder URL.

   It never overwrites tags that set-origin.py already baked in.
   ============================================================ */
(function () {
  "use strict";
  var d = document;

  /* --- the one config value; replaced by tools/set-origin.py --- */
  var SITE_ORIGIN = "__EDUCRYPT_ORIGIN__";
  var BAKED = SITE_ORIGIN.indexOf("__EDUCRYPT_") !== 0;

  /* never emit file:// or other non-web origins (local preview, jsdom) */
  if (!BAKED && !/^https?:$/.test(location.protocol)) return;

  var origin = BAKED ? SITE_ORIGIN.replace(/\/+$/, "") : (location.protocol + "//" + location.host);

  /* "https://host/educrypt/services.html" -> "https://host/educrypt/services.html"
     ".../index.html" and ".../" -> ".../"  (one URL per page, no ?/# noise) */
  function canonicalFor(href) {
    var clean = String(href || location.pathname).replace(/[#?].*$/, "");
    if (/\/$/.test(clean)) return origin + clean;
    if (/\/index\.html$/.test(clean)) return origin + clean.replace(/\/index\.html$/, "/");
    return origin + (clean.charAt(0) === "/" ? clean : "/" + clean);
  }

  function upsertLink(rel, href) {
    var el = d.querySelector('link[rel="' + rel + '"]');
    if (el) return;
    el = d.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("href", href);
    d.head.appendChild(el);
  }

  function upsertMeta(key, content) {
    /* Open Graph + friends use property=; Twitter and misc use name= */
    var isProp = /^(og|product|music|article|video|book|profile):/.test(key);
    var sel = 'meta[' + (isProp ? "property" : "name") + '="' + key + '"]';
    var el = d.querySelector(sel);
    if (el && el.getAttribute("content")) return;
    if (!el) {
      el = d.createElement("meta");
      el.setAttribute(isProp ? "property" : "name", key);
      d.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  var canon = canonicalFor(BAKED ? "" : location.pathname);
  var here = d.querySelector("link[rel='canonical']");
  /* if nothing was baked, write the derived set */
  if (!here) upsertLink("canonical", canon);
  var self = d.querySelector("link[rel='canonical']").getAttribute("href");

  upsertMeta("og:url", self);
  upsertMeta("twitter:url", self);
  if (!d.querySelector('meta[property="og:image"]')) {
    var img = origin + "/assets/img/og-cover.png";
    upsertMeta("og:image", img);
    upsertMeta("og:image:secure_url", img);
    upsertMeta("twitter:image", img);
    upsertMeta("og:image:width", "1200");
    upsertMeta("og:image:height", "630");
    upsertMeta("og:image:alt", "Educrypt — Campus & Enterprise Management Solutions");
  }

  /* give JSON-LD blocks their absolute ids/urls if they opted in */
  Array.prototype.forEach.call(d.querySelectorAll('script[type="application/ld+json"][data-abs]'), function (sc) {
    try {
      var data = JSON.parse(sc.textContent);
      var walk = function (o) {
        Object.keys(o).forEach(function (k) {
          if (typeof o[k] === "string" && /^~\//.test(o[k])) o[k] = origin + o[k].slice(1);
          else if (o[k] && typeof o[k] === "object") walk(o[k]);
        });
      };
      walk(data);
      sc.textContent = JSON.stringify(data, null, 0);
    } catch (e) { /* leave the block untouched if it will not parse */ }
  });
})();
