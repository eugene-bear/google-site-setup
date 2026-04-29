---
title: "feat: google-site-setup CLI + Claude Code skill for automated GA4/GTM/GSC provisioning"
type: feat
status: active
date: 2026-03-26
---

# google-site-setup CLI + Claude Code Skill

## Overview

Build a standalone TypeScript CLI tool (`google-site-setup`) and accompanying Claude Code skill that automates the repetitive per-site provisioning of Google Analytics 4, Google Tag Manager, and Google Search Console. The tool lives in `~/Documents/Local Sites/tools/google-site-setup`, is globally installable via `npm link`, and the skill is registered globally in `~/.claude/skills/`.

## Problem Frame

Every new website launch requires manually creating a GA4 property, setting up a GTM container with a GA4 tag, adding the site to Search Console, and submitting the sitemap. This takes 20-40 minutes of clicking through three different Google UIs. The Google APIs fully support this programmatically, but no CLI tool exists to wrap them.

## Requirements Trace

- R1. Single command provisions GA4 property + web data stream, GTM container + GA4 tag + All Pages trigger, and Search Console site + sitemap
- R2. CLI works standalone (`npx google-site-setup`) without needing Claude Code
- R3. Claude Code skill wraps the CLI, infers project context (domain, sitemap URL, framework), and fills gaps interactively
- R4. Outputs all generated IDs (GA4 Measurement ID, GTM container ID/snippet, GSC property URL)
- R5. Auth via Google service account JSON key (env var `GOOGLE_SERVICE_ACCOUNT_KEY` pointing to key file path)
- R6. `init` command validates service account permissions and walks through one-time prerequisites
- R7. Idempotent — re-running for an already-provisioned domain should detect existing resources and skip/report

## Scope Boundaries

- **Not building**: GA4 account creation (requires human TOS acceptance), GTM account creation (no API exists), GA4 event/conversion configuration beyond the default stream, consent mode setup
- **Not building**: OAuth2 desktop flow — service account only for v1
- **Not building**: Web UI or dashboard — CLI only
- **Not building**: Cloudflare DNS automation — verification instructions printed to console instead
- **Deferred**: npm publishing — `npm link` for global install initially

## Context & Research

### API Landscape

| Service | API | Can Create Account? | Can Create Sub-resources? | Package |
|---------|-----|---------------------|--------------------------|---------|
| GA4 | Analytics Admin API v1beta | No (needs human TOS) | Yes — properties, data streams | `@google-analytics/admin` |
| GTM | Tag Manager API v2 | No (no API method) | Yes — containers, workspaces, tags, triggers, variables, versions | `googleapis` or `@googleapis/tagmanager` |
| GSC | Search Console API v3 + Site Verification API v1 | N/A | Yes — sites, sitemaps, verification tokens | `googleapis` |

### Required OAuth Scopes

```
https://www.googleapis.com/auth/analytics.edit
https://www.googleapis.com/auth/tagmanager.manage.accounts
https://www.googleapis.com/auth/tagmanager.edit.containers
https://www.googleapis.com/auth/tagmanager.edit.containerversions
https://www.googleapis.com/auth/tagmanager.publish
https://www.googleapis.com/auth/webmasters
https://www.googleapis.com/auth/siteverification
```

### Service Account Prerequisites (One-Time Manual Setup)

1. Create a Google Cloud project with Analytics Admin API, Tag Manager API, and Search Console API enabled
2. Create a service account, download JSON key
3. In GA4 UI: add service account email as **Editor** on the GA account
4. In GTM UI: add service account email as **Admin** on the GTM account
5. In Search Console: add service account email as **delegated owner** (or use OAuth2 refresh token for verification)

### Key API Constraints

- **GA4**: `provisionAccountTicket` returns a URL requiring human TOS acceptance — cannot create accounts headlessly. Properties and data streams work fine.
- **GTM**: No `accounts.create` method exists in the API at all. Containers, tags, triggers, variables, and publishing all work.
- **GTM tag type**: Use `googtag` (current) not `gaawc` (legacy) for the GA4 configuration tag.
- **GTM built-in trigger**: All Pages trigger ID is `2147479553` (built-in, always exists).
- **GSC verification**: `sites.add` adds but does NOT verify. Must use Site Verification API separately. DNS_TXT is the cleanest automated path for domain properties.
- **Rate limits**: GTM has strict 0.25 QPS / 10K requests per day. GA4 allows 600 writes/min.

## Key Technical Decisions

