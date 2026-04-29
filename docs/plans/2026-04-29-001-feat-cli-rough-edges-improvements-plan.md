---
title: "feat: google-site-setup CLI rough-edges improvements (v1.2)"
type: feat
status: active
date: 2026-04-29
---

# google-site-setup CLI rough-edges improvements (v1.2)

## Summary

Resolve nine concrete rough edges discovered during real-world provisioning of a client site: DNS-only GSC verification that blocks users without DNS access, silently-failing sitemap submissions, all-or-nothing `provision`, sticky-config landing work in the wrong GA/GTM account, raw Google API JSON in error output, missing `setup-conversions` command, and skill/CLI parity drift. Ships as v1.2.0.

---

## Problem Frame

Real client setup (`bearteam.tv`, this session) hit nine separate friction points that forced ~6 hand-written workaround scripts (`add-gsc-owner.cjs`, `verify-url-prefix.cjs`, `cleanup-wrong-account.cjs`, `setup-gtm-events.cjs`, `refactor-gtm.cjs`, `mark-key-events.cjs`). Each friction point is small in isolation; together they meant 4 retries to land cleanly and ~150 lines of one-off code. The CLI's job is to absorb this kind of work — leaving it on the user is the bug.

---

## Requirements

- R1. GSC verification supports `meta`, `file`, `dns`, `gtm`, and `analytics` methods, selectable via flag
- R2. When provision finishes with an unverified GSC site, the JSON output and human output flag sitemap submission as deferred (not failed) and tell the user how to retry
- R3. `provision` supports `--skip-ga4`, `--skip-gtm`, `--skip-gsc` and re-runs are idempotent on the GTM side as well as GA4
- R4. `init` persists `timezone` and `currency` defaults; `provision` reads them from saved config when not passed; `--no-saved-config` opts out of using saved account IDs
- R5. `provision` prints which GA4 / GTM account IDs will be used at the start of the run, and warns when they came from saved config
- R6. Known Google API failure modes (missing OAuth scopes, service account not in target GTM/GA4 account, GSC permission errors) emit a one-line diagnostic + the exact fix instead of a raw JSON dump
- R7. `provision` pre-checks GTM and GA4 account access before attempting create, and aborts with an actionable error if the service account isn't a member
- R8. New `setup-conversions` command stubs Google Ads, Meta Pixel, MS Clarity, and LinkedIn Insight Tag in GTM as paused tags with placeholder IDs
- R9. Skill prose matches CLI exactly — every command, flag, and recovery path the skill mentions exists in `google-site-setup help`

---

## Scope Boundaries

- Not adding interactive OAuth user flow (service account remains the only auth)
- Not building a `cleanup-wrong-account` command — surfacing the IDs before create + `--no-saved-config` covers the recovery path without giving us a delete API
- Not fully configuring conversion platforms — `setup-conversions` ships paused stubs only; user fills in real IDs in GTM UI
- Not adding new platforms beyond GA, Ads, Meta, Clarity, LinkedIn in this iteration
- Not changing the service account permission model

### Deferred to Follow-Up Work

- File-based GSC verification (`google{token}.html` upload to web root) — implement if `meta` adoption shows users still want it: separate PR
- Detecting timezone/currency from existing GA4 properties on the same account during `init` — included only as a fallback if no saved value exists; smart auto-detection deferred

---

## Context & Research

### Relevant Code and Patterns

