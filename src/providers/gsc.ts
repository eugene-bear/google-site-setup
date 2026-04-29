import { getSearchConsoleClient, getSiteVerificationClient } from "../auth.js";
import { translateGoogleError } from "../errors.js";
import type { GSCResult, VerificationMethod } from "../types.js";

interface GSCOptions {
  domain: string;
  sitemapUrl?: string;
  verificationMethod?: VerificationMethod;
}

const SUPPORTED_METHODS: VerificationMethod[] = [
  "meta",
  "file",
  "dns",
  "gtm",
  "analytics",
];

// Map our short names to the Site Verification API enum values.
const API_METHOD: Record<VerificationMethod, string> = {
  meta: "META",
  file: "FILE",
  dns: "DNS_TXT",
  gtm: "TAG_MANAGER",
  analytics: "ANALYTICS",
};

// dns/gtm/analytics use INET_DOMAIN; meta/file are page-level (SITE).
const SITE_TYPE: Record<VerificationMethod, "INET_DOMAIN" | "SITE"> = {
  meta: "SITE",
  file: "SITE",
  dns: "INET_DOMAIN",
  gtm: "INET_DOMAIN",
  analytics: "INET_DOMAIN",
};

export function isSupportedVerificationMethod(
  v: string
): v is VerificationMethod {
  return (SUPPORTED_METHODS as string[]).includes(v);
}

export function listSupportedVerificationMethods(): VerificationMethod[] {
  return [...SUPPORTED_METHODS];
}

export async function provisionGSC(options: GSCOptions): Promise<GSCResult> {
  const method: VerificationMethod = options.verificationMethod || "meta";
  if (!isSupportedVerificationMethod(method)) {
    throw new Error(
      `Unsupported verification method: ${method}. Supported: ${SUPPORTED_METHODS.join(", ")}`
    );
  }

  const searchconsole = getSearchConsoleClient();
  const siteVerification = getSiteVerificationClient();

  // Search Console uses sc-domain: prefix for domain properties (DNS) or
  // https://domain/ for URL-prefix properties (meta/file).
  const siteUrl =
    SITE_TYPE[method] === "INET_DOMAIN"
      ? `sc-domain:${options.domain}`
      : `https://${options.domain}/`;

  // Check if site already exists and is verified
  const existing = await checkExistingSite(searchconsole, siteUrl);
  if (existing?.verified) {
    console.log(`  Search Console site already verified for ${options.domain} — skipping`);

    let sitemapSubmitted = false;
    let sitemapDeferred = false;
    let sitemapPending: string | undefined;
    if (options.sitemapUrl) {
      const r = await submitSitemap(searchconsole, siteUrl, options.sitemapUrl, options.domain);
      sitemapSubmitted = r.submitted;
      sitemapDeferred = r.deferred;
      sitemapPending = r.deferred ? options.sitemapUrl : undefined;
    }

    return {
      siteUrl,
      verified: true,
      verificationMethod: method,
      sitemapSubmitted,
      sitemapDeferred: sitemapDeferred || undefined,
      sitemapPending,
      followUpCommand: sitemapDeferred
        ? `google-site-setup status ${options.domain} --fix`
        : undefined,
      skipped: true,
    };
  }

  // Add site to Search Console (best-effort — verification may add it implicitly)
  console.log(`  Adding ${options.domain} to Search Console...`);
  try {
    await searchconsole.sites.add({ siteUrl });
  } catch (err: unknown) {
    const code = err instanceof Error && "code" in err ? (err as { code: number }).code : undefined;
    if (code === 409) {
      // already exists — fine
    } else if (code === 403) {
      console.log(`  Note: 403 on sites.add — will retry after verification`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  Note: sites.add returned: ${msg} (continuing — verification may add it)`);
    }
  }

  // Get verification token for the chosen method
  let verificationToken: string | undefined;
  console.log(`  Requesting ${method} verification token...`);
  try {
    const tokenRes = await siteVerification.webResource.getToken({
      requestBody: {
        site: {
          type: SITE_TYPE[method],
          identifier:
            SITE_TYPE[method] === "INET_DOMAIN"
              ? options.domain
              : `https://${options.domain}/`,
        },
        verificationMethod: API_METHOD[method],
      },
    });
    verificationToken = tokenRes.data.token || undefined;
  } catch (err) {
    const t = translateGoogleError(err, {
      service: "siteverification",
      operation: `siteverification.getToken.${method}`,
      domain: options.domain,
    });
    console.log(`  ✗ ${t.summary}`);
    console.log(`  → ${t.fix}`);
  }

  // Try to verify (in case the verification record/tag is already live)
  let verified = false;
  if (verificationToken) {
    try {
      await siteVerification.webResource.insert({
        verificationMethod: API_METHOD[method],
        requestBody: {
          site: {
            type: SITE_TYPE[method],
            identifier:
              SITE_TYPE[method] === "INET_DOMAIN"
                ? options.domain
                : `https://${options.domain}/`,
          },
        },
      });
      verified = true;
      console.log(`  ✓ Site verified successfully via ${method}!`);
    } catch {
      // Expected on first run — the verification record isn't live yet.
      verified = false;
    }
  }

  let verificationInstructions: string | undefined;
  if (!verified && verificationToken) {
    verificationInstructions = renderInstructions(method, options.domain, verificationToken);
    console.log("");
    console.log(verificationInstructions);
    console.log("");
  }

  // Submit sitemap (will be deferred if site isn't verified yet)
  let sitemapSubmitted = false;
  let sitemapDeferred = false;
  let sitemapPending: string | undefined;
  if (options.sitemapUrl) {
    if (verified) {
      const r = await submitSitemap(searchconsole, siteUrl, options.sitemapUrl, options.domain);
      sitemapSubmitted = r.submitted;
      sitemapDeferred = r.deferred;
      sitemapPending = r.deferred ? options.sitemapUrl : undefined;
    } else {
      console.log(
        `  Sitemap submission deferred — verify the site first, then run "google-site-setup status ${options.domain} --fix"`
      );
      sitemapDeferred = true;
      sitemapPending = options.sitemapUrl;
    }
  }

  return {
    siteUrl,
    verified,
    verificationToken,
    verificationMethod: method,
    verificationInstructions,
    sitemapSubmitted,
    sitemapDeferred: sitemapDeferred || undefined,
    sitemapPending,
    followUpCommand: sitemapDeferred || !verified
      ? `google-site-setup status ${options.domain} --fix`
      : undefined,
    skipped: false,
  };
}