- **`googleapis` monorepo package**: Use `googleapis` (not standalone packages) since we need 3+ Google APIs — one package, one auth setup. Trade-off: larger install, but simpler dependency management.
- **Commander.js for CLI**: Lightweight, well-known, good TypeScript support. Alternatives (oclif, yargs) are heavier than needed.
- **Config file per domain**: Store provisioning results in `~/.google-site-setup/sites/{domain}.json` for idempotency checks and future reference.
- **Template-based GTM setup**: Define the standard GTM container configuration (GA4 tag + All Pages trigger + built-in variables) as a TypeScript template object, not a JSON import (GTM API has no import endpoint).
- **Skill infers, CLI executes**: The Claude Code skill reads `package.json`, `next.config.*`, site URL from env/config, and sitemap path to pre-fill CLI arguments. The CLI itself has no project-inference logic — it takes explicit arguments.

## Open Questions

### Resolved During Planning

- **Q: Which GTM tag type?** → `googtag` (current Google Tag template, replaces legacy `gaawc`)
- **Q: Can we import a GTM container JSON?** → No API endpoint for import. Must create entities individually via API.
- **Q: Domain vs URL-prefix for GSC?** → Default to domain property (`INET_DOMAIN`) with DNS_TXT verification. Print the TXT record value and instructions. User adds the record manually.

### Deferred to Implementation

- **Q: Exact error handling for GTM rate limits** → Will need to test actual 0.25 QPS enforcement and decide on retry/backoff strategy
- **Q: Site Verification API 503 flakiness with service accounts** → Known issue; may need retry logic or fallback to manual verification with instructions printed to console

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
CLI Flow:
┌─────────────────────────────────┐
│  google-site-setup provision    │
│  --domain example.com           │
│  --ga-account 123456            │
│  --gtm-account 789012           │
│  --sitemap https://example.com/sitemap.xml │
└──────────────┬──────────────────┘
               │
    ┌──────────▼──────────┐
    │   Load & validate   │
    │   service account   │
    │   + check existing  │
    │   provisions        │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  1. GA4 Property    │──→ Creates property + web data stream
    │     + Data Stream   │    Returns: Measurement ID (G-XXXX)
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  2. GTM Container   │──→ Creates container, workspace,
    │     + GA4 Tag       │    All Pages trigger, Google Tag
    │     + Publish       │    with Measurement ID, publishes v1
    └──────────┬──────────┘    Returns: GTM-XXXX, snippet
               │
    ┌──────────▼──────────┐
    │  3. Search Console  │──→ Adds site, requests verification
    │     + Sitemap       │    token, submits sitemap
    └──────────┬──────────┘    Returns: verification status
               │
    ┌──────────▼──────────┐
    │  4. Output Summary  │──→ JSON + human-readable summary
    │     + Save Config   │    Saves to ~/.google-site-setup/
    └─────────────────────┘