- `src/commands/provision.ts` — orchestrates the three provider calls; entry point for split flags (R3) and ID-print warning (R5)
- `src/providers/gsc.ts` — currently hard-codes `DNS_TXT`; `getToken` and `webResource.insert` already accept a `verificationMethod` parameter, so multi-method support is a switch statement, not a rewrite
- `src/commands/status.ts` — `--fix` already retries verification + sitemap; extend it to honor the verification method recorded in site config
- `src/commands/init.ts` — already prompts and saves account IDs; extend the prompt loop with timezone/currency questions
- `src/config.ts` — `loadGlobalConfig` / `saveGlobalConfig` are the single source of truth for sticky values
- `src/commands/add-event.ts` — already creates triggers + GA4 event tags + DLV variables in the default workspace, then publishes; the same pattern (workspace fetch → create tag → version → publish) extends to `setup-conversions`
- `src/auth.ts` — service account scopes are declared centrally; missing-scope detection should map errors back to this list
- v1.1.0 already shipped `add-owner` and `add-event` (closes punch-list item #1) — skill prose still references both as if they were future work in places; verify in U7

### Institutional Learnings

- GTM API enforces ~0.25 QPS — `add-event.ts` uses a 4500 ms delay between calls. `setup-conversions` will create 4-8 tags and must use the same throttle pattern.
- The site-verification API silently succeeds on `webResource.insert` only when the verification record (DNS TXT, meta tag, etc.) is actually live; treat that call as the verification check, not a separate poll.

### External References

- Google Site Verification API supports verification methods: `DNS_TXT`, `DNS_CNAME`, `META`, `FILE`, `ANALYTICS`, `TAG_MANAGER` (verified against current `googleapis` SDK types)
- Search Console `sites.add` returning 403/permissionDenied is the unverified-site signal — sitemap submission against an unverified site fails with a `User does not have sufficient permission` message

---

## Key Technical Decisions

- **Verification method is per-site, not global**: store the chosen method on `siteConfig.gsc.verificationMethod` so `status --fix` knows what to retry. Rationale: a user may verify via GTM on one site and meta on another.
- **`--skip-gtm` short-circuits before workspace lookup; `--skip-ga4` skips property creation but still requires a measurement ID for GTM**: if both `--skip-ga4` is set and no saved `measurementId` exists, fail fast.
- **Sticky timezone/currency live in the global config, not per-site**: agencies typically have one timezone/currency per workspace. Per-site override remains via flag.
- **Wrong-account guard is a print + `--confirm-saved-config` flag, not a hard block**: defaulting to a hard block would break every subsequent `provision` after `init`. Instead, print the IDs being used + their source, and require an explicit `--confirm-saved-config` only when the run is non-interactive (`--json` mode and CI). Interactive runs print the IDs and proceed.
- **Error-translation lives in a single mapper module, not scattered try/catches**: one `src/errors.ts` translates known Google API error shapes (status code + reason + scope) into actionable messages. Providers throw raw; commands catch + translate at the seam.
- **`setup-conversions` ships paused tags with placeholder IDs**: avoids needing per-platform input during provisioning; user opens GTM, enters real IDs, unpauses. This matches what `setup-gtm-events.cjs` did and is the established pattern.

---

## Open Questions

### Resolved During Planning

- **Should `setup-conversions` accept real IDs as flags?** No for v1.2 — paused stubs only. Adding `--google-ads-id` etc. is a v1.3 follow-up if users ask.
- **Does `add-owner` need verification-method awareness?** No — once a site is verified by any method, `add-owner` patches `webResource.owners` regardless.

### Deferred to Implementation

- Exact error-pattern strings for GTM scope errors — capture from a real failing run during U5; the patterns are stable but the wording isn't documented.
- Whether the `META` verification token returned by the API needs HTML-escaping when printed (testing during U1 will confirm).

---

## Implementation Units

- U1. **Multi-method GSC verification**

**Goal:** Support `meta`, `file`, `dns`, `gtm`, `analytics` verification methods on `provision` and `add-verification`; persist chosen method on site config.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `src/commands/provision.ts` (accept `--verification-method` flag, default `meta`)
- Modify: `src/providers/gsc.ts` (parameterize `provisionGSC` on method, switch on method to choose token shape and instructions block)
- Create: `src/commands/add-verification.ts` (standalone command for `google-site-setup add-verification <domain> --method=meta`)
- Modify: `src/index.ts` (wire `add-verification`)
- Modify: `src/types.ts` (add `verificationMethod` to `GSCResult` and `SiteConfig.gsc`)
- Test: `tests/providers/gsc.test.ts`

**Approach:**
- Default verification method changes from `dns` to `meta` — meta is universally usable on any site with a `<head>` editor; DNS requires DNS access which many users lack
- The provisioning instruction block becomes method-specific: meta tag prints the `<meta name="google-site-verification" content="...">` snippet; file prints the `googleXXXX.html` filename and content; DNS keeps the existing TXT box; GTM and analytics print "verify in GSC UI after GTM/GA4 is live" since those methods require the existing tag to be on-page
- `add-verification` reuses the same provider with a method override; useful when re-running just verification after switching DNS providers
- After token issuance, `webResource.insert` is called once optimistically — if the record/tag is already live (common when re-running), the site verifies immediately

**Patterns to follow:**
- `src/providers/gsc.ts` token-fetch + insert pattern; just lift method into a parameter

**Test scenarios:**
- Happy path: `--verification-method=meta` returns a token, prints meta tag instructions, marks `verified: false`, returns `verificationMethod: "META"` in result
- Happy path: re-running verification after meta tag is live succeeds and marks `verified: true`
- Edge case: invalid method value (e.g., `--verification-method=carrierpigeon`) exits with a clear error listing the five supported values
- Error path: `getToken` for `META` fails with API error → propagates a clear message naming the method
- Integration: `add-verification` reads existing `siteConfig.gsc.verificationMethod`, defaults to `meta` when absent

**Verification:**
- `provision --verification-method=meta` produces a working meta tag; pasting it into the site head and re-running `status --fix` flips `verified: true`
- The five methods are listed in `--help` output

---

- U2. **Deferred-sitemap state in JSON + `status --fix` retry**

**Goal:** When sitemap submission fails because the site is unverified, mark the result as deferred (not failed) and surface a clear retry hint.

**Requirements:** R2

**Dependencies:** U1 (so verification method is known at retry time)

**Files:**
- Modify: `src/providers/gsc.ts` (distinguish `permissionDenied` from generic submit failure → set `sitemapDeferred: true`, do not log as warning)
- Modify: `src/types.ts` (add `sitemapDeferred?: boolean` to `GSCResult`)
- Modify: `src/commands/provision.ts` (human-output: surface "Sitemap deferred — verify GSC first, then run `google-site-setup status <domain> --fix`")
- Modify: `src/commands/status.ts` (`--fix` reads pending sitemap from site config and retries after verification)
- Test: `tests/providers/gsc.test.ts`

**Approach:**
- `submitSitemap` distinguishes `403`/`User does not have sufficient permission` from other failures and returns a `{ submitted: false, deferred: true }` shape
- The deferred state persists into `siteConfig.gsc.sitemapPending: <url>` so `status --fix` can pick it up later
- JSON output gains `gsc.sitemapDeferred: true` and `gsc.followUpCommand: "google-site-setup status <domain> --fix"`
- Human output replaces the existing warning line with a deferred-state callout

**Patterns to follow:**
- Existing `--fix` flow in `src/commands/status.ts` — extend with sitemap re-submit on top of verification

**Test scenarios:**
- Happy path: provision against an unverified site with sitemap → `gsc.sitemapDeferred: true`, `gsc.sitemapSubmitted: false`, no error printed
- Happy path: after manual verification, `status <domain> --fix` re-submits the sitemap from `siteConfig.gsc.sitemapPending` and clears the pending flag
- Edge case: 500/network error during submit (not permission) → still surfaces as a real failure, not deferred
- Integration: JSON output of `provision` includes `followUpCommand` field exactly matching the working command

**Verification:**
- A run against a fresh unverified domain exits with code 0, JSON shows `sitemapDeferred: true`, and `status --fix` after verification submits the sitemap successfully

---

- U3. **Split `provision` flags + GTM idempotency**

**Goal:** Add `--skip-ga4`, `--skip-gtm`, `--skip-gsc`; detect existing GTM containers like the existing GA4 detection.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/commands/provision.ts` (skip-flag handling, fail-fast on `--skip-ga4` without saved measurement ID)
- Modify: `src/providers/gtm.ts` (add `findExistingContainer` mirror of GA4's existing-property detection; return `skipped: true` when found by domain match)
- Test: `tests/commands/provision.test.ts`, `tests/providers/gtm.test.ts`

**Approach:**
- Skip flags short-circuit before each section — print `Skipping GA4 (--skip-ga4)` for visibility
- GTM idempotency keys off container display name (matches existing GA4 detection by display name) — if a container named `<domain>` exists in the account, return its public ID + ID without re-creating
- When a found container has no GA4 tag (rare but possible), still return it; do not attempt to add the tag (that's a v1.3 concern)
- `--skip-ga4` requires either an existing `siteConfig.ga4.measurementId` or `--measurement-id <G-XXXX>` flag to be passed; otherwise GTM has nothing to point to

**Patterns to follow:**
- GA4 idempotent detection in `src/providers/ga4.ts`

**Test scenarios:**
- Happy path: `--skip-gsc` runs GA4 and GTM only; result has `gsc: null`
- Happy path: re-running provision against a domain with an existing GTM container detects it and returns `gtm.skipped: true`
- Edge case: `--skip-ga4` with no saved measurement ID and no `--measurement-id` flag → fails fast with actionable error before touching the GTM API
- Edge case: all three skip flags set → exits with "nothing to do" message, exit code 0
- Integration: skip flag combined with `--dry-run` correctly previews only the non-skipped services

**Verification:**
- `provision --domain x.com --skip-gtm` creates GA4 + GSC and skips GTM completely; re-running with no skip flag detects the GA4 property and creates only the GTM container

---

- U4. **Sticky timezone/currency + saved-config awareness**

**Goal:** Persist `timezone` and `currency` in the global config; print account IDs at the start of `provision`; add `--no-saved-config` and `--confirm-saved-config`.

**Requirements:** R4, R5

**Dependencies:** None

**Files:**
- Modify: `src/commands/init.ts` (prompt for default timezone + currency; offer common shortcuts; save to global config)
- Modify: `src/config.ts` (extend `GlobalConfig` type with `defaultTimezone`, `defaultCurrency`)
- Modify: `src/commands/provision.ts` (read defaults from global config; print "Using GA account 1234 (from saved config), GTM account 5678 (from saved config)" header; honor `--no-saved-config` and `--confirm-saved-config`)
- Test: `tests/commands/provision.test.ts`, `tests/commands/init.test.ts`

**Approach:**
- `init` adds two prompts: timezone (with a list of common ones — UTC, America/New_York, America/Los_Angeles, Europe/London, Australia/Sydney) and currency (USD, EUR, GBP, AUD, CAD, JPY)
- `provision` resolution order: explicit flag → global config default → fallback constant (`UTC` / `USD` for new defaults; the old `America/New_York` / `USD` is still used only if no init has run)
- The new fallback (UTC/USD) is the safer default for non-US users; existing US users will already have run `init` after upgrading and thus see their last-used values
- `--no-saved-config` ignores the global config entirely for this run (forces all flags explicit)
- `--confirm-saved-config` is a passive flag the agent/CI can pass; without it, non-interactive runs (`--json` mode with detected saved config) print a warning but still proceed

**Patterns to follow:**
- Existing `init` prompt loop in `src/commands/init.ts`

**Test scenarios:**
- Happy path: `init` saves timezone + currency; subsequent `provision` without those flags uses the saved values
- Happy path: `provision` prints "Using GA account 1234 (from saved config)" before any API call
- Edge case: `--no-saved-config` + no flags + nothing in env → fails fast with clear error listing what's needed
- Edge case: explicit flags override saved config silently (no warning)
- Integration: `provision --json` (no TTY) without `--confirm-saved-config` prints the IDs to stderr but still proceeds and exits 0

**Verification:**
- `init` → `provision --domain x.com` uses saved tz/currency; manual inspection of created GA4 property confirms timezone/currency

---

- U5. **Friendly error wrapping + GTM/GA4 access pre-check**

**Goal:** Translate known Google API errors into one-line diagnostics with the exact fix; pre-check service account membership before any create call.

**Requirements:** R6, R7

**Dependencies:** None

**Files:**
- Create: `src/errors.ts` (centralized error translator)
- Modify: `src/providers/gtm.ts` (call `accounts.list()` to verify the configured GTM account ID is accessible before any container create)
- Modify: `src/providers/ga4.ts` (same pre-check pattern against GA4)
- Modify: `src/commands/provision.ts` (catch + translate at the orchestrator seam)
- Test: `tests/errors.test.ts`, `tests/providers/gtm.test.ts`

**Approach:**
- `src/errors.ts` exports `translateGoogleError(err, context: { service: 'ga4'|'gtm'|'gsc'|'siteverification', operation: string })` returning `{ summary: string, fix: string, raw: unknown }`
- Initial translation patterns (extend as we discover more):
  - `403` + `tagmanager.edit.containerversions` → "Service account is missing the `tagmanager.edit.containerversions` scope. Add it to the OAuth client in your service account key, or recreate the key with full Tag Manager scopes."
  - `404`/`Not found` on `accounts.get(<id>)` → "Service account `<email>` has no access to GTM account `<id>`. Add it as Admin in tagmanager.google.com → Admin → User Management."
  - GA4 equivalent of the above
  - GSC `User does not have sufficient permission` → "Site `<domain>` is not verified. Run `google-site-setup status <domain> --fix` after adding the verification record."
- Pre-check in `provisionGTM`: `accounts.list()` first; if configured `accountId` not in the list, throw a translated error with the exact "add as Admin" instruction *before* attempting create. Same for GA4
- All other (unknown) errors fall through with the raw message — no swallowing

**Patterns to follow:**
- Existing one-shot error message patterns in `src/commands/init.ts`

**Test scenarios:**
- Happy path: 403 with the GTM scope reason → translator returns the scope-fix message
- Happy path: configured GTM account not in `accounts.list()` → pre-check throws "Service account ... has no access to GTM account ...", and create is never called
- Edge case: unknown error (network blip, 500) → translator passes through with raw message; user sees something useful, not a swallowed error
- Edge case: GA4 pre-check passes but property create fails with quota error → that error is translated into a separate message about quotas
- Integration: full provision against an account the SA isn't in fails fast (no partial GTM container created), exit code non-zero, JSON output contains the translated `error.fix` field

**Verification:**
- Running provision with deliberately-revoked service account access fails in <2s with an actionable error referring to GTM Admin → User Management

---

- U6. **`setup-conversions` command (Google Ads, Meta Pixel, MS Clarity, LinkedIn) — paused stubs**

**Goal:** New command stubs four conversion-platform tags as paused entries in the GTM container so the user fills in real IDs in the GTM UI.

**Requirements:** R8

**Dependencies:** U5 (so error wrapping covers GTM scope failures)

**Files:**
- Create: `src/commands/setup-conversions.ts`
- Create: `src/templates/conversion-tags.ts` (paused-tag definitions for each platform — tag type, parameter shape, default trigger = none/paused)
- Modify: `src/index.ts` (wire `setup-conversions`)
- Test: `tests/commands/setup-conversions.test.ts`

**Approach:**
- Command shape: `google-site-setup setup-conversions <domain> [--platforms=ads,meta,clarity,linkedin]` (default: all four)
- Each platform definition lives in `src/templates/conversion-tags.ts` as a `ConversionPlatform` record:
  - Google Ads → `awct` (Google Ads Conversion Tracking) tag with placeholder Conversion ID
  - Meta Pixel → custom HTML tag with the Meta Pixel boilerplate and `__PIXEL_ID__` placeholder
  - MS Clarity → custom HTML tag with the Clarity script and `__CLARITY_ID__` placeholder
  - LinkedIn Insight Tag → custom HTML tag with the LinkedIn boilerplate and `__PARTNER_ID__` placeholder
- Each tag is created with `paused: true` and `firingTriggerId: []` (no trigger) so the user can't accidentally fire incomplete tags
- After creating all platforms, create a single container version + publish (mirrors `add-event.ts`)
- Same 4500 ms throttle pattern as `add-event.ts`
- The command honors `--json` and prints next-steps text: "Open GTM → Tags → <Platform> → replace `__XXX_ID__` with your real ID, attach a trigger, unpause."

**Patterns to follow:**
- `src/commands/add-event.ts` — workspace fetch, throttled tag creation, version + publish, JSON output

**Test scenarios:**
- Happy path: `setup-conversions example.com` creates four paused tags and publishes one container version
- Happy path: `setup-conversions example.com --platforms=ads,meta` creates only Ads + Meta
- Edge case: re-running detects existing same-named tags and skips them (matches `add-event` behavior — `already exists` is fine)
- Edge case: invalid platform name in `--platforms` exits with a clear "supported: ads, meta, clarity, linkedin"
- Error path: GTM scope missing → translated error from U5; no partial container version published
- Integration: published container version appears in `status` output; opening GTM UI shows four paused tags with correct names

**Verification:**
- `setup-conversions <domain>` produces four paused tags visible in GTM UI; replacing the placeholder IDs and attaching a trigger fires correctly when tested in GTM Preview mode (manual)

---

- U7. **Skill ↔ CLI parity audit + refresh**

**Goal:** Update `~/.claude/skills/google-site-setup/SKILL.md` so every command, flag, and recovery path it mentions exists in v1.2's `google-site-setup help`. Add a Phase covering verification-method selection, deferred-sitemap recovery, the `--skip-*` flags, and `setup-conversions`.

**Requirements:** R9

**Dependencies:** U1, U2, U3, U6 (skill must reflect what shipped)

**Files:**
- Modify: `~/.claude/skills/google-site-setup/SKILL.md` (target repo: home-global skills dir, not this repo)

**Approach:**
- Walk the skill top-to-bottom and run each command snippet through `google-site-setup help <cmd>` to confirm the flags exist
- Add a "Verification method" mini-section to Phase 7 (the GSC step) explaining when to recommend `meta` (default, easiest), `gtm` (if GTM is already on-page), `dns` (if user has DNS access), `analytics`, `file`
- Add a "Deferred sitemap" note to the success path explaining that an unverified-on-first-run site will return `gsc.sitemapDeferred: true` and the agent should suggest the `status --fix` follow-up
- Add a "Wrong-account recovery" note pointing at `--no-saved-config` + the new ID-print header
- Add a `setup-conversions` section after the `add-event` section with sample usage
- Strip any prose referencing v1.0.0-only commands or implying features that don't exist

**Patterns to follow:**
- Existing skill structure (Phase 0 inference, Phase 1 .env / config inference, Phase 7 owner add) — the workflow is right per user feedback; only the command surface needs refresh

**Test scenarios:**
- Test expectation: none — this is a documentation update. Verification is the manual checklist below.

**Verification:**
- Every command snippet in the skill executes without `unknown command` against v1.2 binary
- A blank-state agent reading the skill can complete a full provision + verification + sitemap + add-owner + add-event + setup-conversions run without writing any workaround scripts

---

## System-Wide Impact

- **Interaction graph:** `provision` now talks to `errors.ts`, the new pre-check methods on each provider, and reads `defaultTimezone`/`defaultCurrency` from `GlobalConfig`. `status --fix` now reads `siteConfig.gsc.verificationMethod` and `siteConfig.gsc.sitemapPending`.
- **Error propagation:** Errors propagate raw from providers; the orchestrator (commands) translates at the seam. This keeps providers testable and means future commands inherit the translator for free.
- **State lifecycle risks:** New `siteConfig.gsc.sitemapPending` field must be cleared on successful `--fix` — a stuck pending state would cause repeated re-submits. Test scenario in U2 covers this.
- **API surface parity:** `--json` output gains new fields (`sitemapDeferred`, `followUpCommand`, `verificationMethod`, `accountIdSource`). These are additive, not breaking.
- **Integration coverage:** End-to-end provision against a fresh test domain after every unit ships — unit-level mocks alone won't prove that the GTM idempotency check + skip flags + pre-check all compose correctly.
- **Unchanged invariants:** `add-owner`, `add-event` command surfaces stay identical. The service account auth model, env var name, and global config file location do not change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Changing default verification method from DNS to meta could surprise existing automation | Major-version bump consideration deferred — v1.2 documents the change in CHANGELOG; no existing scripted callers depend on the default |
| Changing default timezone/currency to UTC/USD when no init has run could create properties with wrong tz for users upgrading from v1.1 | Keep the *fallback* at `America/New_York`/`USD` to match v1.1 behavior; only change the *prompt suggestion* in `init` to UTC. Users opt into UTC by re-running `init` |
| Error translator catches too broadly and hides real bugs | Translator never swallows — unknown errors fall through with `raw` field intact; only adds the `summary`/`fix` annotation |
| GTM idempotency by display name false-matches a pre-existing unrelated container with the same domain string | Match must require *exact* equality on display name + the container being a `web` type; document in `gtm.ts` |
| `setup-conversions` paused tags accumulate cruft on re-run | Skip-if-exists by tag name (same as `add-event`) — re-running is a no-op |

---

## Documentation / Operational Notes

- Bump version to `1.2.0` in `package.json` and skill prose
- Add a CHANGELOG entry with: new flags (`--verification-method`, `--skip-ga4`, `--skip-gtm`, `--skip-gsc`, `--no-saved-config`, `--confirm-saved-config`), new commands (`add-verification`, `setup-conversions`), default behavior changes (verification method `dns` → `meta`)
- After publish, run `npm publish --access public` and update the README's Quick Start to use `--verification-method=meta` since most users will benefit

---

## Sources & References

- Punch list: provided in invocation (real client setup feedback for `bearteam.tv`)
- Existing CLI: `src/commands/`, `src/providers/`, `src/index.ts`
- Prior plan: `docs/plans/2026-03-26-001-feat-google-site-setup-cli-plan.md`
- Existing skill: `~/.claude/skills/google-site-setup/SKILL.md`
- Workaround scripts (starter implementations referenced in research): `add-gsc-owner.cjs`, `verify-url-prefix.cjs`, `cleanup-wrong-account.cjs`, `setup-gtm-events.cjs`, `refactor-gtm.cjs`, `mark-key-events.cjs`