interface SubmitResult {
  submitted: boolean;
  deferred: boolean;
}

async function submitSitemap(
  searchconsole: ReturnType<typeof getSearchConsoleClient>,
  siteUrl: string,
  sitemapUrl: string,
  domain: string
): Promise<SubmitResult> {
  console.log(`  Submitting sitemap: ${sitemapUrl}...`);
  try {
    await searchconsole.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
    console.log(`  ✓ Sitemap submitted successfully`);
    return { submitted: true, deferred: false };
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? (err as { code: number }).code
        : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    const isUnverified =
      code === 403 || /sufficient permission|forbidden|user does not have/i.test(msg);
    if (isUnverified) {
      console.log(
        `  Sitemap deferred — site ${domain} isn't verified yet. ` +
          `Run "google-site-setup status ${domain} --fix" once the verification record is live.`
      );
      return { submitted: false, deferred: true };
    }
    console.log(`  ✗ Sitemap submission failed: ${msg}`);
    return { submitted: false, deferred: false };
  }
}

async function checkExistingSite(
  searchconsole: ReturnType<typeof getSearchConsoleClient>,
  siteUrl: string
): Promise<{ verified: boolean } | null> {
  try {
    const res = await searchconsole.sites.get({ siteUrl });
    return { verified: res.data.permissionLevel !== "siteUnverifiedUser" };
  } catch {
    return null;
  }
}

function renderInstructions(
  method: VerificationMethod,
  domain: string,
  token: string
): string {
  const lines: string[] = [];
  const cmd = `google-site-setup status ${domain} --fix`;
  switch (method) {
    case "meta":
      lines.push(`  ┌─ Meta-tag Verification ─────────────────────────────`);
      lines.push(`  │`);
      lines.push(`  │  Add this <meta> tag inside your site's <head>:`);
      lines.push(`  │`);
      lines.push(`  │    <meta name="google-site-verification" content="${token}" />`);
      lines.push(`  │`);
      lines.push(`  │  Then run:  ${cmd}`);
      lines.push(`  └─────────────────────────────────────────────────────`);
      break;
    case "file":
      lines.push(`  ┌─ File Verification ─────────────────────────────────`);
      lines.push(`  │`);
      lines.push(`  │  Upload a file to your site root:`);
      lines.push(`  │`);
      lines.push(`  │    URL:      https://${domain}/${token}`);
      lines.push(`  │    Contents: google-site-verification: ${token}`);
      lines.push(`  │`);
      lines.push(`  │  Then run:  ${cmd}`);
      lines.push(`  └─────────────────────────────────────────────────────`);
      break;
    case "dns":
      lines.push(`  ┌─ DNS Verification ──────────────────────────────────`);
      lines.push(`  │`);
      lines.push(`  │  Add this TXT record:`);
      lines.push(`  │`);
      lines.push(`  │    Type:  TXT`);
      lines.push(`  │    Name:  @  (or ${domain})`);
      lines.push(`  │    Value: ${token}`);
      lines.push(`  │`);
      lines.push(`  │  Then run:  ${cmd}`);
      lines.push(`  └─────────────────────────────────────────────────────`);
      break;
    case "gtm":
      lines.push(`  ┌─ Google Tag Manager Verification ───────────────────`);
      lines.push(`  │`);
      lines.push(`  │  GTM container code must be live on https://${domain}/.`);
      lines.push(`  │  After deploying the GTM snippet, run:`);
      lines.push(`  │`);
      lines.push(`  │    ${cmd}`);
      lines.push(`  └─────────────────────────────────────────────────────`);
      break;
    case "analytics":
      lines.push(`  ┌─ Google Analytics Verification ─────────────────────`);
      lines.push(`  │`);
      lines.push(`  │  GA4 / gtag must be live on https://${domain}/.`);
      lines.push(`  │  After the tag is firing, run:`);
      lines.push(`  │`);
      lines.push(`  │    ${cmd}`);
      lines.push(`  └─────────────────────────────────────────────────────`);
      break;
  }
  return lines.join("\n");
}
