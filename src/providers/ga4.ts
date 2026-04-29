import { getAnalyticsAdminClient } from "../auth.js";
import { translateGoogleError } from "../errors.js";
import type { GA4Result } from "../types.js";

type AnalyticsAdmin = ReturnType<typeof getAnalyticsAdminClient>;

interface GA4Options {
  accountId: string;
  domain: string;
  displayName: string;
  timezone: string;
  currency: string;
  serviceAccountEmail?: string;
}

export async function assertGA4AccountAccess(
  accountId: string,
  serviceAccountEmail?: string
): Promise<void> {
  const admin = getAnalyticsAdminClient();
  try {
    const res = await admin.accounts.list({});
    const accounts = res.data.accounts || [];
    const match = accounts.some(
      (a) => a.name?.replace("accounts/", "") === accountId
    );
    if (!match) {
      const t = translateGoogleError(
        new Error(`GA4 account ${accountId} not in accounts.list()`),
        {
          service: "ga4",
          operation: "ga4.account_access",
          accountId,
          serviceAccountEmail,
        }
      );
      const err = new Error(t.summary) as Error & { translated: typeof t };
      err.translated = t;
      throw err;
    }
  } catch (err) {
    if ((err as { translated?: unknown }).translated) throw err;
    const t = translateGoogleError(err, {
      service: "ga4",
      operation: "ga4.account_access",
      accountId,
      serviceAccountEmail,
    });
    const wrapped = new Error(t.summary) as Error & { translated: typeof t };
    wrapped.translated = t;
    throw wrapped;
  }
}

export async function provisionGA4(options: GA4Options): Promise<GA4Result> {
  await assertGA4AccountAccess(options.accountId, options.serviceAccountEmail);

  const admin = getAnalyticsAdminClient();
  const parent = `accounts/${options.accountId}`;

  // Check for existing property with matching domain
  const existing = await findExistingProperty(admin, parent, options.domain);
  if (existing) {
    console.log(`  GA4 property already exists for ${options.domain} — skipping creation`);
    return { ...existing, skipped: true };
  }

  // Create property
  console.log(`  Creating GA4 property "${options.displayName}"...`);
  const propRes = await admin.properties.create({
    requestBody: {
      parent,
      displayName: options.displayName,
      timeZone: options.timezone,
      currencyCode: options.currency,
    },
  });

  const propertyName = propRes.data.name;
  if (!propertyName) {
    throw new Error("GA4 property creation returned no resource name");
  }

  // Create web data stream
  console.log(`  Creating web data stream for https://${options.domain}...`);
  const streamRes = await admin.properties.dataStreams.create({
    parent: propertyName,
    requestBody: {
      type: "WEB_DATA_STREAM",
      displayName: `${options.displayName} - Web`,
      webStreamData: {
        defaultUri: `https://${options.domain}`,
      },
    },
  });

  const measurementId = streamRes.data.webStreamData?.measurementId;
  if (!measurementId) {
    throw new Error("Data stream creation returned no measurement ID");
  }

  console.log(`  GA4 Measurement ID: ${measurementId}`);

  return {
    propertyId: propertyName,
    propertyName: options.displayName,
    measurementId,
    streamId: streamRes.data.name || "",
    skipped: false,
  };
}

async function findExistingProperty(
  admin: AnalyticsAdmin,
  parent: string,
  domain: string
): Promise<Omit<GA4Result, "skipped"> | null> {
  try {
    const res = await admin.properties.list({
      filter: `parent:${parent}`,
    });

    const properties = res.data.properties || [];
    if (properties.length === 0) return null;

    for (const prop of properties) {
      if (!prop.name) continue;

      const streamsRes = await admin.properties.dataStreams.list({
        parent: prop.name,
      });
      const streams = streamsRes.data.dataStreams || [];

      for (const stream of streams) {
        const uri = stream.webStreamData?.defaultUri;
        if (
          uri &&
          (uri === `https://${domain}` ||
            uri === `http://${domain}` ||
            uri === `https://www.${domain}` ||
            uri === `http://www.${domain}`)
        ) {
          return {
            propertyId: prop.name,
            propertyName: prop.displayName || domain,
            measurementId: stream.webStreamData?.measurementId || "",
            streamId: stream.name || "",
          };
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Warning: could not check for existing GA4 properties: ${msg}`);
    console.log(`  Proceeding with creation (may create duplicates if property already exists)`);
  }

  return null;
}
