---
name: google-site-setup
description: Provision Google Analytics 4, Google Tag Manager, and Search Console for a website project. Infers project context, asks for gaps, runs the CLI, and offers to inject the GTM snippet. Also supports adding event tracking and Search Console owners.
user_invocable: true
---

# Google Site Setup

Automate GA4, GTM, and Search Console provisioning for the current project.

## Prerequisites

- The `google-site-setup` CLI must be installed globally. Check with `google-site-setup --version`.
  - If not installed: `npm i -g @bearmarketing/google-site-setup`
  - If outdated: `npm i -g @bearmarketing/google-site-setup@latest`
- The `GOOGLE_SERVICE_ACCOUNT_KEY` env var must point to a Google service account JSON key file.
- If the user hasn't run `init` yet, suggest: `google-site-setup init`

## Workflow

### Step 0: Determine the target project

The user may invoke this skill from a directory that is NOT the target project (e.g. from the tool's own repo, or from a different project). Before inferring context:

- If the current directory doesn't look like a website project (no `package.json` with a web framework, no `wp-config.php`, etc.), ask the user which project they want to set up.
- If the user provides a project path, use that for all context inference in Step 1.
- The CLI itself always runs from its install location — only the context inference needs the project path.

### Step 1: Infer project context

Read these files (in the target project) to infer the domain, sitemap URL, and framework:

1. **Domain**: Check in order:
   - `.env` or `.env.local` or `.env.production` for `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `BASE_URL`, `DOMAIN`, or similar
   - `next.config.js` / `next.config.mjs` / `next.config.ts` for domain references
   - `nuxt.config.ts` for `runtimeConfig.public.siteUrl`
   - `astro.config.mjs` for `site` field
   - `package.json` for `homepage` field
   - WordPress `wp-config.php` for `WP_HOME` or `WP_SITEURL`

2. **Sitemap**: Check in order:
   - `public/sitemap.xml` or `public/sitemap-index.xml`
   - `next-sitemap.config.js` (if using next-sitemap)
   - `robots.txt` for `Sitemap:` directive
   - Default to `https://{domain}/sitemap.xml`

3. **Existing tracking**: Search the codebase for existing GA/GTM:
   - Grep for `GTM-`, `G-`, `UA-`, `googletagmanager`, `gtag`
   - If found, warn the user that tracking already exists and confirm before proceeding

4. **Framework**: Detect from package.json dependencies (next, nuxt, astro, gatsby, etc.) or WordPress files. This determines where to inject the GTM snippet later.

### Step 2: Ask for gaps

Use AskUserQuestion to collect anything that couldn't be inferred:

- **Domain** (if not found): "What's the production domain for this site?"
- **GA4 Account ID** (always, unless saved in `~/.google-site-setup/config.json`): "What's your GA4 account ID? (Find it in GA4 Admin > Account Settings)"
- **GTM Account ID** (always, unless saved in config): "What's your GTM account ID? (Find it in GTM > Admin)"
- **Sitemap URL** (if not found): "What's the sitemap URL? (or press Enter to skip)"
- **Display name** (optional): Default to the domain

### Step 2.5: Pre-flight account-ID sanity check (sticky-config recovery)

Account IDs from `~/.google-site-setup/config.json` are sticky — they were saved by the most recent `init` and may belong to a previous client. Before running provision:

- If the user is setting up a new site for a *different* client/agency than last time, ask: "Last `init` saved GA account `{X}` and GTM account `{Y}`. Use those, or set new ones?"
- For one-off runs that should ignore the saved IDs, pass `--no-saved-config` along with explicit `--ga-account` and `--gtm-account`.
- For non-interactive runs (CI, JSON mode) that intend to use saved IDs, pass `--confirm-saved-config` to acknowledge that fact.

`provision` will print a header showing which IDs are being used and whether they came from a flag or saved config — read it and confirm before each run.

### Step 3: Run the CLI

Pick a verification method (most users want `meta` — it's the new default and works on any site you can edit):

| Method   | When to use |
|----------|-------------|
| `meta`   | Default. You can edit the site's `<head>`. Works for static, framework, WP. |
| `file`   | You can upload a file to the web root. |
| `dns`    | You have DNS access for the domain. (v1.0 default — now opt-in.) |
| `gtm`    | The GTM container snippet is already on the live site. |
| `analytics` | GA4/gtag is already firing on the live site. |

Execute via Bash:

```
google-site-setup provision \
  --domain {domain} \
  --ga-account {gaAccountId} \
  --gtm-account {gtmAccountId} \
  --sitemap {sitemapUrl} \
  --name "{displayName}" \
  --verification-method meta \
  --json
```

Optional split-flag forms:
- `--skip-ga4 --measurement-id G-XXXX` — re-run only GTM + GSC against an existing GA4 property
- `--skip-gtm` — provision GA4 + GSC only
- `--skip-gsc` — skip Search Console entirely (private/staging sites)

Parse the JSON output to extract:
- `ga4.measurementId` — the G-XXXXXXXXXX ID
- `gtm.containerPublicId` — the GTM-XXXXXXX ID
- `gtm.snippet.head` — the head snippet
- `gtm.snippet.body` — the body snippet
- `gsc.verified` — whether Search Console verification succeeded
- `gsc.verificationMethod` — which method was used
- `gsc.verificationToken` — token to embed in meta tag, file, DNS TXT, etc.
- `gsc.verificationInstructions` — pre-rendered instruction block for the user
- `gsc.sitemapDeferred` — `true` when sitemap submission was queued because the site isn't verified yet
- `gsc.sitemapPending` — sitemap URL queued for retry
- `gsc.followUpCommand` — exact command to run after the verification record goes live
- `accountIdSource.{ga4,gtm}` — `flag` | `config` | `none` (so the agent can warn if a sticky-config ID was used)

### Step 4: Report results

Show the user:
- GA4 Measurement ID
- GTM Container ID
- Search Console status (verified or DNS instructions)

### Step 5: Offer GTM snippet injection

Ask the user if they want the GTM snippet injected into their project. If yes, inject based on framework:

**Next.js App Router** (`app/layout.tsx`):
- Add head snippet inside `<head>` via `next/script` with `strategy="afterInteractive"` or directly in the layout
- Add body snippet right after `<body>`

**Next.js Pages Router** (`pages/_document.tsx`):
- Add head snippet in `<Head>`
- Add body snippet after `<body>` in `<Main>`

**Nuxt** (`nuxt.config.ts`):
- Add to `app.head.script` and `app.head.noscript`

**Astro** (`src/layouts/Layout.astro` or similar):
- Add head snippet in `<head>`
- Add body snippet after `<body>`

**WordPress** (`header.php` or theme's `functions.php`):
- Add via `wp_head` and `wp_body_open` hooks

**Static HTML**:
- Add directly to `<head>` and after `<body>`

### Step 6: Environment variables

Offer to add the measurement ID to the project's `.env` file:
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

### Step 7: Add Search Console owner

The service account owns the verification by default. Ask the user which Google account should have access to Search Console and add them:

```
google-site-setup add-owner {domain} {email}
```

This lets the user access Search Console at `https://search.google.com/search-console?resource_id=sc-domain:{domain}`.

### Step 8: Verify and fix (if verification or sitemap was deferred)

If Search Console verification was pending during provisioning (`gsc.verified: false`) or the sitemap was deferred (`gsc.sitemapDeferred: true`), the user can retry once the verification record / meta tag / file / GTM tag is live:

```
google-site-setup status {domain} --fix
```

The `--fix` flag will:
- Retry verification using whichever method was originally chosen (persisted in site config)
- Submit any deferred sitemap once verification succeeds

If a different verification method needs to be tried (e.g. user couldn't add the meta tag and wants DNS instead), use:

```
google-site-setup add-verification {domain} --method dns
```

## Conversion stubs (Google Ads, Meta Pixel, MS Clarity, LinkedIn)

Most real sites need conversion mirroring beyond GA4. After provisioning, scaffold paused tag stubs in GTM:

```
# All four platforms
google-site-setup setup-conversions {domain}

# Subset
google-site-setup setup-conversions {domain} --platforms=ads,meta
```

This adds *paused* tags with placeholder IDs (`__PIXEL_ID__`, `__CONVERSION_ID__`, etc.) so the container is safe to publish — nothing fires until the user opens GTM, replaces the placeholder, attaches a trigger, and unpauses.

## Event Tracking

After initial setup, the user may want custom event tracking (e.g. form submissions, purchases). Use the `add-event` command:

```
# Simple event with custom parameters
google-site-setup add-event {domain} form_submit --params form_name

# Ecommerce event (purchase, add_to_cart, etc.)
google-site-setup add-event {domain} purchase --ecommerce
```

This creates a GTM custom event trigger, optional data layer variables, and a GA4 event tag — then publishes the container.

The user's code needs to push matching events to the dataLayer:
```js
// Simple event
window.dataLayer?.push({ event: "form_submit", form_name: "contact" });

// Ecommerce event (clear first to avoid stale data)
window.dataLayer?.push({ ecommerce: null });
window.dataLayer?.push({
  event: "purchase",
  ecommerce: {
    transaction_id: "T123",
    value: 49.99,
    currency: "USD",
    items: [{ item_name: "Product", quantity: 1, price: 49.99 }],
  },
});
```

When helping add events, also offer to inject the dataLayer push into the relevant component in the target project.
