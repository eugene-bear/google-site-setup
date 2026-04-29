import { getSiteVerificationClient } from "../auth.js";

export async function addOwnerCommand(domain: string, email: string) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  console.log(`\nAdding ${email} as owner of ${cleanDomain}...\n`);

  const siteVerification = getSiteVerificationClient();

  // First check the site is verified
  try {
    const list = await siteVerification.webResource.list();
    const site = list.data.items?.find(
      (item) =>
        item.site?.type === "INET_DOMAIN" &&
        item.site?.identifier === cleanDomain
    );

    if (!site) {
      console.error(
        `  Error: ${cleanDomain} is not verified yet.\n` +
          `  Run "google-site-setup status ${cleanDomain} --fix" to verify first.`
      );
      process.exit(1);
      return;
    }

    const currentOwners = site.owners || [];

    if (currentOwners.includes(email)) {
      console.log(`  ${email} is already an owner — nothing to do.`);
      return;
    }

    // Add the new owner via patch
    const res = await siteVerification.webResource.patch({
      id: `dns://${cleanDomain}`,
      requestBody: {
        owners: [...currentOwners, email],
      },
    });

    const updatedOwners = res.data.owners || [];
    console.log(`  ✓ Owner added successfully!\n`);
    console.log(`  Current owners:`);
    for (const owner of updatedOwners) {
      console.log(`    - ${owner}`);
    }
    console.log("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Error: ${msg}`);
    process.exit(1);
  }
}
