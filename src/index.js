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
// The counter lives in D1 (binding: CHECKOUT_DB, see schema.sql) and is
// incremented with a single `UPDATE ... RETURNING` statement, which D1
// executes as one atomic write - no read-modify-write race between
// concurrent requests. Destination URLs come from server-only env vars
// (CHECKOUT_URL_REGULAR / CHECKOUT_URL_AFFILIATE) and are never sent to
// the client except as the Location header of the final redirect.

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

async function handleCheckoutGet(request, env) {
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
