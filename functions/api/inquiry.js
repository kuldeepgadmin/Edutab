/**
 * Educrypt — Cloudflare Pages Function:  POST /api/inquiry
 * ------------------------------------------------------------------
 * Receives the contact-form payload, validates it, rate-limits it and
 * delivers it to the Educrypt WhatsApp line.
 *
 * Three delivery modes, picked automatically from the secrets you set:
 *
 *   1. WhatsApp Cloud API  -> WA_CLOUD_API_TOKEN + WA_PHONE_NUMBER_ID
 *      True server-side delivery. The visitor never leaves your site.
 *   2. CallMeBot           -> CALLMEBOT_API_KEY
 *      Free bridge, needs a one-time opt-in (see README).
 *   3. None of the above   -> the function returns a wa.me deep link and
 *      the browser hands it to WhatsApp. Works with zero configuration.
 *
 * Free-tier budget: Workers/Pages Functions get 100,000 requests/day,
 * which is ~3,000 form submissions a day. This function does 1 subrequest
 * per submission (0 when running in deep-link mode), so the endpoint is
 * nowhere near the limit for a school-consultancy site.
 * ------------------------------------------------------------------
 */

const DESTINATION = "919399365399"; // +91 93993 65399
const MAX_INTERESTS = 5;
const MAX_MESSAGE = 1200;

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 6 };
const buckets = new Map(); // per-isolate fallback when KV is not bound

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });

const clean = (v, max = 160) =>
  String(v == null ? "" : v)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

/** Same text layout the browser fallback produces, so the message looks
 *  identical whichever delivery mode is active. */
export function formatInquiry(p) {
  const lines = [
    "*NEW EDUCRYPT INQUIRY*",
    "--------------------------------",
    `*Name:* ${clean(p.name)}`,
    `*Institution:* ${clean(p.org)}`,
    `*Email:* ${clean(p.email)}`,
    `*Phone:* ${clean(p.phone) || "not provided"}`,
    "*Service interest:*"
  ];
  const interests = Array.isArray(p.interests)
    ? p.interests.map((s) => clean(s, 80)).filter(Boolean).slice(0, MAX_INTERESTS)
    : [];
  lines.push(...(interests.length ? interests.map((i) => `\u2022 ${i}`) : ["Not specified"]));
  lines.push("--------------------------------", "*Operational requirements:*", clean(p.message, MAX_MESSAGE) || "\u2014");
  lines.push("--------------------------------");
  lines.push(`Source: ${clean(p.source, 120) || "website form"}`);
  lines.push(`Received: ${new Date().toISOString()}`);
  return lines.join("\n");
}

function validate(p) {
  const errors = [];
  if (!clean(p.name)) errors.push("Full name is required.");
  if (!clean(p.org)) errors.push("Institution name is required.");
  const email = clean(p.email);
  if (!email) errors.push("Email address is required.");
  else if (!EMAIL_RE.test(email)) errors.push("Email address looks invalid.");
  if (clean(p.phone) && !PHONE_RE.test(clean(p.phone))) errors.push("Phone number looks invalid.");
  if (p.message && String(p.message).length > MAX_MESSAGE)
    errors.push(`Message must be ${MAX_MESSAGE} characters or fewer.`);
  return errors;
}

function clientIp(request, env) {
  const cf = request.cf && request.cf.cip ? request.cf.cip : null;
  if (cf) return cf;
  const fwd = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || "").trim() || "unknown";
}

/** Rate limit: KV when bound (accurate, survives isolates), otherwise an
 *  in-memory bucket. KV writes are capped at 1,000/day on the free plan, so
 *  this is deliberately kept to one write per request and is best-effort. */
