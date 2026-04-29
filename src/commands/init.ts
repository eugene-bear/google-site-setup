import * as readline from "node:readline";
import {
  loadServiceAccountKey,
  getAnalyticsAdminClient,
  getTagManagerClient,
  getSearchConsoleClient,
} from "../auth.js";
import { loadGlobalConfig, saveGlobalConfig, getConfigDir } from "../config.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function initCommand() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n━━━ google-site-setup init ━━━\n");

  const existing = loadGlobalConfig();
  if (existing.serviceAccountEmail) {
    console.log(`Existing config found:`);
    console.log(`  Service account: ${existing.serviceAccountEmail}`);
    if (existing.gaAccountId) console.log(`  GA4 account:     ${existing.gaAccountId}`);
    if (existing.gtmAccountId) console.log(`  GTM account:     ${existing.gtmAccountId}`);
    console.log("");
    const revalidate = await ask(rl, "Re-validate and update? (y/N) ");
    if (revalidate.toLowerCase() !== "y") {
      console.log("No changes made.");
      rl.close();
      return;
    }
    console.log("");
  }

  // --- Step 1: Service account key ---
  console.log("Step 1: Service Account Key\n");

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    console.log("  GOOGLE_SERVICE_ACCOUNT_KEY is not set.\n");
    console.log("  To set up, you need to:");
    console.log("  1. Create a Google Cloud project (or use an existing one)");
    console.log("  2. Enable these APIs:");
    console.log("     - https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com");
    console.log("     - https://console.cloud.google.com/apis/library/tagmanager.googleapis.com");
    console.log("     - https://console.cloud.google.com/apis/library/searchconsole.googleapis.com");
    console.log("     - https://console.cloud.google.com/apis/library/siteverification.googleapis.com");
    console.log("  3. Create a service account (skip both the Permissions and Principals steps):");
    console.log("     https://console.cloud.google.com/iam-admin/serviceaccounts");
    console.log("  4. Download the JSON key");
    console.log("  5. Set the env var:");
    console.log('     export GOOGLE_SERVICE_ACCOUNT_KEY="/path/to/key.json"');
    console.log("");
    console.log("  6. Grant the service account access in each service:");
    console.log("     - GA4: Admin > Account Access Management > add as Editor");
    console.log("     - GTM: Admin > User Management > add as Admin");
    console.log("     - Search Console: Settings > Users and permissions > add as Owner");
    console.log("");
    console.log("  Then re-run: google-site-setup init");
    rl.close();
    process.exit(1);
  }

  let serviceAccountEmail = "";
  try {
    const key = loadServiceAccountKey();
    serviceAccountEmail = key.client_email;
    console.log(`  Key loaded: ${serviceAccountEmail}\n`);
  } catch (err) {
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    rl.close();
    process.exit(1);
  }

  // --- Step 2: GA4 ---
  console.log("Step 2: Google Analytics 4\n");
  console.log(`  Checking GA4 access for ${serviceAccountEmail}...`);

  let gaAccountId: string | undefined;
  try {
    const admin = getAnalyticsAdminClient();
    const res = await admin.accounts.list({});
    const accounts = res.data.accounts || [];

    if (accounts.length > 0) {
      console.log(`  Found ${accounts.length} GA4 account(s):\n`);
      for (let i = 0; i < accounts.length; i++) {
        const id = accounts[i].name?.replace("accounts/", "");
        console.log(`    [${i + 1}] ${accounts[i].displayName} (ID: ${id})`);
      }
      console.log("");

      const choice = await ask(rl, `  Select account (1-${accounts.length}): `);
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < accounts.length) {
        gaAccountId = accounts[idx].name?.replace("accounts/", "") || undefined;
        console.log(`  Using GA4 account: ${gaAccountId}\n`);
      } else {
        console.log("  Invalid selection — skipping GA4 account setup.\n");
      }
    } else {
      console.log("  API access works, but no accounts found.");
      console.log("  The service account may need Editor access on your GA account.");
      console.log("  Go to: GA4 Admin > Account Access Management");
      console.log(`  Add: ${serviceAccountEmail} as Editor\n`);

      const manualId = await ask(rl, "  Enter GA4 account ID manually (or press Enter to skip): ");
      if (manualId.trim()) gaAccountId = manualId.trim();
    }
  } catch (err) {
    console.log(`  Cannot access GA4: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  The service account needs Editor access on your GA account.");
    console.log("  Go to: GA4 Admin > Account Access Management");
    console.log(`  Add: ${serviceAccountEmail} as Editor\n`);

    const manualId = await ask(rl, "  Enter GA4 account ID manually (or press Enter to skip): ");
    if (manualId.trim()) gaAccountId = manualId.trim();
  }

  // --- Step 3: GTM ---
  console.log("Step 3: Google Tag Manager\n");
  console.log(`  Checking GTM access for ${serviceAccountEmail}...`);

  let gtmAccountId: string | undefined;
  try {
    const tagmanager = getTagManagerClient();
    const res = await tagmanager.accounts.list({});
    const accounts = res.data.account || [];

    if (accounts.length > 0) {
      console.log(`  Found ${accounts.length} GTM account(s):\n`);
      for (let i = 0; i < accounts.length; i++) {
        const id = accounts[i].accountId;
        console.log(`    [${i + 1}] ${accounts[i].name} (ID: ${id})`);
      }
      console.log("");

      const choice = await ask(rl, `  Select account (1-${accounts.length}): `);
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < accounts.length) {
        gtmAccountId = accounts[idx].accountId || undefined;
        console.log(`  Using GTM account: ${gtmAccountId}\n`);
      } else {
        console.log("  Invalid selection — skipping GTM account setup.\n");
      }
    } else {
      console.log("  API access works, but no accounts found.");
      console.log("  The service account may need Admin access on your GTM account.");
      console.log("  Go to: GTM Admin > User Management");
      console.log(`  Add: ${serviceAccountEmail} as Admin\n`);

      const manualId = await ask(rl, "  Enter GTM account ID manually (or press Enter to skip): ");
      if (manualId.trim()) gtmAccountId = manualId.trim();
    }
  } catch (err) {
    console.log(`  Cannot access GTM: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  The service account needs Admin access on your GTM account.");
    console.log("  Go to: GTM Admin > User Management");
    console.log(`  Add: ${serviceAccountEmail} as Admin\n`);

    const manualId = await ask(rl, "  Enter GTM account ID manually (or press Enter to skip): ");
    if (manualId.trim()) gtmAccountId = manualId.trim();
  }

  // --- Step 4: Search Console ---
  console.log("Step 4: Search Console\n");
  console.log(`  Checking Search Console access for ${serviceAccountEmail}...`);

  try {
    const searchconsole = getSearchConsoleClient();
    const res = await searchconsole.sites.list();
    const sites = res.data.siteEntry || [];
    console.log(`  Search Console access works (${sites.length} existing site(s))\n`);
  } catch (err) {
    console.log(`  Cannot access Search Console: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  The service account needs to be added as a delegated owner.");
    console.log("  Go to: Search Console > Settings > Users and permissions");
    console.log(`  Add: ${serviceAccountEmail} as Owner\n`);
  }

  // --- Step 5: Defaults (timezone, currency) ---
  console.log("Step 5: Default Timezone and Currency\n");

  const TZ_CHOICES = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Australia/Sydney",
    "Asia/Tokyo",
  ];
  for (let i = 0; i < TZ_CHOICES.length; i++) {
    console.log(`    [${i + 1}] ${TZ_CHOICES[i]}`);
  }
  const tzChoice = await ask(
    rl,
    `  Pick a default timezone (1-${TZ_CHOICES.length}, or press Enter for UTC, or type a custom IANA name): `
  );
  let defaultTimezone: string | undefined = "UTC";
  const tzIdx = parseInt(tzChoice, 10);
  if (!isNaN(tzIdx) && tzIdx >= 1 && tzIdx <= TZ_CHOICES.length) {
    defaultTimezone = TZ_CHOICES[tzIdx - 1];
  } else if (tzChoice.trim()) {
    defaultTimezone = tzChoice.trim();
  }
  console.log(`  Using timezone: ${defaultTimezone}\n`);

  const CCY_CHOICES = ["USD", "EUR", "GBP", "AUD", "CAD", "JPY"];
  for (let i = 0; i < CCY_CHOICES.length; i++) {
    console.log(`    [${i + 1}] ${CCY_CHOICES[i]}`);
  }
  const ccyChoice = await ask(
    rl,
    `  Pick a default currency (1-${CCY_CHOICES.length}, or press Enter for USD, or type an ISO code): `
  );
  let defaultCurrency: string | undefined = "USD";
  const ccyIdx = parseInt(ccyChoice, 10);
  if (!isNaN(ccyIdx) && ccyIdx >= 1 && ccyIdx <= CCY_CHOICES.length) {
    defaultCurrency = CCY_CHOICES[ccyIdx - 1];
  } else if (ccyChoice.trim()) {
    defaultCurrency = ccyChoice.trim().toUpperCase();
  }
  console.log(`  Using currency: ${defaultCurrency}\n`);

  // --- Save config ---
  const config = {
    gaAccountId,
    gtmAccountId,
    serviceAccountEmail,
    defaultTimezone,
    defaultCurrency,
    lastValidated: new Date().toISOString(),
  };

  saveGlobalConfig(config);
  console.log("━━━ Configuration Saved ━━━\n");
  console.log(`  Config file: ${getConfigDir()}/config.json`);
  console.log(`  GA4 account:  ${gaAccountId || "(not set)"}`);
  console.log(`  GTM account:  ${gtmAccountId || "(not set)"}`);
  console.log(`  Service acct: ${serviceAccountEmail}`);
  console.log(`  Default tz:   ${defaultTimezone}`);
  console.log(`  Default ccy:  ${defaultCurrency}`);
  console.log("");
  console.log("  You can now run:");
  console.log('  google-site-setup provision --domain example.com --sitemap https://example.com/sitemap.xml');
  console.log("");

  rl.close();
}
