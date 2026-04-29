import { getTagManagerClient } from "../auth.js";
import { loadGlobalConfig, loadSiteConfig, saveSiteConfig } from "../config.js";
import { translateGoogleError } from "../errors.js";
import { ALL_PLATFORMS, getConversionTag, } from "../templates/conversion-tags.js";
const GTM_DELAY_MS = 4500;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export async function setupConversionsCommand(domain, opts) {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const globalConfig = loadGlobalConfig();
    const siteConfig = loadSiteConfig(cleanDomain);
    if (!globalConfig.gtmAccountId) {
        console.error('Error: No GTM account ID found. Run "google-site-setup init" first.');
        process.exit(1);
        return;
    }
    if (!siteConfig?.gtm) {
        console.error(`Error: No GTM container found for ${cleanDomain}.\n` +
            `Run "google-site-setup provision --domain ${cleanDomain}" first.`);
        process.exit(1);
        return;
    }
    // Parse platforms
    let platforms = ALL_PLATFORMS;
    if (opts.platforms) {
        const requested = opts.platforms
            .split(",")
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean);
        const invalid = requested.filter((p) => !ALL_PLATFORMS.includes(p));
        if (invalid.length > 0) {
            console.error(`Error: unsupported platform(s): ${invalid.join(", ")}\n` +
                `Supported: ${ALL_PLATFORMS.join(", ")}`);
            process.exit(1);
            return;
        }
        platforms = requested;
    }
    const accountId = globalConfig.gtmAccountId;
    const containerId = siteConfig.gtm.containerId;
    const containerPath = `accounts/${accountId}/containers/${containerId}`;
    console.log(`\nAdding paused conversion stubs to GTM container ${siteConfig.gtm.containerPublicId}: ${platforms.join(", ")}\n`);
    const tagmanager = getTagManagerClient();
    const workspacePath = await getDefaultWorkspace(tagmanager, containerPath);
    // List existing tags so we can skip ones that already exist (re-run idempotency)
    let existingTagNames = new Set();
    try {
        const listed = await tagmanager.accounts.containers.workspaces.tags.list({
            parent: workspacePath,
        });
        existingTagNames = new Set((listed.data.tag || []).map((t) => t.name || ""));
    }
    catch {
        /* if listing fails, fall through; create may still error individually */
    }
    const created = [];
    const skipped = [];
    for (const platform of platforms) {
        const def = getConversionTag(platform);
        if (existingTagNames.has(def.name)) {
            console.log(`  → ${def.name} already exists, skipping`);
            skipped.push(platform);
            continue;
        }
        console.log(`  Creating ${def.name}...`);
        try {
            await tagmanager.accounts.containers.workspaces.tags.create({
                parent: workspacePath,
                requestBody: def.body,
            });
            console.log(`  ✓ Created (paused)`);
            created.push(platform);
        }
        catch (err) {
            const t = translateGoogleError(err, {
                service: "gtm",
                operation: "tagmanager.create_tag",
                accountId,
                domain: cleanDomain,
            });
            console.log(`  ✗ ${t.summary}`);
            console.log(`  → ${t.fix}`);
        }
        await delay(GTM_DELAY_MS);
    }
    let versionId;
    if (created.length > 0) {
        console.log(`  Creating container version...`);
        try {
            const version = await tagmanager.accounts.containers.workspaces.create_version({
                path: workspacePath,
                requestBody: {
                    name: `Add conversion stubs (${created.join(", ")})`,
                    notes: `Paused stubs created by google-site-setup setup-conversions for: ${created.join(", ")}`,
                },
            });
            versionId = version.data.containerVersion?.containerVersionId || undefined;
            if (versionId) {
                console.log(`  ✓ Version ${versionId} created`);
                await delay(GTM_DELAY_MS);
                console.log(`  Publishing...`);
                await tagmanager.accounts.containers.versions.publish({
                    path: `${containerPath}/versions/${versionId}`,
                });
                console.log(`  ✓ Published\n`);
                siteConfig.gtm.versionId = versionId;
                saveSiteConfig(siteConfig);
            }
        }
        catch (err) {
            const t = translateGoogleError(err, {
                service: "gtm",
                operation: "tagmanager.create_version",
                accountId,
                domain: cleanDomain,
            });
            console.log(`  ✗ ${t.summary}`);
            console.log(`  → ${t.fix}`);
        }
    }
    const result = {
        domain: cleanDomain,
        container: siteConfig.gtm.containerPublicId,
        created,
        skipped,
        versionId,
        nextSteps: created.map((p) => {
            const def = getConversionTag(p);
            return `Open GTM → Tags → "${def.name}" → fill in real ID, attach trigger, unpause.`;
        }),
    };
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log("  Summary:");
    console.log(`    Created: ${created.length ? created.join(", ") : "(none)"}`);
    console.log(`    Skipped: ${skipped.length ? skipped.join(", ") : "(none)"}`);
    if (versionId)
        console.log(`    Version: ${versionId} (published)`);
    if (created.length > 0) {
        console.log("\n  Next steps:");
        for (const step of result.nextSteps) {
            console.log(`    - ${step}`);
        }
    }
    console.log("");
}
async function getDefaultWorkspace(tagmanager, containerPath) {
    const res = await tagmanager.accounts.containers.workspaces.list({
        parent: containerPath,
    });
    const workspaces = res.data.workspace || [];
    const defaultWs = workspaces.find((w) => w.name === "Default Workspace") || workspaces[0];
    if (!defaultWs?.path) {
        throw new Error("No workspace found in GTM container. The container may be in an unexpected state.");
    }
    return defaultWs.path;
}
