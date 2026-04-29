import { getTagManagerClient } from "../auth.js";
import { loadSiteConfig, loadGlobalConfig, saveSiteConfig } from "../config.js";
import type { tagmanager_v2 } from "googleapis";

interface AddEventOptions {
  params?: string[];
  ecommerce?: boolean;
  json?: boolean;
}

// GTM API enforces ~0.25 QPS
const GTM_DELAY_MS = 4500;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function addEventCommand(
  domain: string,
  eventName: string,
  opts: AddEventOptions
) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const globalConfig = loadGlobalConfig();
  const siteConfig = loadSiteConfig(cleanDomain);

  if (!globalConfig.gtmAccountId) {
    console.error('Error: No GTM account ID found. Run "google-site-setup init" first.');
    process.exit(1);
    return;
  }

  if (!siteConfig?.gtm) {
    console.error(
      `Error: No GTM container found for ${cleanDomain}.\n` +
        `Run "google-site-setup provision --domain ${cleanDomain}" first.`
    );
    process.exit(1);
    return;
  }

  if (!siteConfig?.ga4?.measurementId) {
    console.error(
      `Error: No GA4 measurement ID found for ${cleanDomain}.\n` +
        `Run "google-site-setup provision --domain ${cleanDomain}" first.`
    );
    process.exit(1);
    return;
  }

  const measurementId = siteConfig.ga4.measurementId;
  const accountId = globalConfig.gtmAccountId;
  const containerId = siteConfig.gtm.containerId;
  const containerPath = `accounts/${accountId}/containers/${containerId}`;

  console.log(`\nAdding "${eventName}" event tracking to GTM container ${siteConfig.gtm.containerPublicId}...\n`);

  const tagmanager = getTagManagerClient();

  // Find default workspace
  const workspacePath = await getDefaultWorkspace(tagmanager, containerPath);

  // 1. Create custom event trigger
  console.log(`  Creating trigger: CE - ${eventName}...`);
  const trigger = await tagmanager.accounts.containers.workspaces.triggers.create({
    parent: workspacePath,
    requestBody: {
      name: `CE - ${eventName}`,
      type: "customEvent",
      customEventFilter: [
        {
          type: "equals",
          parameter: [
            { type: "template", key: "arg0", value: "{{_event}}" },
            { type: "template", key: "arg1", value: eventName },
          ],
        },
      ],
    },
  });

  const triggerId = trigger.data.triggerId;
  if (!triggerId) throw new Error("Trigger creation returned no triggerId");
  console.log(`  ✓ Trigger created (ID: ${triggerId})`);

  await delay(GTM_DELAY_MS);

  // 2. Create DLV variables for custom params
  const createdVariables: string[] = [];
  if (opts.params) {
    for (const param of opts.params) {
      console.log(`  Creating variable: DLV - ${param}...`);
      try {
        await tagmanager.accounts.containers.workspaces.variables.create({
          parent: workspacePath,
          requestBody: {
            name: `DLV - ${param}`,
            type: "v",
            parameter: [
              { type: "integer", key: "dataLayerVersion", value: "2" },
              { type: "boolean", key: "setDefaultValue", value: "false" },
              { type: "template", key: "name", value: param },
            ],
          },
        });
        createdVariables.push(param);
        console.log(`  ✓ Variable created`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Variable may already exist
        if (msg.includes("already exists")) {
          console.log(`  → Variable already exists, skipping`);
          createdVariables.push(param);
        } else {
          console.log(`  ✗ Warning: ${msg}`);
        }
      }
      await delay(GTM_DELAY_MS);
    }
  }

  // 3. Create ecommerce DLV if needed
  if (opts.ecommerce) {
    console.log(`  Creating variable: DLV - ecommerce...`);
    try {
      await tagmanager.accounts.containers.workspaces.variables.create({
        parent: workspacePath,
        requestBody: {
          name: "DLV - ecommerce",
          type: "v",
          parameter: [
            { type: "integer", key: "dataLayerVersion", value: "2" },
            { type: "boolean", key: "setDefaultValue", value: "false" },
            { type: "template", key: "name", value: "ecommerce" },
          ],
        },
      });
      console.log(`  ✓ Variable created`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log(`  → Variable already exists, skipping`);
      } else {
        console.log(`  ✗ Warning: ${msg}`);
      }
    }
    await delay(GTM_DELAY_MS);
  }

  // 4. Build GA4 event tag
  type Param = tagmanager_v2.Schema$Parameter;
  const tagParams: Param[] = [
    { type: "template", key: "eventName", value: eventName },
    { type: "template", key: "measurementIdOverride", value: measurementId },
    {
      type: "boolean",
      key: "sendEcommerceData",
      value: opts.ecommerce ? "true" : "false",
    },
  ];

  // Add event parameters if any
  if (createdVariables.length > 0) {
    tagParams.push({
      type: "list",
      key: "eventParameters",
      list: createdVariables.map((param): Param => ({
        type: "map",
        map: [
          { type: "template", key: "name", value: param },
          { type: "template", key: "value", value: `{{DLV - ${param}}}` },
        ],
      })),
    });
  }

  console.log(`  Creating tag: GA4 Event - ${formatTagName(eventName)}...`);
  const tag = await tagmanager.accounts.containers.workspaces.tags.create({
    parent: workspacePath,
    requestBody: {
      name: `GA4 Event - ${formatTagName(eventName)}`,
      type: "gaawe",
      parameter: tagParams,
      firingTriggerId: [triggerId],
      tagFiringOption: "oncePerEvent",
    },
  });

  const tagId = tag.data.tagId;
  console.log(`  ✓ Tag created (ID: ${tagId})`);

  await delay(GTM_DELAY_MS);

  // 5. Create version and publish
  console.log(`  Creating container version...`);
  const version =
    await tagmanager.accounts.containers.workspaces.create_version({
      path: workspacePath,
      requestBody: {
        name: `Add ${eventName} event tracking`,
        notes: `Custom event: ${eventName}${opts.ecommerce ? " (with ecommerce data)" : ""}${createdVariables.length > 0 ? `, params: ${createdVariables.join(", ")}` : ""}`,
      },
    });

  const versionId =
    version.data.containerVersion?.containerVersionId || "0";
  console.log(`  ✓ Version created (ID: ${versionId})`);

  await delay(GTM_DELAY_MS);

  console.log(`  Publishing...`);
  await tagmanager.accounts.containers.versions.publish({
    path: `${containerPath}/versions/${versionId}`,
  });
  console.log(`  ✓ Published!\n`);

  // Update site config with new version
  siteConfig.gtm.versionId = versionId;
  saveSiteConfig(siteConfig);

  const result = {
    eventName,
    triggerId,
    tagId,
    versionId,
    variables: createdVariables,
    ecommerce: opts.ecommerce || false,
    measurementId,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`  Summary:`);
    console.log(`    Event:       ${eventName}`);
    console.log(`    Trigger:     CE - ${eventName} (ID: ${triggerId})`);
    console.log(`    Tag:         GA4 Event - ${formatTagName(eventName)} (ID: ${tagId})`);
    if (createdVariables.length > 0) {
      console.log(`    Variables:   ${createdVariables.map((v) => `DLV - ${v}`).join(", ")}`);
    }
    if (opts.ecommerce) {
      console.log(`    Ecommerce:   enabled`);
    }
    console.log(`    Version:     ${versionId} (published)`);
    console.log("");
  }
}

async function getDefaultWorkspace(
  tagmanager: ReturnType<typeof getTagManagerClient>,
  containerPath: string
): Promise<string> {
  const res = await tagmanager.accounts.containers.workspaces.list({
    parent: containerPath,
  });

  const workspaces = res.data.workspace || [];
  // Prefer "Default Workspace", fall back to first
  const defaultWs =
    workspaces.find((w) => w.name === "Default Workspace") || workspaces[0];

  if (!defaultWs?.path) {
    throw new Error(
      "No workspace found in GTM container. The container may be in an unexpected state."
    );
  }

  return defaultWs.path;
}

function formatTagName(eventName: string): string {
  return eventName
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