async function throttled(ip, env, waitUntil) {
  const key = `rl:${ip}:${Math.floor(Date.now() / RATE_LIMIT.windowMs)}`;
  if (env.RATE_LIMIT_KV) {
    const n = await env.RATE_LIMIT_KV.get(key) || "0";
    const count = Number(n) + 1;
    waitUntil(Promise.resolve(env.RATE_LIMIT_KV.put(key, String(count), { ttl: RATE_LIMIT.windowMs / 1000 + 60 })).catch(() => {}));
    return count > RATE_LIMIT.max;
  }
  const now = Date.now();
  const hit = buckets.get(key);
  const state = hit && now - hit.t < RATE_LIMIT.windowMs ? { c: hit.c + 1, t: hit.t } : { c: 1, t: now };
  if (buckets.size > 4096) buckets.clear(); // keep the map bounded
  buckets.set(key, state);
  return state.c > RATE_LIMIT.max;
}

async function sendViaCloudApi(text, env) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.WA_CLOUD_API_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: DESTINATION,
      type: "text",
      text: { preview_url: false, body: text }
    })
  });
  return { ok: res.ok, status: res.status, body: res.ok ? "" : (await res.text()).slice(0, 300) };
}

async function sendViaCallMeBot(text, env) {
  const url =
    "https://api.callmebot.com/whatsapp.php?" +
    new URLSearchParams({
      phone: env.CALLMEBOT_PHONE || "+" + DESTINATION,
      text,
      apikey: env.CALLMEBOT_API_KEY
    });
  const res = await fetch(url);
  const body = await res.text();
  return { ok: res.ok && !/error|fail/i.test(body), status: res.status, body: body.slice(0, 200) };
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  let p = {};
  try {
    const type = request.headers.get("content-type") || "";
    p = type.includes("application/json") ? await request.json() : Object.fromEntries(new URLSearchParams(await request.text()));
  } catch (e) {
    return json({ ok: false, errors: ["Malformed request body."] }, 400);
  }

  // honeypot: hidden field real visitors never fill
  if (clean(p._company)) return json({ ok: true, delivered: false, mode: "discarded" });

  const errors = validate(p);
  if (errors.length) return json({ ok: false, errors }, 422);

  if (await throttled(clientIp(request, env), env, waitUntil)) {
    return json({ ok: false, errors: ["Too many inquiries from this connection. Please try again in a few minutes."] }, 429);
  }

  // optional Cloudflare Turnstile gate — enforced only when a secret exists
  if (env.TURNSTILE_SECRET) {
    const token = clean(p.turnstile, 400);
    if (!token) return json({ ok: false, errors: ["Please complete the human check."] }, 400);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(request, env) })
    });
    const verdict = await v.json().catch(() => ({ success: false }));
    if (!verdict.success) return json({ ok: false, errors: ["Human check failed. Please retry."] }, 400);
  }

  const text = formatInquiry(p);

  if (env.WA_CLOUD_API_TOKEN && env.WA_PHONE_NUMBER_ID) {
    const r = await sendViaCloudApi(text, env);
    if (r.ok) return json({ ok: true, delivered: true, mode: "whatsapp-cloud-api" });
    // never lose a lead: fall through to the deep link and log the failure
    console.error("wa cloud api failed", r.status, r.body);
    return json({ ok: true, delivered: false, mode: "deeplink", url: deepLink(text) });
  }

  if (env.CALLMEBOT_API_KEY) {
    const r = await sendViaCallMeBot(text, env);
    if (r.ok) return json({ ok: true, delivered: true, mode: "callmebot" });
    console.error("callmebot failed", r.status, r.body);
    return json({ ok: true, delivered: false, mode: "deeplink", url: deepLink(text) });
  }

  return json({ ok: true, delivered: false, mode: "deeplink", url: deepLink(text) });
}

const deepLink = (text) => `https://wa.me/${DESTINATION}?text=${encodeURIComponent(text)}`;

/* GET /api/inquiry -> tiny health probe used by the page to decide whether
   the endpoint exists (static hosts without Functions answer 404 instead). */
export function onRequestGet() {
  return json({ ok: true, service: "educrypt-inquiry", version: 1, endpoint: "/api/inquiry" });
}
