# Trader U — Project Instructions

## 1. Project identity

- **Business:** Trader U LLC ("Trader U"), per the legal pages.
- **What it sells:** trading education and community access, checked out through Whop.
- **Public offerings, as displayed on the site:**
  - Main program: **$697** one-time, plus applicable taxes (root `index.html`).
  - Workshops: **$149.99 per class** (`workshops/index.html`).
  - Free community access: **$0** join (`free-access/index.html`).
  - Priority access: **$9.99** one-time (`free-access/index.html`).
  - 1-on-1 coaching: application form only. Investment ranges $1,000 to $2,500+ (`1-on-1/index.html`).
  - Test Your Skills simulator: `tys/` (primary) and `test-your-skills/` (older copy).
- **Treat displayed prices as observed values.** They are not proof of current Whop checkout prices. Verify in the Whop dashboard.
- **Risk disclaimers are required.** The footer of `index.html` and the legal pages carry them (memecoins can lose value, past performance is not indicative, results are not guaranteed). Keep them on every public page.
- **Never invent** trading results, customer testimonials, returns, win rates, or guarantees. The site's existing testimonials and "Real Results" language are unverified. Do not add to them.

## 2. Active codebase

**Live (root):**
- `index.html` — active sales page.
- `src/index.js` — active Cloudflare Worker entry point. Serves `/checkout` as a fixed 302 to Whop and passes everything else to static assets.
- `wrangler.toml` — Worker config. Worker name `traderullc`, `main = "src/index.js"`, assets from `.`, `run_worker_first = ["/checkout"]`.
- `.assetsignore` — keeps `.git`, `.wrangler`, `.gitignore`, `.assetsignore`, `*.toml`, `schema.sql`, `src/`, `functions/` out of Worker assets. Anything added to root that must stay private must be added here.
- `workshops/`, `free-access/`, `1-on-1/`, `tys/`, `test-your-skills/`, `careers/`, `eula.html`, `privacy.html`, `terms.html`, `refund.html`.
- `functions/checkout.js` — Pages-format copy of the same fixed redirect. Not the live path. Keep consistent with `src/index.js`.
- `schema.sql` — defines `checkout_counter`. See section 3.

**Legacy and duplicate (do not edit without explicit authorization):**
- `Traderu/` — a full copy of the root site. Its homepage is byte-identical to root. Also served on the production domain at `/Traderu/`.
- `trdrullc/` — an older, different copy. Its homepage shows **$497 / $497.99** pricing. Also served at `/trdrullc/`. Contains `trdrullc/src/index.js`, which holds the retired affiliate rotation logic and D1 logic.
- `1-on-1/`, `careers/`, `workshops/` also exist under `Traderu/` and `trdrullc/`.

**Testing:** `tys/tests/` (plain Node, no dependencies). Run with `node tys/tests/run.js`. Test files are currently publicly served (see section 6).

## 3. Checkout and payment protection

**Live checkout path:**
- Site CTAs (root homepage, 8 links) point to `/checkout`.
- `/checkout` → HTTP 302 → `https://whop.com/checkout/plan_ZGMrESSXs8qbw`. Observed 10 of 10 times. No rotation.
- This is the only Whop plan mapping the homepage uses. Whop price and product for this plan are unverified.

**Other Whop plan IDs in active pages (observed in HTML, not verified in Whop):**

| Plan ID | Where | Observed purpose |
|---|---|---|
| `plan_ixsAyhNSR5jCU` | `workshops/index.html` (direct link) | Workshops, $149.99 per class |
| `plan_XaTcmWp2Aibbe` | `free-access/index.html` (also in JS as `plan:`) | Free join, $0 |
| `plan_vHH2NoS91hj9Z` | `free-access/index.html` | Priority Access, $9.99 |

**Rules:**
- Never change a price in the repo to match or fix a number without Whop verification and explicit approval.
- Never replace a Whop plan ID without verifying it in the Whop dashboard and getting approval.
- Never reactivate affiliate or rotation logic (see `trdrullc/src/index.js`). Attribution changes need explicit approval.
- Never execute a real purchase to test checkout. Verify routing by reading the 302 `Location` header only. Do not follow it.
- Never claim a checkout works without testing the appropriate workflow with the user.
- The `/checkout` HEAD response is `204` and GET is `302`. This is intentional prefetch handling. Do not "fix" it.

**D1:** `CHECKOUT_DB` is bound in `wrangler.toml` but not used by the active Worker. `schema.sql` creates `checkout_counter` for the retired rotation logic. Do not add D1 usage to the live Worker without approval.

## 4. Standard remote commands

