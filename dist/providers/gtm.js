import { getTagManagerClient } from "../auth.js";
import { translateGoogleError } from "../errors.js";
import { BUILT_IN_VARIABLES, makeGA4Tag, makeAllPagesTrigger, } from "../templates/gtm-base.js";
export async function assertGTMAccountAccess(accountId, serviceAccountEmail) {
    const tagmanager = getTagManagerClient();
    try {
        const res = await tagmanager.accounts.list({});
        const accounts = res.data.account || [];
        const match = accounts.some((a) => a.accountId === accountId);
        if (!match) {
            const t = translateGoogleError(new Error(`GTM account ${accountId} not in accounts.list()`), {
                service: "gtm",
                operation: "gtm.account_access",
                accountId,
                serviceAccountEmail,
            });
            const err = new Error(t.summary);
            err.translated = t;
            throw err;
        }
    }
    catch (err) {
        if (err.translated)
            throw err;
        const t = translateGoogleError(err, {
            service: "gtm",
            operation: "gtm.account_access",
            accountId,
            serviceAccountEmail,
        });
        const wrapped = new Error(t.summary);
        wrapped.translated = t;
        throw wrapped;
    }
}
// GTM API enforces ~0.25 QPS. Add delay between calls.
const GTM_DELAY_MS = 4500;
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function provisionGTM(options) {
    await assertGTMAccountAccess(options.accountId, options.serviceAccountEmail);
    const tagmanager = getTagManagerClient();
    const accountPath = `accounts/${options.accountId}`;
    // Check for existing container
    const existing = await findExistingContainer(tagmanager, accountPath, options.domain);
    if (existing) {
        console.log(`  GTM container already exists for ${options.domain} — skipping creation`);
        return { ...existing, skipped: true };
    }
    // 1. Create container
    console.log(`  Creating GTM container "${options.displayName}"...`);
    const container = await tagmanager.accounts.containers.create({
        parent: accountPath,
        requestBody: {
            name: options.displayName,
            usageContext: ["web"],
            domainName: [options.domain],
            notes: `Auto-provisioned by google-site-setup for ${options.domain}`,
        },
    });
    const containerPath = container.data.path;
    const containerPublicId = container.data.publicId;
    if (!containerPath || !containerPublicId) {
        throw new Error("GTM container creation returned incomplete data (missing path or publicId)");
    }
    console.log(`  Container created: ${containerPublicId}`);
    await delay(GTM_DELAY_MS);
    // 2. Create workspace
    console.log(`  Creating workspace...`);
    const workspace = await tagmanager.accounts.containers.workspaces.create({
        parent: containerPath,
        requestBody: {
            name: "Initial Setup",
            description: "Programmatic GA4 setup via google-site-setup CLI",
        },
    });
    const workspacePath = workspace.data.path;
    if (!workspacePath) {
        throw new Error("GTM workspace creation returned no path");
    }
    await delay(GTM_DELAY_MS);
    // 3. Enable built-in variables
    console.log(`  Enabling built-in variables...`);
    await tagmanager.accounts.containers.workspaces.built_in_variables.create({
        parent: workspacePath,
        type: [...BUILT_IN_VARIABLES],
    });
    await delay(GTM_DELAY_MS);
    // 4. Create All Pages trigger
    console.log(`  Creating All Pages trigger...`);
    const trigger = await tagmanager.accounts.containers.workspaces.triggers.create({
        parent: workspacePath,
        requestBody: makeAllPagesTrigger(),
    });
    const triggerId = trigger.data.triggerId;
    if (!triggerId) {
        throw new Error("GTM trigger creation returned no triggerId");
    }
    await delay(GTM_DELAY_MS);
    // 5. Create Google Tag (GA4)
    console.log(`  Creating Google Tag with ${options.measurementId}...`);
    await tagmanager.accounts.containers.workspaces.tags.create({
        parent: workspacePath,
        requestBody: makeGA4Tag(options.measurementId, [triggerId]),
    });
    await delay(GTM_DELAY_MS);
    // 7. Create version
    console.log(`  Creating container version...`);
    const version = await tagmanager.accounts.containers.workspaces.create_version({
        path: workspacePath,
        requestBody: {
            name: "v1.0 - Initial GA4 Setup",
            notes: `GA4 Measurement ID: ${options.measurementId}`,
        },
    });
    const versionId = version.data.containerVersion?.containerVersionId || "0";
    await delay(GTM_DELAY_MS);
    // 8. Publish
    console.log(`  Publishing container version...`);
    const containerVersionPath = `${containerPath}/versions/${versionId}`;
    await tagmanager.accounts.containers.versions.publish({
        path: containerVersionPath,
    });
    console.log(`  GTM container published: ${containerPublicId}`);
    // Build snippet
    const containerId = container.data.containerId;
    if (!containerId) {
        throw new Error("GTM container has no containerId");
    }
    const snippet = buildSnippet(containerPublicId);
    return {
        containerId,
        containerPublicId,
        containerName: options.displayName,
        versionId,
        snippet,
        skipped: false,
    };
}
function buildSnippet(publicId) {
    return {
        head: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${publicId}');</script>
<!-- End Google Tag Manager -->`,
        body: `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${publicId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
    };
}
async function findExistingContainer(tagmanager, accountPath, domain) {
    try {
        const res = await tagmanager.accounts.containers.list({
            parent: accountPath,
        });
        const containers = res.data.container || [];
        for (const c of containers) {
            const domains = c.domainName || [];
            const nameMatch = c.name?.toLowerCase() === domain.toLowerCase();
            const domainMatch = domains.some((d) => d.toLowerCase() === domain.toLowerCase());
            if (nameMatch || domainMatch) {
                const snippet = buildSnippet(c.publicId || "");
                // Try to find the measurement ID from the latest version
                let versionId = "0";
                try {
                    const versions = await tagmanager.accounts.containers.version_headers.list({
                        parent: c.path || "",
                    });
                    const latest = versions.data.containerVersionHeader?.[0];
                    if (latest?.containerVersionId) {
                        versionId = latest.containerVersionId;
                    }
                }
                catch {
                    // ok
                }
                return {
                    containerId: c.containerId || "",
                    containerPublicId: c.publicId || "",
                    containerName: c.name || domain,
                    versionId,
                    snippet,
                };
            }
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Warning: could not check for existing GTM containers: ${msg}`);
        console.log(`  Proceeding with creation (may create duplicates if container already exists)`);
    }
    return null;
}
