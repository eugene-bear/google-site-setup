#!/usr/bin/env node

import { Command } from "commander";
import { provisionCommand } from "./commands/provision.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { addOwnerCommand } from "./commands/add-owner.js";
import { addEventCommand } from "./commands/add-event.js";
import { addVerificationCommand } from "./commands/add-verification.js";
import { setupConversionsCommand } from "./commands/setup-conversions.js";
import { installSkillCommand, uninstallSkillCommand } from "./commands/install-skill.js";
import { autoPromptInstallSkill } from "./skill-install.js";

const program = new Command();

program
  .name("google-site-setup")
  .description("Provision GA4, GTM, and Search Console for new websites")
  .version("1.3.0");

program
  .command("provision")
  .description("Create GA4 property, GTM container, and Search Console site")
  .requiredOption("--domain <domain>", "Website domain (e.g. example.com)")
  .option("--ga-account <id>", "Google Analytics account ID")
  .option("--gtm-account <id>", "Google Tag Manager account ID")
  .option("--sitemap <url>", "Sitemap URL to submit to Search Console")
  .option("--name <name>", "Display name for the property/container (defaults to domain)")
  .option("--timezone <tz>", "IANA timezone (reads default from saved config; falls back to America/New_York)")
  .option("--currency <code>", "Currency code (reads default from saved config; falls back to USD)")
  .option("--measurement-id <id>", "Existing GA4 measurement ID (G-XXXX) to use when --skip-ga4 is set")
  .option(
    "--verification-method <method>",
    "GSC verification method: meta, file, dns, gtm, analytics (default: meta)",
    "meta"
  )
  .option("--skip-ga4", "Skip GA4 property creation (requires --measurement-id or saved one)")
  .option("--skip-gtm", "Skip GTM container creation")
  .option("--skip-gsc", "Skip Search Console submission")
  .option("--no-saved-config", "Ignore saved global config; require all values via flags")
  .option("--confirm-saved-config", "Acknowledge that account IDs came from saved config (for non-interactive runs)")
  .option("--dry-run", "Validate inputs and check existing resources without creating anything")
  .option("--json", "Output results as JSON")
  .action(provisionCommand);

program
  .command("init")
  .description("Guided one-time setup: validate service account, save account IDs and defaults")
  .action(initCommand);

program
  .command("status")
  .description("Check provisioning status for a domain")
  .argument("[domain]", "Domain to check (reads from config if omitted)")
  .option("--json", "Output results as JSON")
  .option("--fix", "Auto-verify Search Console and submit any deferred sitemap")
  .action(statusCommand);

program
  .command("add-owner")
  .description("Add a Google account as Search Console verified owner")
  .argument("<domain>", "Domain (e.g. example.com)")
  .argument("<email>", "Google account email to add as owner")
  .action(addOwnerCommand);

program
  .command("add-event")
  .description("Create a GTM custom event trigger with a GA4 event tag")
  .argument("<domain>", "Domain (e.g. example.com)")
  .argument("<event-name>", "dataLayer event name (e.g. form_submit, purchase)")
  .option("--params <params...>", "Custom event parameters to forward (e.g. form_name)")
  .option("--ecommerce", "Enable ecommerce data forwarding (for purchase events)")
  .option("--json", "Output results as JSON")
  .action(addEventCommand);

program
  .command("add-verification")
  .description("Request or retry Search Console verification using a chosen method")
  .argument("<domain>", "Domain (e.g. example.com)")
  .option(
    "--method <method>",
    "Verification method: meta, file, dns, gtm, analytics (default: meta or last-used)"
  )
  .option("--json", "Output results as JSON")
  .action(addVerificationCommand);

program
  .command("setup-conversions")
  .description("Add paused stub tags for Google Ads, Meta Pixel, MS Clarity, LinkedIn")
  .argument("<domain>", "Domain (e.g. example.com)")
  .option(
    "--platforms <list>",
    "Comma-separated platforms: ads,meta,clarity,linkedin (default: all)"
  )
  .option("--json", "Output results as JSON")
  .action(setupConversionsCommand);

program
  .command("install-skill")
  .description("Install the Claude Code skill into ~/.claude/skills/google-site-setup")
  .action(installSkillCommand);

program
  .command("uninstall-skill")
  .description("Remove the Claude Code skill from ~/.claude/skills/google-site-setup")
  .action(uninstallSkillCommand);

await autoPromptInstallSkill();
program.parse();
