// Cloudflare Worker entry point for traderullc.
//
// Serves the static site through the ASSETS binding and handles /checkout
// server-side (see wrangler.toml: run_worker_first routes only /checkout
// through this fetch handler, everything else is served directly from
// static assets).
//
// /checkout is an uncached 302 redirect. Eligible GET visits rotate across the
// regular checkout (CHECKOUT_URL below) and the affiliate checkout
// (CHECKOUT_URL_AFFILIATE secret), using the D1 counter. Instagram in-app
// browsers, HEAD/OPTIONS, prefetch, and any missing config or D1 failure use
// the regular checkout. There is no instruction page.

const CHECKOUT_URL = "https://whop.com/checkout/plan_ZGMrESSXs8qbw";

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

// Rotation: in each seven-visit cycle, positions 1-5 go to the regular checkout
// and positions 6-7 go to the affiliate checkout (CHECKOUT_URL_AFFILIATE secret).
// The position comes from the shared D1 counter in checkout_counter
// (CHECKOUT_DB binding).
const CHECKOUT_CYCLE = 7;
const CHECKOUT_AFFILIATE_FIRST_SLOT = 6;

function isInstagramBrowser(request) {
  // Best-effort: Instagram's in-app browser identifies itself in the UA.
  return (request.headers.get("User-Agent") || "").includes("Instagram");
}

// Advances the counter atomically and returns the destination for this visit.
// Any missing config or D1 error falls back to the regular checkout.
async function chooseCheckoutDestination(env) {
  const affiliateUrl = env.CHECKOUT_URL_AFFILIATE;
  if (!affiliateUrl || !env.CHECKOUT_DB) {
    return CHECKOUT_URL;
  }

  try {
    const row = await env.CHECKOUT_DB.prepare(
      "UPDATE checkout_counter SET value = value + 1 WHERE id = 1 RETURNING value"
    ).first();
    if (!row || typeof row.value !== "number") {
      return CHECKOUT_URL;
    }
    const position = ((row.value - 1) % CHECKOUT_CYCLE) + 1;
    return position >= CHECKOUT_AFFILIATE_FIRST_SLOT ? affiliateUrl : CHECKOUT_URL;
  } catch (err) {
    return CHECKOUT_URL;
  }
}

async function handleCheckoutGet(request, env) {
  // Speculative/preloading requests (Chrome/Edge preload, Firefox link
  // prefetch, etc.) must not be sent to Whop early and must not use a slot.
  if (isPrefetchRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  // Instagram in-app visitors always go straight to the regular checkout and
  // do not advance the counter.
  const destination = isInstagramBrowser(request)
    ? CHECKOUT_URL
    : await chooseCheckoutDestination(env);

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
    // HEAD/OPTIONS/anything else always get an empty, uncached response.
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

// Same-origin caption route. The WebVTT file lives in the R2 bucket bound as
// MEDIA (not in the Git repo), so the homepage <track> loads it without a
// cross-origin request and without needing CORS on the bucket.
const CAPTION_ROUTES = {
  "/media/captions/traderu-v20.en.vtt": "captions/traderu-v20.en.vtt",
};

async function handleCaptions(request, env, key) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...NO_STORE_HEADERS, ...ALLOW_HEADER },
    });
  }

  const object = await env.MEDIA.get(key);
  if (!object) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ETag: object.httpEtag,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/checkout") {
      return handleCheckout(request, env);
    }

    const captionKey = CAPTION_ROUTES[url.pathname];
    if (captionKey) {
      return handleCaptions(request, env, captionKey);
    }

    return env.ASSETS.fetch(request);
  },
};
