/* ============================================================
   Edutab — shared behavior
   1) Mobile navigation
   2) Content protection (copy / paste / print / capture deterrence)
   3) Contact form -> delivered to the Edutab WhatsApp number
   ============================================================ */

(function () {
  "use strict";

  /* ----------------------------- config ----------------------------- */
  // Inquiries from the contact form are delivered to this WhatsApp number.
  // International format, digits only. Change here if the number changes.
  var WHATSAPP_NUMBER = "919399365399";
  var WA_DISPLAY = "+91 93993 65399";

  var doc = document;

  Array.prototype.forEach.call(doc.querySelectorAll("[data-year]"), function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* -------------------------- mobile navigation -------------------------- */
  var toggle = doc.querySelector(".nav-toggle");
  var nav = doc.querySelector(".nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      doc.body.classList.toggle("no-scroll", open);
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        doc.body.classList.remove("no-scroll");
      }
    });
  }

  /* ------------------------------ FAQ accordion ------------------------------ */
  Array.prototype.forEach.call(doc.querySelectorAll(".acc-item > button"), function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.parentNode;
      var open = item.getAttribute("data-open") === "true";
      Array.prototype.forEach.call(item.parentNode.children, function (sib) {
        sib.setAttribute("data-open", "false");
      });
      item.setAttribute("data-open", open ? "false" : "true");
    });
  });

  /* =================== 1. Content protection layer ===================
     Honest note: browsers cannot make a web page literally impossible to
     copy or photograph. This layer removes every *easy* route — text
     selection, copy/paste, right-click, drag, saving the page, print/PDF
     export — and blanks the screen while a capture or save attempt is
     detected. It stops the vast majority of casual reuse.
     ================================================================== */

  var toastEl = null;
  var toastTimer = null;

  function toast(message) {
    if (!toastEl) {
      toastEl = doc.createElement("div");
      toastEl.className = "prot-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      doc.body.appendChild(toastEl);
    }
    toastEl.textContent = "🔒 " + message;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-on");
    }, 2100);
  }

  var shield = doc.createElement("div");
  shield.className = "privacy-shield";
  shield.innerHTML =
    "<div><b>Content protected</b><span>Screen capture and export are disabled on this site. " +
    "Please request material directly from the Edutab office.</span></div>";
  doc.addEventListener("DOMContentLoaded", function () {
    doc.body.appendChild(shield);
  });
  if (doc.body) doc.body.appendChild(shield);

  function raiseShield() {
    shield.classList.add("is-on");
  }
  function lowerShield() {
    shield.classList.remove("is-on");
  }

  function isEditable(node) {
    if (!node || !node.tagName) return false;
    var tag = node.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || node.isContentEditable === true;
  }

  // Block the context menu (except inside form fields, where it is needed)
  doc.addEventListener(
    "contextmenu",
    function (e) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      toast("Right-click and page export are disabled.");
    },
    { capture: true }
  );

  // Block copy / cut / drag of page content
  ["copy", "cut", "dragstart"].forEach(function (type) {
    doc.addEventListener(
      type,
      function (e) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        if (type !== "dragstart") toast("This content is protected and cannot be copied.");
      },
      { capture: true }
    );
  });

  // Block plain-text paste interception warnings + clearing after capture
  doc.addEventListener("paste", function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  });

  // Prevent "Select all" outside inputs
  doc.addEventListener("selectstart", function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  });

  /* Keyboard guard: copy, cut, paste, save-as, print, view-source, inspect */
  function keyGuard(e) {
    var k = (e.key || "").toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    var inField = isEditable(e.target);

    // PrintScreen — blank the screen while the key is held, clear clipboard
    if (k === "printscreen" || k === "f13" || e.key === "PrintScreen") {
      raiseShield();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText("").catch(function () {});
      }
      toast("Screen capture is disabled on this site.");
      return;
    }

    if (mod && (k === "c" || k === "x") && !inField) {
      e.preventDefault();
      toast("This content is protected and cannot be copied.");
      return;
    }
    if (mod && k === "v" && !inField) {
      e.preventDefault();
      return;
    }
    if (mod && (k === "s" || k === "p" || k === "u")) {
      e.preventDefault();
      toast(k === "p" ? "Printing and PDF export are disabled." : "Saving this page is disabled.");
      return;
    }
    if (mod && e.shiftKey && (k === "i" || k === "j" || k === "c")) {
      e.preventDefault();
      return;
    }
    if (k === "f12" || (mod && e.shiftKey && k === "k")) {
      e.preventDefault();
      toast("Page source and developer tools are disabled.");
      return;
    }
    if (mod && k === "a" && !inField) {
      e.preventDefault();
      return;
    }
  }
  doc.addEventListener("keydown", keyGuard, { capture: true });

  // PrintScreen is a keyup event on most platforms; drop the shield when released
  doc.addEventListener("keyup", function (e) {
    var k = (e.key || "").toLowerCase();
    if (k === "printscreen" || k === "f13" || e.key === "PrintScreen") lowerShield();
  });

  // Blank the visible content while a capture tool / screen-share takes focus
  window.addEventListener("blur", function () {
    setTimeout(function () {
      if (doc.hasFocus && !doc.hasFocus()) raiseShield();
    }, 140);
  });
  window.addEventListener("focus", lowerShield);
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) raiseShield();
    else lowerShield();
  });

  // Block print styling path: warn when the print dialog is triggered
  if (window.matchMedia) {
    try {
      var mq = window.matchMedia("print");
      var mqHandler = function (m) {
        if (m.matches) raiseShield();
        else lowerShield();
      };
      if (mq.addEventListener) mq.addEventListener("change", mqHandler);
      else if (mq.addListener) mq.addListener(mqHandler);
    } catch (err) {
      /* older engines — the @media print stylesheet still applies */
    }
  }

  // Disable text selection on non-form nodes even where CSS is overridden
  doc.addEventListener("mousedown", function (e) {
    if (isEditable(e.target)) return;
    if (e.detail > 1) e.preventDefault(); // block double-click select
  });

  // Expose the WhatsApp number where pages want to show it
  Array.prototype.forEach.call(doc.querySelectorAll("[data-wa-number]"), function (el) {
    el.textContent = el.hasAttribute("data-display") ? WA_DISPLAY : WHATSAPP_NUMBER;
  });

  /* ================= 2. Contact form -> WhatsApp delivery ================= */
  var form = doc.getElementById("inquiryForm");
  if (!form) return;

  var statusEl = doc.getElementById("formStatus");
  var submitBtn = doc.getElementById("submitInquiry");
  var SUBMIT_LABEL = submitBtn ? submitBtn.textContent : "Submit Inquiry";

  function setStatus(kind, message) {
    if (!statusEl) return;
    statusEl.className = "form-status" + (kind ? " form-status--" + kind : "");
    statusEl.textContent = message;
  }

  function value(id) {
    var el = doc.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function interests() {
    var picked = [];
    Array.prototype.forEach.call(form.querySelectorAll('input[name="interest"]:checked'), function (cb) {
      picked.push("• " + cb.parentNode.textContent.trim());
    });
    return picked;
  }

  function buildMessage() {
    var lines = [
      "*NEW EDUTAB INQUIRY*",
      "--------------------------------",
      "*Name:* " + value("fullName"),
      "*Institution:* " + value("orgName"),
      "*Email:* " + value("email"),
      "*Phone:* " + value("phone"),
      "*Service interest:* " + (interests().length ? "" : "Not specified")
    ];
    var list = interests();
    if (list.length) lines = lines.concat(list);
    lines.push("--------------------------------");
    lines.push("*Operational requirements:*");
    lines.push(value("message") || "—");
    lines.push("--------------------------------");
    lines.push("Source: Edutab website inquiry form");
    lines.push("Received: " + new Date().toLocaleString());
    return lines.join("\n");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault(); // never posts to a server — routed to WhatsApp instead

    var required = [
      ["fullName", "Full name"],
      ["orgName", "School / college / organization name"],
      ["email", "Email address"]
    ];
    for (var i = 0; i < required.length; i++) {
      var el = doc.getElementById(required[i][0]);
      if (!el.value.trim()) {
        setStatus("err", "Please add your " + required[i][1] + " before sending.");
        el.focus();
        return;
      }
      if (required[i][0] === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) {
        setStatus("err", "That email address doesn't look valid — please check it.");
        el.focus();
        return;
      }
    }

    var phone = value("phone");
    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      setStatus("err", "Please enter a valid phone number (digits, +, spaces or dashes).");
      doc.getElementById("phone").focus();
      return;
    }

    // Prefer the Cloudflare Pages Function when the site has one deployed.
    var localUrl = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(buildMessage());

    if (typeof fetch === "function") {
      busy(true);
      fetch("/api/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
        credentials: "same-origin"
      })
        .then(function (r) {
          return r
            .json()
            .then(function (j) { return { status: r.status, body: j }; })
            .catch(function () { return { status: r.status, body: null }; });
        })
        .then(function (res) {
          busy(false);
          var j = res.body;
          if (res.status === 404 || !j || j.ok !== true) {
            // no function deployed (plain static host) or it rejected the shape
            if (j && j.ok === false && j.errors && j.errors.length) {
              setStatus("err", j.errors.join(" "));
              return;
            }
            handoff(localUrl);
            return;
          }
          if (j.mode === "discarded") {
            // honeypot tripped server-side: acknowledge quietly, open nothing
            finish("Thank you — your inquiry was received.");
            return;
          }
          if (j.delivered) {
            finish(
              "Thank you — your inquiry was delivered to the Edutab technical team and logged " +
                "on our side. We reply on working days, Monday to Saturday.",
              "Inquiry sent ✓"
            );
            return;
          }
          handoff(j.url || localUrl);
        })
        .catch(function () {
          busy(false);
          handoff(localUrl); // network hiccup: never lose the enquiry
        });
      return;
    }

    handoff(localUrl);
  });

  /* ---- submission helpers ---- */
  function payload() {
    var list = [];
    Array.prototype.forEach.call(form.querySelectorAll('input[name="interest"]:checked'), function (cb) {
      list.push(cb.parentNode.textContent.trim());
    });
    return {
      name: value("fullName"),
      org: value("orgName"),
      email: value("email"),
      phone: value("phone"),
      interests: list,
      message: value("message"),
      source: (location.hostname || "edutab") + location.pathname,
      _company: value("hpCompany") // honeypot: always empty for humans
    };
  }

  function busy(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.textContent = on ? "Sending…" : SUBMIT_LABEL;
  }

  function finish(message, buttonLabel) {
    form.reset();
    setStatus("ok", message);
    if (submitBtn) {
      submitBtn.textContent = buttonLabel || "Inquiry sent ✓";
      setTimeout(function () {
        submitBtn.textContent = SUBMIT_LABEL;
        submitBtn.disabled = false;
      }, 4200);
    }
  }

  /* Deep-link mode: hand the composed message to WhatsApp on the visitor's device. */
  function handoff(url) {
    var win = null;
    try {
      win = window.open(url, "_blank", "noopener,width=620,height=760");
    } catch (e) {
      win = null;
    }
    if (!win) {
      form.reset();
      setStatus(
        "ok",
        'WhatsApp was blocked by your browser. <a href="' + url + '" target="_blank" rel="noopener">Click here to open your inquiry on WhatsApp →</a>'
      );
      window.location.href = url;
      return;
    }
    finish(
      "Thank you — your inquiry is ready in WhatsApp (" +
        WA_DISPLAY +
        "). Press send there to reach the Edutab technical team. Working days: Monday to Saturday.",
      "Ready in WhatsApp \u2014 press send ✓"
    );
  }

  /* Character feedback for the message box */
  var msg = doc.getElementById("message");
  var msgCount = doc.getElementById("msgCount");
  if (msg && msgCount) {
    msg.addEventListener("input", function () {
      msgCount.textContent = msg.value.length + " / 1200 characters";
    });
  }
})();
