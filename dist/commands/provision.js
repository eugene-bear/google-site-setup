import { loadGlobalConfig, loadSiteConfig, saveSiteConfig } from "../config.js";
import { provisionGA4 } from "../providers/ga4.js";
import { provisionGTM } from "../providers/gtm.js";
import { provisionGSC, isSupportedVerificationMethod, listSupportedVerificationMethods } from "../providers/gsc.js";
import { translateGoogleError } from "../errors.js";
const FALLBACK_TIMEZONE = "America/New_York";
const FALLBACK_CURRENCY = "USD";
function translatedFromError(err, service, operation, domain) {
    const pre = err.translated;
    if (pre)
        return pre;
    const t = translateGoogleError(err, { service, operation, domain });
    return { summary: t.summary, fix: t.fix };
}
export async function provisionCommand(opts) {
    const domain = opts.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const displayName = opts.name || domain;
    // Resolve config / saved-config awareness
    const globalConfig = opts.noSavedConfig ? {} : loadGlobalConfig();
    const usingSavedConfig = !opts.noSavedConfig &&
        Boolean(globalConfig.gaAccountId ||
            globalConfig.gtmAccountId ||
            globalConfig.defaultTimezone ||
            globalConfig.defaultCurrency);
    const gaAccount = opts.gaAccount || globalConfig.gaAccountId;
    const gtmAccount = opts.gtmAccount || globalConfig.gtmAccountId;
    const timezone = opts.timezone || globalConfig.defaultTimezone || FALLBACK_TIMEZONE;
    const currency = opts.currency || globalConfig.defaultCurrency || FALLBACK_CURRENCY;
    // Track sources for JSON output
    const accountIdSource = {
        ga4: opts.gaAccount ? "flag" : globalConfig.gaAccountId ? "config" : "none",
        gtm: opts.gtmAccount ? "flag" : globalConfig.gtmAccountId ? "config" : "none",
    };
    // Validate verification method
    let verificationMethod = "meta";
    if (opts.verificationMethod) {
        if (!isSupportedVerificationMethod(opts.verificationMethod)) {
            console.error(`Error: --verification-method must be one of ${listSupportedVerificationMethods().join(", ")}`);
            process.exit(1);
            return;
        }
        verificationMethod = opts.verificationMethod;
    }
    // Skip-flag combination sanity
    if (opts.skipGa4 && opts.skipGtm && opts.skipGsc) {
        console.log("Nothing to do — all three services are skipped.");
        return;
    }
    if (!opts.skipGa4 && !gaAccount) {
        console.error('Error: --ga-account is required (or run "google-site-setup init" to save defaults; or pass --skip-ga4)');
        process.exit(1);
        return;
    }
    if (!opts.skipGtm && !gtmAccount) {
        console.error('Error: --gtm-account is required (or run "google-site-setup init" to save defaults; or pass --skip-gtm)');
        process.exit(1);
        return;
    }
    // Resolve measurement ID up front when GA4 is being skipped
    const existingSite = loadSiteConfig(domain);
    let savedMeasurementId = opts.measurementId || existingSite?.ga4?.measurementId;
    if (opts.skipGa4 && !opts.skipGtm && !savedMeasurementId) {
        console.error("Error: --skip-ga4 requires either an existing GA4 measurement ID for this domain " +
            "or an explicit --measurement-id <G-XXXX> flag.");
        process.exit(1);
        return;
    }
    // ID-print header
    if (!opts.dryRun) {
        console.log(`\n━━━ Provisioning plan for ${domain} ━━━`);
        console.log(`  GA account:  ${gaAccount || "(skipped)"}${accountIdSource?.ga4 === "config" ? " (from saved config)" : accountIdSource?.ga4 === "flag" ? " (from flag)" : ""}`);
        console.log(`  GTM account: ${gtmAccount || "(skipped)"}${accountIdSource?.gtm === "config" ? " (from saved config)" : accountIdSource?.gtm === "flag" ? " (from flag)" : ""}`);
        console.log(`  Timezone:    ${timezone}`);
        console.log(`  Currency:    ${currency}`);
        console.log(`  Verification: ${verificationMethod}`);
        if (opts.skipGa4)
            console.log(`  Skipping:    GA4`);
        if (opts.skipGtm)
            console.log(`  Skipping:    GTM`);
        if (opts.skipGsc)
            console.log(`  Skipping:    GSC`);
        if (usingSavedConfig && !opts.confirmSavedConfig && !process.stdout.isTTY) {
            console.error("  Warning: account IDs came from saved config but --confirm-saved-config was not passed. " +
                "Pass --no-saved-config to opt out, or --confirm-saved-config to acknowledge.");
        }
        console.log("");
    }
    if (opts.dryRun) {
        console.log("\n=== DRY RUN ===\n");
        console.log(`Domain:       ${domain}`);
        console.log(`Display name: ${displayName}`);
        console.log(`GA account:   ${gaAccount || "(skipped)"}`);
        console.log(`GTM account:  ${gtmAccount || "(skipped)"}`);
        console.log(`Timezone:     ${timezone}`);
        console.log(`Currency:     ${currency}`);
        console.log(`Sitemap:      ${opts.sitemap || "(none)"}`);
        console.log(`Verification: ${verificationMethod}`);
        console.log(`Skips:        ${[
            opts.skipGa4 ? "ga4" : null,
            opts.skipGtm ? "gtm" : null,
            opts.skipGsc ? "gsc" : null,
        ].filter(Boolean).join(", ") || "(none)"}`);
        if (existingSite) {
            console.log(`\nExisting config found for ${domain}:`);
            if (existingSite.ga4)
                console.log(`  GA4: ${existingSite.ga4.measurementId}`);
            if (existingSite.gtm)
                console.log(`  GTM: ${existingSite.gtm.containerPublicId}`);
            if (existingSite.gsc)
                console.log(`  GSC: ${existingSite.gsc.verified ? "verified" : "unverified"}`);
        }
        else {
            console.log(`\nNo existing config — all non-skipped services will be created.`);
        }
        return;
    }
    console.log(`Provisioning Google services for ${domain}\n`);
    const result = {
        domain,
        timestamp: new Date().toISOString(),
        ga4: null,
        gtm: null,
        gsc: null,
        accountIdSource,
    };
    const siteConfig = existingSite || {
        domain,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    // --- Step 1: GA4 ---
    if (opts.skipGa4) {
        console.log("━━━ GA4 Analytics: SKIPPED (--skip-ga4) ━━━\n");
    }
    else {
        console.log("━━━ GA4 Analytics ━━━");
        try {
            result.ga4 = await provisionGA4({
                accountId: gaAccount,
                domain,
                displayName,
                timezone,
                currency,
                serviceAccountEmail: globalConfig.serviceAccountEmail,
            });
            siteConfig.ga4 = result.ga4;
            saveSiteConfig(siteConfig);
            savedMeasurementId = result.ga4.measurementId;
        }
        catch (err) {
            const t = translatedFromError(err, "ga4", "ga4.provision", domain);
            console.error(`  ✗ ${t.summary}`);
            console.error(`  → ${t.fix}`);
            console.error("  Continuing with remaining services...\n");
        }
    }
    // --- Step 2: GTM ---
    const measurementId = savedMeasurementId || siteConfig.ga4?.measurementId;
    if (opts.skipGtm) {
        console.log("\n━━━ Google Tag Manager: SKIPPED (--skip-gtm) ━━━\n");
    }
    else if (!measurementId) {
        console.error("\n━━━ Google Tag Manager ━━━");
        console.error("  Skipping GTM — no GA4 measurement ID available.");
        console.error("  Fix GA4 first (or pass --measurement-id <G-XXXX>), then re-run.\n");
    }
    else {
        console.log("\n━━━ Google Tag Manager ━━━");
        try {
            result.gtm = await provisionGTM({
                accountId: gtmAccount,
                domain,
                displayName,
                measurementId,
                serviceAccountEmail: globalConfig.serviceAccountEmail,
            });
            siteConfig.gtm = result.gtm;
            saveSiteConfig(siteConfig);
        }
        catch (err) {
            const t = translatedFromError(err, "gtm", "gtm.provision", domain);
            console.error(`  ✗ ${t.summary}`);
            console.error(`  → ${t.fix}`);
            console.error("  Continuing with remaining services...\n");
        }
    }
    // --- Step 3: Search Console ---
    if (opts.skipGsc) {
        console.log("\n━━━ Search Console: SKIPPED (--skip-gsc) ━━━\n");
    }
    else {
        console.log("\n━━━ Search Console ━━━");
        try {
            result.gsc = await provisionGSC({
                domain,
                sitemapUrl: opts.sitemap,
                verificationMethod,
            });
            siteConfig.gsc = result.gsc;
            saveSiteConfig(siteConfig);
        }
        catch (err) {
            const t = translatedFromError(err, "gsc", "gsc.provision", domain);
            console.error(`  ✗ ${t.summary}`);
            console.error(`  → ${t.fix}`);
        }
    }
    // --- Output ---
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Provisioning Summary");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`  Domain: ${domain}`);
    if (opts.skipGa4) {
        console.log(`\n  GA4: SKIPPED`);
    }
    else if (result.ga4) {
        console.log(`\n  GA4:`);
        console.log(`    Measurement ID:  ${result.ga4.measurementId}`);
        console.log(`    Property:        ${result.ga4.propertyId}`);
        console.log(`    Status:          ${result.ga4.skipped ? "already existed" : "created"}`);
    }
    else {
        console.log(`\n  GA4: FAILED`);
    }
    if (opts.skipGtm) {
        console.log(`\n  GTM: SKIPPED`);
    }
    else if (result.gtm) {
        console.log(`\n  GTM:`);
        console.log(`    Container ID:    ${result.gtm.containerPublicId}`);
        console.log(`    Status:          ${result.gtm.skipped ? "already existed" : "created & published"}`);
        if (!result.gtm.skipped) {
            console.log(`\n  GTM Head Snippet:\n`);
            console.log(result.gtm.snippet.head);
            console.log(`\n  GTM Body Snippet (after <body>):\n`);
            console.log(result.gtm.snippet.body);
        }
    }
    else if (measurementId) {
        console.log(`\n  GTM: FAILED`);
    }
    else {
        console.log(`\n  GTM: SKIPPED (no measurement ID)`);
    }
    if (opts.skipGsc) {
        console.log(`\n  Search Console: SKIPPED`);
    }
    else if (result.gsc) {
        console.log(`\n  Search Console:`);
        console.log(`    Site URL:        ${result.gsc.siteUrl}`);
        console.log(`    Method:          ${result.gsc.verificationMethod || verificationMethod}`);
        console.log(`    Verified:        ${result.gsc.verified ? "yes" : "no — see instructions above"}`);
        if (result.gsc.sitemapDeferred) {
            console.log(`    Sitemap:         deferred (${result.gsc.sitemapPending})`);
        }
        else {
            console.log(`    Sitemap:         ${result.gsc.sitemapSubmitted ? "submitted" : opts.sitemap ? "failed" : "not provided"}`);
        }
        if (result.gsc.followUpCommand) {
            console.log(`    Next:            ${result.gsc.followUpCommand}`);
        }
    }
    else {
        console.log(`\n  Search Console: FAILED`);
    }
    console.log(`\n  Config saved to ~/.google-site-setup/sites/${domain}.json`);
    console.log("");
}
