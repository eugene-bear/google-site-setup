# google-site-setup

Provision Google Analytics 4, Google Tag Manager, and Google Search Console for a new website in one command.

Every site launch needs the same setup: a GA4 property + web data stream, a GTM container with a published GA4 tag, and a Search Console property with the sitemap submitted. This CLI does all of it via the official Google APIs and prints the GTM snippet you paste into your site.

```bash
npm i -g @bearmarketing/google-site-setup
google-site-setup init
google-site-setup provision --domain example.com --sitemap https://example.com/sitemap.xml
```

[![npm](https://img.shields.io/npm/v/@bearmarketing/google-site-setup.svg)](https://www.npmjs.com/package/@bearmarketing/google-site-setup)

---

## What it does

| Service | What gets created |
|---|---|
| **GA4** | Property + web data stream for the domain. Returns the `G-XXXX` measurement ID. |
| **GTM** | Web container with built-in variables, an All Pages trigger, the Google Tag (GA4) wired to your measurement ID. Versioned and **published**. Returns the `GTM-XXXX` ID and the head/body snippets. |
| **GSC** | Site added to Search Console. Verification is requested via your chosen method (default `meta`). Sitemap is submitted (or deferred until verification lands). |

Re-running on the same domain is **idempotent** — existing GA4 properties and GTM containers are detected and reused.

---

## Install

```bash
npm i -g @bearmarketing/google-site-setup
```

Requires Node 18+.

---

## Setup (one time)

You need a Google Cloud service account with the right APIs enabled and access to your GA / GTM / Search Console accounts. The `init` command walks you through it:

```bash
google-site-setup init
```

It will:

1. Ask for the path to a service account JSON key (set `GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/key.json` in your shell first).
2. Validate access to GA4, GTM, and Search Console.
3. Save your GA + GTM account IDs and your default timezone/currency to `~/.google-site-setup/config.json`.

### Manual prerequisites

If you don't have a service account yet:

1. Pick or create a Google Cloud project: <https://console.cloud.google.com/>
2. Enable these APIs:
   - [Google Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com)
   - [Tag Manager API](https://console.cloud.google.com/apis/library/tagmanager.googleapis.com)
   - [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)
   - [Site Verification API](https://console.cloud.google.com/apis/library/siteverification.googleapis.com)
3. Create a service account: <https://console.cloud.google.com/iam-admin/serviceaccounts>
4. Download the JSON key and `export GOOGLE_SERVICE_ACCOUNT_KEY="/path/to/key.json"`.
5. Grant the service account access in each Google product:
   - **GA4** → Admin → Account Access Management → add as **Editor**
   - **GTM** → Admin → User Management → add as **Admin**
   - **Search Console** → Settings → Users and permissions → add as **Owner**

---

## Provisioning a site

```bash
google-site-setup provision \
  --domain example.com \
  --sitemap https://example.com/sitemap.xml
```

The output prints which account IDs are being used (and where they came from), each step's progress, and a final summary with your GA4 measurement ID, GTM container ID, and the GTM snippet to paste into your site.

### Options

| Flag | Description |
|---|---|
| `--domain <domain>` | (required) Website domain. `https://` and trailing slashes are stripped. |
| `--sitemap <url>` | Sitemap URL to submit to Search Console. |
| `--name <name>` | Display name for the GA4 property and GTM container (defaults to the domain). |
| `--ga-account <id>` | GA4 account ID. Falls back to saved config from `init`. |
| `--gtm-account <id>` | GTM account ID. Falls back to saved config from `init`. |
| `--measurement-id <id>` | Existing `G-XXXX` measurement ID, useful with `--skip-ga4`. |
| `--timezone <tz>` | IANA timezone. Falls back to saved config, then `America/New_York`. |
| `--currency <code>` | ISO currency code. Falls back to saved config, then `USD`. |
| `--verification-method <method>` | GSC verification method: `meta` (default), `file`, `dns`, `gtm`, `analytics`. |
| `--skip-ga4` | Skip GA4 property creation. Requires `--measurement-id` or a saved one. |
| `--skip-gtm` | Skip GTM container creation. |
| `--skip-gsc` | Skip Search Console submission. |
| `--no-saved-config` | Ignore `~/.google-site-setup/config.json` for this run. |
| `--confirm-saved-config` | Acknowledge that account IDs came from saved config (for non-interactive runs). |
| `--dry-run` | Validate inputs and check existing resources without making any API calls. |
| `--json` | Emit machine-readable JSON. |

### JSON output

`--json` is the easiest way to wire this into another script or skill:

```json
{
  "domain": "example.com",
  "ga4": {
    "measurementId": "G-XXXXXXXXXX",
    "propertyId": "properties/123456789",
    "skipped": false
  },
  "gtm": {
    "containerPublicId": "GTM-XXXXXXX",
    "containerId": "12345678",
    "snippet": { "head": "...", "body": "..." },
    "skipped": false
  },
  "gsc": {
    "siteUrl": "https://example.com/",
    "verified": false,
    "verificationMethod": "meta",
    "verificationToken": "<token>",
    "verificationInstructions": "...",
    "sitemapDeferred": true,
    "sitemapPending": "https://example.com/sitemap.xml",
    "followUpCommand": "google-site-setup status example.com --fix"
  },
  "accountIdSource": { "ga4": "config", "gtm": "config" }
}
```

---

## Verification methods

GA4 and GTM provisioning don't require any DNS or file access — they're pure API calls. Search Console does, because Google needs to confirm you own the site. Pick the method that matches your access:

| Method | When to use it |
|---|---|
| `meta` (default) | You can edit the site's `<head>`. Works for static sites, SSGs, frameworks, WordPress. |
| `file` | You can upload a file to the web root. |
| `dns` | You have DNS access for the domain (works for `sc-domain:` properties — recommended for production). |
| `gtm` | The GTM container snippet is already deployed and live. |
| `analytics` | GA4 / gtag is already firing on the live site. |

After provisioning, you'll see instructions for the chosen method (the meta tag, the DNS TXT record, the file path, etc.). Drop the record in place, then:

```bash
google-site-setup status example.com --fix
```

…to retry verification and submit the deferred sitemap.

If you change your mind about which method to use:

```bash
google-site-setup add-verification example.com --method dns
```

---

## Other commands

### `status [domain]`

Show what's been provisioned for a domain, both as recorded in local config and as currently live in Google.

```bash
google-site-setup status example.com
google-site-setup status example.com --fix    # retry verification + submit deferred sitemap
google-site-setup status example.com --json
```

### `add-owner <domain> <email>`

Add a Google account as a verified owner of the Search Console property so a human can sign in and use it. The service account stays as the owning identity that the CLI authenticates with.

```bash
google-site-setup add-owner example.com someone@example.com
```

### `add-event <domain> <event-name>`

Wire up a custom event tag in GTM that forwards to GA4. Creates a custom-event trigger, optional dataLayer-variable definitions, a GA4 event tag, and publishes the container.

```bash
google-site-setup add-event example.com form_submit --params form_name
google-site-setup add-event example.com purchase --ecommerce
```

Your site code pushes matching events to the dataLayer:

```js
window.dataLayer?.push({ event: "form_submit", form_name: "contact" });

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

### `setup-conversions <domain>`

Add **paused** stub tags for Google Ads, Meta Pixel, Microsoft Clarity, and LinkedIn Insight Tag. The placeholders (`__PIXEL_ID__`, `__CONVERSION_ID__`, etc.) keep the container safe to publish — nothing fires until you open GTM, replace the ID, attach a trigger, and unpause.

```bash
google-site-setup setup-conversions example.com
google-site-setup setup-conversions example.com --platforms=ads,meta
```

Supported platforms: `ads`, `meta`, `clarity`, `linkedin`.

### `add-verification <domain>`

Request (or retry) Search Console verification using a chosen method. Useful when you initially used `meta` but want to switch to `dns`, or vice versa.

```bash
google-site-setup add-verification example.com --method dns
```

---

## Errors you might hit

The CLI translates common Google API failures into one-line diagnostics with the fix:

- **GTM access:** *"Service account `sa@…` has no access to GTM account `12345`. Add it as Admin in tagmanager.google.com → Admin → User Management."*
- **GA4 access:** *"Service account `sa@…` has no access to GA4 account `67890`. Add it as Editor in analytics.google.com → Admin → Account Access Management."*
- **GSC unverified:** *"Search Console site for `example.com` is not verified yet. Verify the site, then run `google-site-setup status example.com --fix` to retry."*
- **Missing OAuth scope:** *"Missing OAuth scope `tagmanager.edit.containerversions`. Add it to your service account's OAuth client (or recreate the key with full scopes)."*

---

## Wrong-account recovery

The `~/.google-site-setup/config.json` is **sticky** — it remembers the GA / GTM account IDs from the last `init`. If you set up multiple clients, double-check before each run.

`provision` prints which IDs it's about to use and whether they came from a flag or saved config:

```text
━━━ Provisioning plan for example.com ━━━
  GA account:  111111 (from saved config)
  GTM account: 222222 (from saved config)
  Timezone:    UTC
  ...
```

To force explicit IDs for a one-off run:

```bash
google-site-setup provision \
  --no-saved-config \
  --domain example.com \
  --ga-account 333333 \
  --gtm-account 444444
```

To acknowledge saved IDs in a non-interactive (`--json`, CI) run:

```bash
google-site-setup provision --domain example.com --confirm-saved-config --json
```

---

## What it does NOT do

- **Create GA4 / GTM accounts.** GA4 account creation requires human TOS acceptance; GTM doesn't have a creation API. Create the accounts once, then the CLI provisions properties / containers under them.
- **Configure consent mode or CMP integration.**
- **Build conversion tags with real IDs.** `setup-conversions` ships paused stubs only — you fill in the IDs.
- **Inject the GTM snippet into your site.** It prints the snippet; the [Claude Code skill](#claude-code-skill) below can inject it for you.

---

## Claude Code skill

A companion [Claude Code](https://claude.com/claude-code) skill wraps this CLI: it infers your project's domain from `.env` / `next.config.*` / `astro.config.*` / `wp-config.php`, asks for any gaps, runs `provision --json`, then offers to inject the resulting GTM snippet into the right place for your framework (Next.js App or Pages Router, Nuxt, Astro, WordPress, static HTML).

Skill source: <https://github.com/eugene-bear/google-site-setup/tree/main/skill>.

---

## Configuration files

| Path | Contents |
|---|---|
| `~/.google-site-setup/config.json` | GA / GTM account IDs, service account email, default timezone + currency, last-validated timestamp. |
| `~/.google-site-setup/sites/<domain>.json` | Per-site provisioning result: GA4 / GTM / GSC details, verification method, deferred-sitemap state. |

You can edit these by hand if you ever need to nudge state.

---

## Development

```bash
git clone https://github.com/eugene-bear/google-site-setup.git
cd google-site-setup
npm install
npm run build
npm test
```

`tsx src/index.ts` runs the CLI directly without building.

---

## License

MIT
