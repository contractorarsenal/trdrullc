// Cloudflare Worker entry point for traderullc.
//
// Serves the static site through the ASSETS binding and handles the
// /checkout link rotator server-side (see wrangler.toml: run_worker_first
// routes only /checkout through this fetch handler, everything else is
// served directly from static assets).
//
// Rotation pattern (5 regular : 2 affiliate, repeating forever):
//   position = ((counter - 1) % 7) + 1
//   position 1-5 -> regular checkout link
//   position 6-7 -> affiliate checkout link
//
// Across 15 requests this produces:
//   1-5:   regular
//   6-7:   affiliate
//   8-12:  regular
//   13-14: affiliate
//   15:    regular
//
// The counter lives in D1 (binding: CHECKOUT_DB, see schema.sql) and is
// incremented with a single `UPDATE ... RETURNING` statement, which D1
// executes as one atomic write - no read-modify-write race between
// concurrent requests. Destination URLs come from server-only env vars
// (CHECKOUT_URL_REGULAR / CHECKOUT_URL_AFFILIATE) and are never sent to
// the client except as the Location header of the final redirect.
//
// Instagram/Meta's in-app browser fails Whop's payment verification
// (error 3397), so requests from that webview are intercepted before the
// counter is touched and shown a static instruction page instead.

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache",
};

const ALLOW_HEADER = { Allow: "GET, HEAD, OPTIONS" };

function isPrefetchRequest(request) {
  const headers = request.headers;
  const purpose = (
    headers.get("Sec-Purpose") ||
    headers.get("Purpose") ||
    headers.get("X-Moz-Purpose") ||
    ""
  ).toLowerCase();
  return purpose.includes("prefetch") || purpose.includes("preview");
}

// Instagram/Meta's in-app webview fails Whop's payment-verification step
// (error 3397). These UA tokens identify that webview; none of them appear
// in real Safari/Chrome/Firefox user agents.
const IN_APP_BROWSER_UA_PATTERN = /instagram|fban|fbav/i;

function isInstagramInAppBrowser(request) {
  const ua = request.headers.get("User-Agent") || "";
  return IN_APP_BROWSER_UA_PATTERN.test(ua);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Self-contained instruction page for Instagram/Meta in-app browsers. Shows
// no Whop URL, affiliate id, D1 state, or rotation position - only the
// public /checkout link the visitor already has.
function inAppBrowserInstructionPage(checkoutUrl) {
  const safeUrl = escapeHtml(checkoutUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Open in Safari or Chrome</title>
<style>
  :root {
    --accent: #FF5A36;
    --accent-hover: #E8462B;
    --charcoal: #151517;
    --card-dark: #19191C;
    --muted-dark: #A7A5A1;
    --border-dark: rgba(255,255,255,0.14);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--charcoal);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 460px;
    background: var(--card-dark);
    border: 1px solid var(--border-dark);
    border-radius: 20px;
    padding: 32px 24px;
  }
  .eyebrow {
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin: 0 0 12px;
  }
  h1 {
    font-size: clamp(22px, 5.5vw, 28px);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin: 0 0 16px;
  }
  p.message {
    font-size: 15px;
    line-height: 1.6;
    color: var(--muted-dark);
    margin: 0 0 24px;
  }
  ol {
    margin: 0 0 28px;
    padding-left: 20px;
    font-size: 15px;
    line-height: 1.7;
    color: #fff;
  }
  ol li { margin-bottom: 8px; }
  ol li:last-child { margin-bottom: 0; }
  .kbd {
    display: inline-block;
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--border-dark);
    border-radius: 6px;
    padding: 1px 7px;
    font-size: 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .link-box {
    display: block;
    width: 100%;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--border-dark);
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 13px;
    color: var(--muted-dark);
    word-break: break-all;
    margin-bottom: 14px;
  }
  .copy-btn {
    display: block;
    width: 100%;
    height: 50px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    cursor: pointer;
  }
  .copy-btn:hover, .copy-btn:active { background: var(--accent-hover); }
  .copy-status {
    min-height: 20px;
    text-align: center;
    font-size: 13px;
    margin: 10px 0 0;
  }
  .copy-status.ok { color: #4ADE80; }
  .copy-status.err { color: #FCA5A5; }
</style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">Checkout</p>
    <h1>Open this page in Safari or Chrome</h1>
    <p class="message">Instagram&rsquo;s browser may block secure payment verification. Open this checkout in your regular browser before entering your payment information.</p>
    <ol>
      <li>Tap the <span class="kbd">&bull;&bull;&bull;</span> menu in the top-right corner.</li>
      <li>Select <strong>Open in browser</strong>, <strong>Open in Safari</strong>, or <strong>Open in Chrome</strong>.</li>
      <li>Complete checkout in the browser that opens.</li>
    </ol>
    <div class="link-box" id="linkBox">${safeUrl}</div>
    <button class="copy-btn" id="copyBtn" type="button" data-url="${safeUrl}">Copy checkout link</button>
    <p class="copy-status" id="copyStatus" role="status" aria-live="polite"></p>
  </main>
  <script>
  (function () {
    var btn = document.getElementById("copyBtn");
    var status = document.getElementById("copyStatus");
    var url = btn.getAttribute("data-url");

    function showStatus(message, ok) {
      status.textContent = message;
      status.className = "copy-status " + (ok ? "ok" : "err");
    }

    function fallbackCopy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        showStatus(ok ? "Link copied." : "Could not copy automatically. Long-press the link above to copy it.", ok);
      } catch (e) {
        showStatus("Could not copy automatically. Long-press the link above to copy it.", false);
      }
    }

    btn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showStatus("Link copied.", true);
        }, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  })();
  </script>
</body>
</html>
`;
}

async function handleCheckoutGet(request, env) {
  // Instagram/Meta in-app browsers must never reach Whop or touch the
  // counter - intercept before any of that happens.
  if (isInstagramInAppBrowser(request)) {
    const url = new URL(request.url);
    const checkoutUrl = `${url.origin}${url.pathname}`;
    return new Response(inAppBrowserInstructionPage(checkoutUrl), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Vary: "User-Agent",
      },
    });
  }

  // Speculative/preloading requests (Chrome/Edge preload, Firefox link
  // prefetch, etc.) must not advance the counter.
  if (isPrefetchRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  const regularUrl = env.CHECKOUT_URL_REGULAR;
  const affiliateUrl = env.CHECKOUT_URL_AFFILIATE;

  if (!regularUrl || !affiliateUrl || !env.CHECKOUT_DB) {
    return new Response("Checkout is temporarily unavailable.", {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }

  const row = await env.CHECKOUT_DB.prepare(
    "UPDATE checkout_counter SET value = value + 1 WHERE id = 1 RETURNING value"
  ).first();

  const counter = row.value;
  const position = ((counter - 1) % 7) + 1;
  const destination = position <= 5 ? regularUrl : affiliateUrl;

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      ...NO_STORE_HEADERS,
    },
  });
}

async function handleCheckout(request, env) {
  switch (request.method) {
    case "GET":
      return handleCheckoutGet(request, env);
    // HEAD/OPTIONS/anything else must never reveal a destination or touch
    // the counter, so they always get an empty, uncached response.
    case "HEAD":
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
    case "OPTIONS":
      return new Response(null, {
        status: 204,
        headers: { ...NO_STORE_HEADERS, ...ALLOW_HEADER },
      });
    default:
      return new Response(null, {
        status: 405,
        headers: { ...NO_STORE_HEADERS, ...ALLOW_HEADER },
      });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/checkout") {
      return handleCheckout(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
