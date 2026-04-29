import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(process.cwd(), "dist", "index.js");
const run = (args: string) => {
  try {
    return execSync(`node "${CLI}" ${args}`, {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, GOOGLE_SERVICE_ACCOUNT_KEY: undefined },
    });
  } catch (err: any) {
    return err.stdout + err.stderr;
  }
};

describe("CLI", () => {
  describe("--help", () => {
    it("shows top-level help with all commands", () => {
      const output = run("--help");
      expect(output).toContain("google-site-setup");
      expect(output).toContain("provision");
      expect(output).toContain("init");
      expect(output).toContain("status");
      expect(output).toContain("add-owner");
      expect(output).toContain("add-event");
      expect(output).toContain("add-verification");
      expect(output).toContain("setup-conversions");
    });
  });

  describe("--version", () => {
    it("shows version number", () => {
      const output = run("--version");
      expect(output.trim()).toBe("1.2.0");
    });
  });

  describe("provision --help", () => {
    it("shows all provision options", () => {
      const output = run("provision --help");
      expect(output).toContain("--domain");
      expect(output).toContain("--ga-account");
      expect(output).toContain("--gtm-account");
      expect(output).toContain("--sitemap");
      expect(output).toContain("--name");
      expect(output).toContain("--timezone");
      expect(output).toContain("--currency");
      expect(output).toContain("--dry-run");
      expect(output).toContain("--json");
      expect(output).toContain("--verification-method");
      expect(output).toContain("--skip-ga4");
      expect(output).toContain("--skip-gtm");
      expect(output).toContain("--skip-gsc");
      expect(output).toContain("--measurement-id");
    });

    it("shows default values for timezone and currency", () => {
      const output = run("provision --help");
      expect(output).toContain("America/New_York");
      expect(output).toContain("USD");
    });
  });

  describe("provision --domain validation", () => {
    it("requires --domain", () => {
      const output = run("provision");
      expect(output).toContain("--domain");
    });

    it("requires --ga-account when no config exists", () => {
      const output = run("provision --domain test.com");
      expect(output).toContain("--ga-account is required");
    });

    it("requires --gtm-account when no config exists", () => {
      const output = run("provision --domain test.com --ga-account 123");
      expect(output).toContain("--gtm-account is required");
    });
  });

  describe("provision --dry-run", () => {
    it("shows planned actions without making API calls", () => {
      const output = run(
        "provision --domain mysite.com --ga-account 111 --gtm-account 222 --sitemap https://mysite.com/sitemap.xml --dry-run"
      );
      expect(output).toContain("DRY RUN");
      expect(output).toContain("mysite.com");
      expect(output).toContain("111");
      expect(output).toContain("222");
      expect(output).toContain("https://mysite.com/sitemap.xml");
      expect(output).toContain("America/New_York");
      expect(output).toContain("USD");
    });

    it("strips protocol from domain", () => {
      const output = run(
        "provision --domain https://mysite.com/ --ga-account 1 --gtm-account 2 --dry-run"
      );
      expect(output).toContain("mysite.com");
      expect(output).not.toContain("https://mysite.com/");
    });

    it("uses custom display name when --name is provided", () => {
      const output = run(
        'provision --domain test.com --ga-account 1 --gtm-account 2 --name "My Cool Site" --dry-run'
      );
      expect(output).toContain("My Cool Site");
    });

    it("uses custom timezone and currency", () => {
      const output = run(
        "provision --domain test.com --ga-account 1 --gtm-account 2 --timezone Europe/London --currency GBP --dry-run"
      );
      expect(output).toContain("Europe/London");
      expect(output).toContain("GBP");
    });
  });

  describe("status", () => {
    it("shows usage when no domain provided", () => {
      const output = run("status");
      expect(output).toContain("Usage:");
      expect(output).toContain("google-site-setup status <domain>");
    });
  });
});
