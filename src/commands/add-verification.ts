import { provisionGSC, isSupportedVerificationMethod, listSupportedVerificationMethods } from "../providers/gsc.js";
import { loadSiteConfig, saveSiteConfig } from "../config.js";
import type { VerificationMethod, SiteConfig } from "../types.js";

interface AddVerificationOptions {
  method?: string;
  json?: boolean;
}

export async function addVerificationCommand(
  domain: string,
  opts: AddVerificationOptions
) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const siteConfig = loadSiteConfig(cleanDomain);
  const requested = opts.method || siteConfig?.gsc?.verificationMethod || "meta";

  if (!isSupportedVerificationMethod(requested)) {
    console.error(
      `Error: unsupported verification method "${requested}".\n` +
        `Supported: ${listSupportedVerificationMethods().join(", ")}`
    );
    process.exit(1);
    return;
  }

  const method: VerificationMethod = requested;

  console.log(`\nRequesting ${method} verification for ${cleanDomain}...\n`);

  try {
    const result = await provisionGSC({
      domain: cleanDomain,
      verificationMethod: method,
      sitemapUrl: siteConfig?.gsc?.sitemapPending,
    });

    // Persist updated GSC state
    const updated: SiteConfig = siteConfig || {
      domain: cleanDomain,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updated.gsc = result;
    saveSiteConfig(updated);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("");
    console.log(`  Site URL:            ${result.siteUrl}`);
    console.log(`  Verification method: ${result.verificationMethod}`);
    console.log(`  Verified:            ${result.verified ? "yes" : "no — follow instructions above"}`);
    if (result.sitemapDeferred) {
      console.log(`  Sitemap:             deferred (${result.sitemapPending})`);
    } else if (result.sitemapSubmitted) {
      console.log(`  Sitemap:             submitted`);
    }
    if (result.followUpCommand) {
      console.log(`  Next:                ${result.followUpCommand}`);
    }
    console.log("");
  } catch (err) {
    const t = (err as { translated?: { summary: string; fix: string } }).translated;
    if (t) {
      console.error(`  ✗ ${t.summary}`);
      console.error(`  → ${t.fix}`);
    } else {
      console.error(
        `  Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    process.exit(1);
  }
}
