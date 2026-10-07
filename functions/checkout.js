// Server-side /checkout redirect (Cloudflare Pages Functions format).
//
// Fixed, uncached 302 redirect to CHECKOUT_URL below. Every visitor -
// including Instagram/Facebook in-app browsers - gets the same
// destination. There is no regular/affiliate split, no D1 lookup, and no
// intermediate instruction page.
//
// Note: the live deployment is the Worker in src/index.js (see
// wrangler.toml: run_worker_first = ["/checkout"], main = "src/index.js").
// This file is kept consistent in case a Pages deployment of this repo
// ever picks it up instead.

const CHECKOUT_URL = "https://whop.com/checkout/plan_ZGMrESSXs8qbw";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache",
};

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

export async function onRequestGet(context) {
  const { request } = context;

  // Speculative/preloading requests (Chrome/Edge preload, Firefox link
  // prefetch, etc.) must not be sent to Whop early.
  if (isPrefetchRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: CHECKOUT_URL,
      ...NO_STORE_HEADERS,
    },
  });
}

// HEAD/OPTIONS must never touch anything, so they always get an empty,
// uncached response.
export async function onRequestHead() {
  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...NO_STORE_HEADERS, Allow: "GET, HEAD, OPTIONS" },
  });
}
