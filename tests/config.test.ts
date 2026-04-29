import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Compute TEST_HOME before mocking
const TEST_HOME = join(tmpdir(), `gss-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".google-site-setup");
const SITES_DIR = join(CONFIG_DIR, "sites");

// Mock only homedir, preserve everything else
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

describe("config module", () => {
  let loadGlobalConfig: typeof import("../src/config.js").loadGlobalConfig;
  let saveGlobalConfig: typeof import("../src/config.js").saveGlobalConfig;
  let loadSiteConfig: typeof import("../src/config.js").loadSiteConfig;
  let saveSiteConfig: typeof import("../src/config.js").saveSiteConfig;

  beforeEach(async () => {
    mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();

    const config = await import("../src/config.js");
    loadGlobalConfig = config.loadGlobalConfig;
    saveGlobalConfig = config.saveGlobalConfig;
    loadSiteConfig = config.loadSiteConfig;
    saveSiteConfig = config.saveSiteConfig;
  });

  afterEach(() => {
    try {
      rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {
      // cleanup best effort
    }
  });

  it("returns empty global config when none exists", () => {
    const config = loadGlobalConfig();
    expect(config).toEqual({});
  });

  it("creates config directory on save", () => {
    saveGlobalConfig({
      gaAccountId: "123",
      gtmAccountId: "456",
      serviceAccountEmail: "test@example.iam.gserviceaccount.com",
    });

    expect(existsSync(CONFIG_DIR)).toBe(true);
    const raw = readFileSync(join(CONFIG_DIR, "config.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.gaAccountId).toBe("123");
    expect(parsed.gtmAccountId).toBe("456");
  });

  it("round-trips global config", () => {
    const original = {
      gaAccountId: "111",
      gtmAccountId: "222",
      serviceAccountEmail: "sa@proj.iam.gserviceaccount.com",
      lastValidated: "2026-03-26T00:00:00Z",
    };
    saveGlobalConfig(original);
    const loaded = loadGlobalConfig();
    expect(loaded).toEqual(original);
  });

  it("returns null for non-existent site config", () => {
    const config = loadSiteConfig("nonexistent.com");
    expect(config).toBeNull();
  });

  it("saves and loads site config", () => {
    const siteConfig = {
      domain: "example.com",
      createdAt: "2026-03-26T00:00:00Z",
      updatedAt: "2026-03-26T00:00:00Z",
      ga4: {
        propertyId: "properties/123",
        propertyName: "example.com",
        measurementId: "G-ABC123",
        streamId: "properties/123/dataStreams/456",
        skipped: false,
      },
    };

    saveSiteConfig(siteConfig);

    const loaded = loadSiteConfig("example.com");
    expect(loaded).not.toBeNull();
    expect(loaded!.domain).toBe("example.com");
    expect(loaded!.ga4?.measurementId).toBe("G-ABC123");
  });

  it("updates existing site config preserving fields", () => {
    saveSiteConfig({
      domain: "test.com",
      createdAt: "2026-03-25T00:00:00Z",
      updatedAt: "2026-03-25T00:00:00Z",
      ga4: {
        propertyId: "properties/100",
        propertyName: "test.com",
        measurementId: "G-TEST1",
        streamId: "s1",
        skipped: false,
      },
    });

    const config = loadSiteConfig("test.com")!;
    config.gtm = {
      containerId: "c1",
      containerPublicId: "GTM-XXXX",
      containerName: "test.com",
      versionId: "1",
      snippet: { head: "<script>...</script>", body: "<noscript>...</noscript>" },
      skipped: false,
    };
    saveSiteConfig(config);

    const reloaded = loadSiteConfig("test.com")!;
    expect(reloaded.ga4?.measurementId).toBe("G-TEST1");
    expect(reloaded.gtm?.containerPublicId).toBe("GTM-XXXX");
    expect(reloaded.createdAt).toBe("2026-03-25T00:00:00Z");
    expect(reloaded.updatedAt).not.toBe("2026-03-25T00:00:00Z");
  });

  it("sanitizes domain for filename", () => {
    saveSiteConfig({
      domain: "my-site.example.com",
      createdAt: "2026-03-26T00:00:00Z",
      updatedAt: "2026-03-26T00:00:00Z",
    });

    const loaded = loadSiteConfig("my-site.example.com");
    expect(loaded).not.toBeNull();
    expect(loaded!.domain).toBe("my-site.example.com");
    expect(existsSync(join(SITES_DIR, "my-site.example.com.json"))).toBe(true);
  });
});
