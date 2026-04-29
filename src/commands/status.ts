import { loadSiteConfig, loadGlobalConfig, saveSiteConfig } from "../config.js";
import {
  getAnalyticsAdminClient,
  getTagManagerClient,
  getSearchConsoleClient,
  getSiteVerificationClient,
} from "../auth.js";
import type { VerificationMethod } from "../types.js";

interface StatusOptions {
  json?: boolean;
  fix?: boolean;
}

const API_METHOD: Record<VerificationMethod, string> = {
  meta: "META",
  file: "FILE",
  dns: "DNS_TXT",
  gtm: "TAG_MANAGER",
  analytics: "ANALYTICS",
};

const SITE_TYPE: Record<VerificationMethod, "INET_DOMAIN" | "SITE"> = {
  meta: "SITE",
  file: "SITE",
  dns: "INET_DOMAIN",
  gtm: "INET_DOMAIN",
  analytics: "INET_DOMAIN",
};

export async function statusCommand(domain: string | undefined, opts: StatusOptions) {
  if (!domain) {
    console.log('Usage: google-site-setup status <domain>');
    console.log('Example: google-site-setup status example.com');
    process.exit(1);
    return;
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  domain = cleanDomain;

  const siteConfig = loadSiteConfig(domain);

  const status = {
    domain,
    ga4: { configured: false, live: false, measurementId: "", propertyId: "" },
    gtm: { configured: false, live: false, containerPublicId: "", published: false },
    gsc: {
      configured: false,
      live: false,
      verified: false,
      sitemapSubmitted: false,
      sitemapDeferred: false,
      sitemapPending: undefined as string | undefined,
      verificationMethod: undefined as VerificationMethod | undefined,
    },
  };

  if (siteConfig?.ga4) {
    status.ga4.configured = true;
    status.ga4.measurementId = siteConfig.ga4.measurementId;
    status.ga4.propertyId = siteConfig.ga4.propertyId;
  }
  if (siteConfig?.gtm) {
    status.gtm.configured = true;
    status.gtm.containerPublicId = siteConfig.gtm.containerPublicId;
  }
  if (siteConfig?.gsc) {
    status.gsc.configured = true;
    status.gsc.verified = siteConfig.gsc.verified;
    status.gsc.sitemapSubmitted = siteConfig.gsc.sitemapSubmitted;
    status.gsc.sitemapDeferred = siteConfig.gsc.sitemapDeferred || false;
    status.gsc.sitemapPending = siteConfig.gsc.sitemapPending;
    status.gsc.verificationMethod = siteConfig.gsc.verificationMethod;
  }

  console.log(`\nChecking live status for ${domain}...\n`);

  const globalConfig = loadGlobalConfig();

  // GA4 live check
  if (status.ga4.propertyId) {
    try {
      const admin = getAnalyticsAdminClient();
      const res = await admin.properties.get({ name: status.ga4.propertyId });
      if (res.data) status.ga4.live = true;
    } catch {
      /* property may have been deleted */
    }
  }

  // GTM live check
  if (status.gtm.containerPublicId && globalConfig.gtmAccountId) {
    try {
      const tagmanager = getTagManagerClient();
      const res = await tagmanager.accounts.containers.list({
        parent: `accounts/${globalConfig.gtmAccountId}`,
      });
      const match = res.data.container?.find(
        (c) => c.publicId === status.gtm.containerPublicId
      );
      if (match) {
        status.gtm.live = true;
        try {
          const versions = await tagmanager.accounts.containers.version_headers.list({
            parent: match.path || "",
          });
          status.gtm.published = (versions.data.containerVersionHeader?.length || 0) > 0;
        } catch {
          /* ok */
        }
      }
    } catch {
      /* can't reach GTM */
    }
  }

  // GSC live check — try both URL forms based on stored method
  const searchconsole = getSearchConsoleClient();
  const method = status.gsc.verificationMethod || "meta";
  const siteUrl =
    SITE_TYPE[method] === "INET_DOMAIN"
      ? `sc-domain:${domain}`
      : `https://${domain}/`;

  try {
    const res = await searchconsole.sites.get({ siteUrl });
    status.gsc.live = true;
    status.gsc.verified = res.data.permissionLevel !== "siteUnverifiedUser";

    try {
      const sitemaps = await searchconsole.sitemaps.list({ siteUrl });
      status.gsc.sitemapSubmitted = (sitemaps.data.sitemap?.length || 0) > 0;
      if (status.gsc.sitemapSubmitted) {
        status.gsc.sitemapDeferred = false;
        status.gsc.sitemapPending = undefined;
      }
    } catch {
      /* ok */
    }
  } catch {
    /* site not in GSC */
  }

  if (opts.fix) {
    let fixed = false;

    if (status.gsc.live && !status.gsc.verified) {
      console.log(`  Attempting Search Console verification (${method})...`);
      try {
        const siteVerification = getSiteVerificationClient();
        await siteVerification.webResource.insert({
          verificationMethod: API_METHOD[method],
          requestBody: {
            site: {
              type: SITE_TYPE[method],
              identifier:
                SITE_TYPE[method] === "INET_DOMAIN"
                  ? domain
                  : `https://${domain}/`,
            },
          },
        });
        status.gsc.verified = true;
        fixed = true;
        console.log(`  ✓ Site verified successfully!`);
        if (siteConfig?.gsc) {
          siteConfig.gsc.verified = true;
          saveSiteConfig(siteConfig);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          `  ✗ Verification failed — the ${method} record may not be live yet: ${msg}`
        );
      }
    }

    // Submit pending sitemap (may be from a deferred earlier provision)
    const sitemapToSubmit =
      status.gsc.sitemapPending ||
      (status.gsc.verified && !status.gsc.sitemapSubmitted
        ? `https://${domain}/sitemap.xml`
        : null);

    if (status.gsc.verified && !status.gsc.sitemapSubmitted && sitemapToSubmit) {
      console.log(`  Submitting sitemap: ${sitemapToSubmit}...`);
      try {
        await searchconsole.sitemaps.submit({ siteUrl, feedpath: sitemapToSubmit });
        status.gsc.sitemapSubmitted = true;
        status.gsc.sitemapDeferred = false;
        status.gsc.sitemapPending = undefined;
        fixed = true;
        console.log(`  ✓ Sitemap submitted successfully!`);
        if (siteConfig?.gsc) {
          siteConfig.gsc.sitemapSubmitted = true;
          siteConfig.gsc.sitemapDeferred = undefined;
          siteConfig.gsc.sitemapPending = undefined;
          saveSiteConfig(siteConfig);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ Sitemap submission failed: ${msg}`);
      }
    }

    if (!fixed && status.gsc.verified && status.gsc.sitemapSubmitted) {
      console.log(`  Nothing to fix — everything looks good!`);
    }

    console.log("");
  }

  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const yn = (v: boolean) => (v ? "yes" : "no");

  console.log(`  Domain: ${domain}\n`);
  console.log(`  ${"Service".padEnd(20)} ${"Configured".padEnd(14)} ${"Live".padEnd(8)} Details`);
  console.log(`  ${"─".repeat(20)} ${"─".repeat(14)} ${"─".repeat(8)} ${"─".repeat(40)}`);
  console.log(
    `  ${"GA4 Analytics".padEnd(20)} ${yn(status.ga4.configured).padEnd(14)} ${yn(status.ga4.live).padEnd(8)} ${status.ga4.measurementId || "—"}`
  );
  console.log(
    `  ${"Tag Manager".padEnd(20)} ${yn(status.gtm.configured).padEnd(14)} ${yn(status.gtm.live).padEnd(8)} ${status.gtm.containerPublicId || "—"}${status.gtm.published ? " (published)" : ""}`
  );
  const gscDetails =
    `verified: ${yn(status.gsc.verified)}, sitemap: ` +
    (status.gsc.sitemapSubmitted
      ? "yes"
      : status.gsc.sitemapDeferred
      ? `deferred (${status.gsc.sitemapPending})`
      : "no");
  console.log(
    `  ${"Search Console".padEnd(20)} ${yn(status.gsc.configured).padEnd(14)} ${yn(status.gsc.live).padEnd(8)} ${gscDetails}`
  );
  if (status.gsc.sitemapDeferred && !opts.fix) {
    console.log(
      `\n  Sitemap is deferred. Run "google-site-setup status ${domain} --fix" to retry once the verification record is live.`
    );
  }
  console.log("");
}
