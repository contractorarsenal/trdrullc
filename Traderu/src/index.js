// Cloudflare Worker entry point for traderullc.
//
// Serves the static site through the ASSETS binding and handles /checkout
// server-side (see wrangler.toml: run_worker_first routes only /checkout
// through this fetch handler, everything else is served directly from
// static assets).
//
// /checkout is a fixed, uncached 302 redirect to CHECKOUT_URL below. Every
// visitor - including Instagram/Facebook in-app browsers - gets the same
// destination. There is no regular/affiliate split, no D1 lookup, and no
// intermediate instruction page.

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

function handleCheckoutGet(request) {
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

function handleCheckout(request) {
  switch (request.method) {
    case "GET":
      return handleCheckoutGet(request);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/checkout") {
      return handleCheckout(request);
    }

    return env.ASSETS.fetch(request);
  },
};