- **"Check website"** — Read-only. `curl -I` and read `Location` headers for `/checkout`. Spot-check the homepage and key pages against the expected status and content. Report differences. Do not edit files.
- **"Update website"** — Implement the requested change in root files only, unless the user names a legacy path. Verify locally by reading and by running `node tys/tests/run.js` if the simulator changed. Do not commit. Do not push.
- **"Push live"** — Only with explicit authorization in that message. Before pushing: review `git diff origin/main`, confirm the change is on root, confirm no secrets and no legacy-path edits, confirm checkout routing is unchanged, and confirm the Cloudflare production branch and domain route have been verified. Then commit and push to `main`. Report the commit SHA and what Cloudflare Workers Builds and GitHub Pages do.
- **"Status"** — Report `git branch -vv`, `git status`, `git log -1 --oneline`, and the open items in section 6. Do not scan the whole repo.
- **"Refresh context"** — Read this file. Run `git log --oneline origin/main -10` and `git diff --stat` against the last known commit. Read only the changed files that matter. No full-repo scan.

## 5. GitHub and Cloudflare

- **Repository:** `contractorarsenal/trdrullc`. **Public.** Default branch `main`. Local folder is a verified clone (`origin` set, `main` tracking `origin/main`).
- **Git identity** is set in repo-local config only. Do not change global config.
- **Worker:** `traderullc` on Cloudflare.
- **Observed domain:** `traderuinsider.com`, proxied through Cloudflare. `www` has no DNS record.
- **Push to `main` triggers:**
  - A Cloudflare Workers Builds run (verified via check run on `af60a87`). Whether it deploys to production is unverified.
  - A GitHub Pages build of the whole repo at `https://contractorarsenal.github.io/trdrullc/` (verified).
- **Treat every push to `main` as production-sensitive.**
- **Never** force-push, discard uncommitted changes, reset to remote history, or merge **PR #2** (`cloudflare/workers-autoconfig`, opened by the Cloudflare bot, adds `wrangler.jsonc`) without explicit approval.
- **Never** modify Cloudflare routes, DNS, custom domains, build settings, or GitHub Pages settings without explicit authorization.

## 6. Known issues (outstanding, do not auto-fix)

1. **Stale pricing live.** `traderuinsider.com/trdrullc/` advertises $497 / $497.99 "current offer." It is indexable.
2. **Duplicate site trees** are served on the domain: `/Traderu/` (identical to root) and `/trdrullc/` (stale).
3. **GitHub Pages exposes configuration and source.** `wrangler.toml` (includes a D1 database ID), `schema.sql`, `src/index.js`, `functions/checkout.js`, and nested copies return 200 on `github.io`. The `.assetsignore` file does not protect Pages.
4. **The repo is public.** Everything in it is readable. A secret scan found no credentials.
5. **Test files are public:** `tys/tests/*` returns 200 on the domain.
6. **D1 binding** appears unused by active code.
7. **Open PR #2** (Cloudflare autoconfig) requires review. It would change build and deploy settings if merged.
8. **Whop prices and product mappings** need dashboard verification.
9. **Cloudflare production route** (which Worker serves `traderuinsider.com`, and the production branch) requires dashboard verification.
10. **Workshop after-purchase page** (`workshops/after-purchase/`) has no inbound links from any page. It is reachable only by URL.

## 7. Security

- **Never commit** secrets, `.dev.vars`, `.env` files, private tokens, API keys, customer data, or exports from Whop or the Web3Forms dashboard.
- **Never print credential values.** Report presence and location only.
- The **Web3Forms access key** in the forms is client-side by design. It is not a server secret. Do not change it without approval.
- The **D1 database ID** and the **Cloudflare account ID** are identifiers, not credentials. Do not add them to any new public file either.
- **Before any commit,** scan the staged diff for secret-shaped strings (`sk_live`, `pk_live`, `whsec_`, `AKIA`, `BEGIN … PRIVATE KEY`, `gh[pousr]_`, `xox[bpsa]-`, `AIza`, JWT-shaped `eyJ`).
- Do not modify production checkout or deployment configuration as part of documentation or routine updates.
- Preserve legal disclaimers and consumer protections. Do not change refund, terms, or privacy text without approval.

## 8. Token-efficient operating rules

- Read this file first. Do not re-derive the architecture.
- Use targeted reads and `grep` with fixed strings. Avoid reading the large HTML pages (`index.html` is ~88 KB) in full. Use `grep -n` plus `sed -n` line ranges.
- Ignore `Traderu/` and `trdrullc/` unless the task names them.
- Do not launch subagents for routine checks.
- Run tests only when the simulator or Worker code changes.
- Keep reports short. Lead with what changed or what is blocked.

## 9. Working agreement

- Make changes in root files only, unless the user names a legacy path.
- Ask before touching anything in section 5 or 6.
- When in doubt about a price, a Whop plan ID, or a legal line: stop and ask.