Skill Flow:
┌─────────────────────────────────┐
│  Claude Code skill invoked      │
│  (user says "set up google      │
│   analytics for this site")     │
└──────────────┬──────────────────┘
               │
    ┌──────────▼──────────┐
    │  Read project files: │
    │  - package.json      │
    │  - .env / .env.local │
    │  - next.config.*     │
    │  - public/sitemap*   │
    │  - vercel.json etc   │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  Infer: domain,     │
    │  sitemap URL,        │
    │  framework type      │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  Ask user for gaps: │
    │  - GA account ID     │
    │  - GTM account ID    │
    │  - Confirm domain    │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  Run CLI command     │
    │  Parse output        │
    │  Offer to inject     │
    │  GTM snippet into    │
    │  project code        │
    └─────────────────────┘
```

## Implementation Units

### Phase 1: Core CLI

- [ ] **Unit 1: Project scaffolding and auth module**

  **Goal:** Create the project structure, install dependencies, and build the shared Google auth module.

  **Requirements:** R2, R5

  **Dependencies:** None

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/package.json`
  - Create: `~/Documents/Local Sites/tools/google-site-setup/tsconfig.json`
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/index.ts` (CLI entry point with Commander)
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/auth.ts` (shared auth module)
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/types.ts` (shared types)
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/config.ts` (load/save site config to `~/.google-site-setup/`)

  **Approach:**
  - Use `googleapis` as the single Google API dependency
  - Also install `@google-analytics/admin` for GA4 (it has a better typed client than the generic `googleapis` wrapper)
  - Auth module reads `GOOGLE_SERVICE_ACCOUNT_KEY` env var (path to JSON key file), creates authenticated clients for all three APIs
  - Config module manages `~/.google-site-setup/sites/{domain}.json` files for idempotency
  - CLI entry point uses Commander with `provision` as the main command

  **Patterns to follow:**
  - Existing tools in `~/Documents/Local Sites/tools/` for project structure conventions
  - `bin` field in package.json for `npm link` global install

  **Test scenarios:**
  - Auth module throws clear error when env var missing or key file not found
  - Auth module throws clear error when key file is malformed JSON
  - Config module creates `~/.google-site-setup/` directory if it doesn't exist
  - Config module reads/writes site JSON correctly

  **Verification:**
  - `npx tsx src/index.ts --help` prints usage information
  - Auth module can instantiate all three API clients from a valid key file

- [ ] **Unit 2: GA4 provisioning module**

  **Goal:** Create a GA4 property and web data stream under an existing account.

  **Requirements:** R1, R4, R7

  **Dependencies:** Unit 1

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/providers/ga4.ts`

  **Approach:**
  - Use `@google-analytics/admin` v1beta client
  - Accept: GA account ID, display name, domain, timezone, currency
  - Idempotency: before creating, list existing properties on the account and check for matching `defaultUri` on web data streams
  - Return: property resource name, measurement ID (G-XXXX), stream ID

  **Patterns to follow:**
  - GA4 Admin API v1beta `createProperty` + `createDataStream` pattern from research

  **Test scenarios:**
  - Creates property with correct parent `accounts/{id}` format
  - Creates web data stream with correct `defaultUri`
  - Skips creation when a property with matching data stream URI already exists
  - Returns measurement ID in `G-XXXXXXXXXX` format
  - Handles API errors (403 permission denied, 429 rate limit) with clear messages

  **Verification:**
  - Running against a test GA account creates a visible property in the GA4 UI
  - Re-running for the same domain skips creation and returns existing IDs

- [ ] **Unit 3: GTM provisioning module**

  **Goal:** Create a GTM container with GA4 Google Tag, All Pages trigger, built-in variables, and publish v1.

  **Requirements:** R1, R4, R7

  **Dependencies:** Unit 1, Unit 2 (needs Measurement ID)

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/providers/gtm.ts`
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/templates/gtm-base.ts` (template config for standard tags/triggers/variables)

  **Approach:**
  - Use `googleapis` tagmanager v2 client
  - Sequence: create container → create workspace → enable built-in variables (PAGE_URL, PAGE_HOSTNAME, PAGE_PATH, REFERRER, EVENT) → create All Pages trigger (type PAGEVIEW) → create Google Tag (`googtag` type) with Measurement ID → create version → publish
  - Template file defines the standard setup as typed objects, parameterized by measurement ID
  - Idempotency: list containers on the account, check for matching name or domain
  - Return: container public ID (GTM-XXXX), container snippet (from container resource), workspace/version IDs

  **Patterns to follow:**
  - GTM API v2 workspace-based workflow from research
  - `googtag` tag type with `tagId` parameter

  **Test scenarios:**
  - Creates container with `usageContext: ['web']`
  - Creates workspace, trigger, tag, and publishes in correct sequence
  - Google Tag uses `googtag` type with correct measurement ID parameter
  - Skips creation when container with matching name already exists
  - Handles GTM rate limits (0.25 QPS) — adds delay between API calls if needed

  **Verification:**
  - Container visible in GTM UI with correct tag configuration
  - Published version shows GA4 tag firing on All Pages
  - Re-running for same domain reports existing container

- [ ] **Unit 4: Search Console provisioning module**

  **Goal:** Add site to Search Console and submit sitemap.

  **Requirements:** R1, R4, R7

  **Dependencies:** Unit 1

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/providers/gsc.ts`

  **Approach:**
  - Use `googleapis` webmasters v3 + siteVerification v1 clients
  - Sequence: add site via `sites.add` → request verification token via `siteVerification.webResource.getToken` → print token and manual verification instructions → submit sitemap via `sitemaps.submit`
  - Verification is semi-automated: the tool outputs the DNS TXT record value and instructions for where to add it
  - Default to domain property (`INET_DOMAIN`) with DNS_TXT method
  - Idempotency: check `sites.get` first, skip if already verified

  **Patterns to follow:**
  - Search Console API v3 + Site Verification API v1 from research

  **Test scenarios:**
  - Adds site and reports unverified status with verification token
  - Submits sitemap URL correctly
  - Skips if site already exists and is verified
  - Handles case where sitemap URL returns 404 (warns but doesn't fail)

  **Verification:**
  - Site appears in Search Console (even if unverified)
  - Sitemap shows as submitted in Search Console UI
  - Clear instructions printed for DNS verification

- [ ] **Unit 5: Main `provision` command — orchestration and output**

  **Goal:** Wire all three providers into the `provision` command with argument parsing, orchestration, summary output, and config persistence.

  **Requirements:** R1, R2, R4, R7

  **Dependencies:** Units 1-4

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/commands/provision.ts`
  - Modify: `~/Documents/Local Sites/tools/google-site-setup/src/index.ts`

  **Approach:**
  - Commander command: `google-site-setup provision --domain <domain> [--ga-account <id>] [--gtm-account <id>] --sitemap <url> [--name <display-name>] [--timezone <tz>] [--currency <code>] [--dry-run]`
  - GA and GTM account IDs are optional if previously saved by `init` command (reads from `~/.google-site-setup/config.json`)
  - Orchestrate: GA4 → GTM (uses GA4 measurement ID) → GSC (independent)
  - Output: structured JSON to stdout when `--json` flag is passed, human-readable summary otherwise
  - Persist results to `~/.google-site-setup/sites/{domain}.json`
  - `--dry-run` flag validates inputs and checks existing resources without creating anything

  **Patterns to follow:**
  - Commander.js command pattern with options

  **Test scenarios:**
  - All three services provisioned in sequence, measurement ID flows from GA4 to GTM
  - `--dry-run` shows what would be created without making API calls
  - `--json` outputs parseable JSON
  - Missing required args show clear error messages
  - Partial failure (e.g., GTM fails after GA4 succeeds) saves partial results and reports clearly

  **Verification:**
  - `google-site-setup provision --domain example.com --ga-account 123 --gtm-account 456 --sitemap https://example.com/sitemap.xml` completes end-to-end
  - Output includes GA4 measurement ID, GTM container ID, GTM snippet, GSC status
  - Config file saved at `~/.google-site-setup/sites/example.com.json`

### Phase 2: Claude Code Skill

- [ ] **Unit 6: Claude Code skill definition**

  **Goal:** Create a globally registered Claude Code skill that wraps the CLI, infers project context, and fills gaps interactively.

  **Requirements:** R3

  **Dependencies:** Phase 1 complete

  **Files:**
  - Create: `~/.claude/skills/google-site-setup.md` (skill definition)

  **Approach:**
  - Skill triggers on: "set up google analytics", "set up GTM", "set up search console", "google site setup", "provision google services"
  - Skill instructs Claude to:
    1. Read `package.json` for project name/domain hints
    2. Check `.env`, `.env.local`, `next.config.*`, `nuxt.config.*`, `astro.config.*` for site URL
    3. Look for `public/sitemap.xml`, `public/sitemap-index.xml`, or sitemap generation in config
    4. Check for existing GA/GTM snippets in the codebase (avoid duplicates)
    5. Ask user for GA account ID and GTM account ID (these cannot be inferred)
    6. Run the CLI via Bash tool
    7. Parse output and offer to inject GTM snippet into the project's `<head>` (framework-appropriate: `_document.tsx`, `layout.tsx`, `app.html`, etc.)
  - Register globally by placing in `~/.claude/skills/`

  **Patterns to follow:**
  - Existing skill definitions in the user's Claude Code setup

  **Test scenarios:**
  - Skill triggers on relevant phrases
  - Correctly infers domain from a Next.js project
  - Correctly infers domain from a WordPress project
  - Asks for account IDs when they can't be inferred
  - Offers to inject GTM snippet after provisioning

  **Verification:**
  - Invoking `/google-site-setup` in Claude Code triggers the skill
  - Skill correctly reads project context and pre-fills CLI arguments
  - GTM snippet injection works for at least Next.js App Router projects

### Phase 3: Init & Status Commands

- [ ] **Unit 7: `init` command — guided one-time setup + permission validation**

  **Goal:** Walk users through the one-time prerequisites and validate that the service account has correct permissions on GA4, GTM, and Search Console.

  **Requirements:** R6

  **Dependencies:** Unit 1

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/commands/init.ts`
  - Modify: `~/Documents/Local Sites/tools/google-site-setup/src/index.ts`

  **Approach:**
  - `google-site-setup init` — interactive guided setup
  - Step 1: Check for `GOOGLE_SERVICE_ACCOUNT_KEY` env var. If missing, print instructions for creating a Google Cloud project, enabling the 3 APIs, creating a service account, and downloading the key. Provide direct links:
    - `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com`
    - `https://console.cloud.google.com/apis/library/tagmanager.googleapis.com`
    - `https://console.cloud.google.com/apis/library/webmasters.googleapis.com`
    - `https://console.cloud.google.com/apis/library/siteverification.googleapis.com`
  - Step 2: Validate the key file loads and extract the service account email. Print it clearly — user needs this to add to GA4/GTM/GSC.
  - Step 3: Ask for GA4 account ID. Try `analyticsAdmin.accounts.list()` — if the service account can see accounts, list them for selection. If 403, print instructions for adding the service account email as Editor in GA4 Admin > Account Access Management.
  - Step 4: Ask for GTM account ID. Try `tagmanager.accounts.list()` — same pattern. If 403, print instructions for adding in GTM > Admin > User Management.
  - Step 5: Try `webmasters.sites.list()` to verify Search Console access. If 403, print instructions for adding as delegated owner.
  - Step 6: Save validated config to `~/.google-site-setup/config.json` (GA account ID, GTM account ID, service account email) so `provision` can use defaults.
  - On re-run, check existing config and offer to re-validate or update.

  **Test scenarios:**
  - Guides user through setup when no env var is set
  - Lists available GA4 accounts when service account has access
  - Reports clear permission errors with instructions when access is denied
  - Saves config file with validated account IDs
  - Re-running with existing config offers to re-validate

  **Verification:**
  - Running `google-site-setup init` with a properly configured service account completes with all green checks
  - Running with a misconfigured service account prints actionable instructions for each failing step
  - `provision` command reads saved defaults from config

- [ ] **Unit 8: `status` command**

  **Goal:** Check current provisioning status for a domain across all three services.

  **Requirements:** R7

  **Dependencies:** Phase 1

  **Files:**
  - Create: `~/Documents/Local Sites/tools/google-site-setup/src/commands/status.ts`
  - Modify: `~/Documents/Local Sites/tools/google-site-setup/src/index.ts`

  **Approach:**
  - `google-site-setup status --domain <domain>` or `google-site-setup status` (reads from local config)
  - Checks: GA4 property exists + data stream active, GTM container exists + published version, GSC site verified + sitemap submitted
  - Reports status as a table

  **Test scenarios:**
  - Shows correct status for fully provisioned domain
  - Shows partial status when some services are not set up
  - Works with only local config (no API calls) when `--offline` flag passed

  **Verification:**
  - Status output matches actual state in Google UIs

## System-Wide Impact

- **Interaction graph:** The CLI is standalone — no callbacks or hooks into other systems. The skill interacts with Claude Code's tool system (Bash, Read, AskUserQuestion).
- **Error propagation:** Each provider module throws typed errors. The orchestrator catches, saves partial results, and reports which steps succeeded/failed.
- **State lifecycle risks:** Partial provisioning (GA4 created but GTM fails) is handled by saving partial state to config and allowing re-run to resume.
- **API surface parity:** CLI and skill produce the same results — the skill is a wrapper, not a reimplementation.

## Risks & Dependencies

- **GTM rate limits (0.25 QPS):** The setup sequence makes ~8-10 GTM API calls. At 0.25 QPS this takes ~40 seconds minimum. Must add delays between calls.
- **Site Verification API 503 flakiness:** Known issue with service accounts. Mitigation: retry with backoff, fall back to printing manual instructions.
- **`@google-analytics/admin` preview status:** Package is at v9 but still marked preview. Breaking changes between majors are common. Pin to exact version.
- **Service account permissions are a manual prerequisite:** The tool cannot set up its own permissions. Clear first-run documentation is essential.

## Documentation / Operational Notes

- README should include:
  - One-time Google Cloud project setup instructions (enable 3 APIs, create service account)
  - How to add service account to GA4, GTM, and Search Console
  - Environment variable setup (`GOOGLE_SERVICE_ACCOUNT_KEY`)
  - Usage examples
- The `init` command (Unit 7) covers first-run guidance and permission validation

## Sources & References

- GA4 Admin API v1beta: `@google-analytics/admin` npm, `createProperty` + `createDataStream` methods
- GTM API v2: `googleapis` tagmanager v2, `googtag` tag type for GA4
- Search Console API v3: `googleapis` webmasters v3, `sites.add` + `sitemaps.submit`
- Site Verification API v1: `googleapis` siteVerification v1, `getToken` + `webResource.insert`
