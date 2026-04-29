import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the auth module so providers don't need real credentials
vi.mock("../src/auth.js", () => {
  const mockAnalyticsAdmin = {
    properties: {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      dataStreams: {
        list: vi.fn(),
        create: vi.fn(),
      },
    },
    accounts: {
      list: vi.fn(),
    },
  };

  const mockTagManager = {
    accounts: {
      containers: {
        list: vi.fn(),
        create: vi.fn(),
        workspaces: {
          create: vi.fn(),
          built_in_variables: { create: vi.fn() },
          triggers: { create: vi.fn() },
          variables: { create: vi.fn() },
          tags: { create: vi.fn() },
          create_version: vi.fn(),
        },
        versions: {
          publish: vi.fn(),
        },
        version_headers: {
          list: vi.fn(),
        },
      },
    },
  };

  const mockSearchConsole = {
    sites: {
      add: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
    },
    sitemaps: {
      submit: vi.fn(),
    },
  };

  const mockSiteVerification = {
    webResource: {
      getToken: vi.fn(),
      insert: vi.fn(),
    },
  };

  return {
    loadServiceAccountKey: vi.fn().mockReturnValue({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "fake-key",
    }),
    getGoogleAuth: vi.fn(),
    getAnalyticsAdminClient: vi.fn().mockReturnValue(mockAnalyticsAdmin),
    getTagManagerClient: vi.fn().mockReturnValue(mockTagManager),
    getSearchConsoleClient: vi.fn().mockReturnValue(mockSearchConsole),
    getSiteVerificationClient: vi.fn().mockReturnValue(mockSiteVerification),
  };
});

import {
  getAnalyticsAdminClient,
  getTagManagerClient,
  getSearchConsoleClient,
  getSiteVerificationClient,
} from "../src/auth.js";

import { provisionGA4 } from "../src/providers/ga4.js";
import { provisionGTM } from "../src/providers/gtm.js";
import { provisionGSC } from "../src/providers/gsc.js";

describe("GA4 provider", () => {
  const admin = getAnalyticsAdminClient() as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-check: provider asserts the configured account is in accounts.list()
    admin.accounts.list.mockResolvedValue({
      data: { accounts: [{ name: "accounts/123" }] },
    });
  });

  it("creates property and data stream when none exist", async () => {
    // No existing properties
    admin.properties.list.mockResolvedValue({ data: { properties: [] } });

    // Create property
    admin.properties.create.mockResolvedValue({
      data: {
        name: "properties/999",
        displayName: "test.com",
      },
    });

    // Create data stream
    admin.properties.dataStreams.create.mockResolvedValue({
      data: {
        name: "properties/999/dataStreams/111",
        webStreamData: {
          measurementId: "G-NEWTEST",
          defaultUri: "https://test.com",
        },
      },
    });

    const result = await provisionGA4({
      accountId: "123",
      domain: "test.com",
      displayName: "test.com",
      timezone: "America/New_York",
      currency: "USD",
    });

    expect(result.skipped).toBe(false);
    expect(result.measurementId).toBe("G-NEWTEST");
    expect(result.propertyId).toBe("properties/999");
    expect(admin.properties.create).toHaveBeenCalledOnce();
    expect(admin.properties.dataStreams.create).toHaveBeenCalledOnce();
  });

  it("skips creation when property with matching domain exists", async () => {
    admin.properties.list.mockResolvedValue({
      data: {
        properties: [
          { name: "properties/existing", displayName: "test.com" },
        ],
      },
    });

    admin.properties.dataStreams.list.mockResolvedValue({
      data: {
        dataStreams: [
          {
            name: "properties/existing/dataStreams/1",
            webStreamData: {
              defaultUri: "https://test.com",
              measurementId: "G-EXISTS",
            },
          },
        ],
      },
    });

    const result = await provisionGA4({
      accountId: "123",
      domain: "test.com",
      displayName: "test.com",
      timezone: "America/New_York",
      currency: "USD",
    });

    expect(result.skipped).toBe(true);
    expect(result.measurementId).toBe("G-EXISTS");
    expect(admin.properties.create).not.toHaveBeenCalled();
  });

  it("matches www variant of domain", async () => {
    admin.properties.list.mockResolvedValue({
      data: {
        properties: [{ name: "properties/p1", displayName: "Site" }],
      },
    });

    admin.properties.dataStreams.list.mockResolvedValue({
      data: {
        dataStreams: [
          {
            name: "properties/p1/dataStreams/1",
            webStreamData: {
              defaultUri: "https://www.test.com",
              measurementId: "G-WWW",
            },
          },
        ],
      },
    });

    const result = await provisionGA4({
      accountId: "123",
      domain: "test.com",
      displayName: "test.com",
      timezone: "UTC",
      currency: "USD",
    });

    expect(result.skipped).toBe(true);
    expect(result.measurementId).toBe("G-WWW");
  });
});

describe("GTM provider", () => {
  const tagmanager = getTagManagerClient() as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-check: provider asserts the configured account is in accounts.list()
    (tagmanager.accounts as any).list = vi.fn().mockResolvedValue({
      data: { account: [{ accountId: "1" }] },
    });
  });

  it("skips creation when container with matching domain exists", async () => {
    tagmanager.accounts.containers.list.mockResolvedValue({
      data: {
        container: [
          {
            path: "accounts/1/containers/99",
            containerId: "99",
            publicId: "GTM-EXISTS",
            name: "test.com",
            domainName: ["test.com"],
          },
        ],
      },
    });

    tagmanager.accounts.containers.version_headers.list.mockResolvedValue({
      data: { containerVersionHeader: [{ containerVersionId: "1" }] },
    });

    const result = await provisionGTM({
      accountId: "1",
      domain: "test.com",
      displayName: "test.com",
      measurementId: "G-TEST",
    });

    expect(result.skipped).toBe(true);
    expect(result.containerPublicId).toBe("GTM-EXISTS");
    expect(tagmanager.accounts.containers.create).not.toHaveBeenCalled();
  });

  it("creates full container pipeline when none exists", async () => {
    tagmanager.accounts.containers.list.mockResolvedValue({
      data: { container: [] },
    });

    tagmanager.accounts.containers.create.mockResolvedValue({
      data: {
        path: "accounts/1/containers/100",
        containerId: "100",
        publicId: "GTM-NEW123",
        name: "newsite.com",
      },
    });

    tagmanager.accounts.containers.workspaces.create.mockResolvedValue({
      data: { path: "accounts/1/containers/100/workspaces/1" },
    });

    tagmanager.accounts.containers.workspaces.built_in_variables.create.mockResolvedValue({});

    tagmanager.accounts.containers.workspaces.triggers.create.mockResolvedValue({
      data: { triggerId: "trigger1" },
    });

    tagmanager.accounts.containers.workspaces.variables.create.mockResolvedValue({});

    tagmanager.accounts.containers.workspaces.tags.create.mockResolvedValue({});

    tagmanager.accounts.containers.workspaces.create_version.mockResolvedValue({
      data: {
        containerVersion: { containerVersionId: "1" },
      },
    });

    tagmanager.accounts.containers.versions.publish.mockResolvedValue({});

    const result = await provisionGTM({
      accountId: "1",
      domain: "newsite.com",
      displayName: "newsite.com",
      measurementId: "G-FRESH",
    });

    expect(result.skipped).toBe(false);
    expect(result.containerPublicId).toBe("GTM-NEW123");
    expect(result.containerId).toBe("100");

    // Verify the full pipeline was executed in order
    expect(tagmanager.accounts.containers.create).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.workspaces.create).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.workspaces.built_in_variables.create).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.workspaces.triggers.create).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.workspaces.tags.create).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.workspaces.create_version).toHaveBeenCalledOnce();
    expect(tagmanager.accounts.containers.versions.publish).toHaveBeenCalledOnce();

    // Verify snippet structure
    expect(result.snippet.head).toContain("GTM-NEW123");
    expect(result.snippet.head).toContain("googletagmanager.com/gtm.js");
    expect(result.snippet.body).toContain("GTM-NEW123");
    expect(result.snippet.body).toContain("noscript");
  }, 60000); // Long timeout because of built-in delays
});

describe("GSC provider", () => {
  const searchconsole = getSearchConsoleClient() as any;
  const siteVerification = getSiteVerificationClient() as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when site is already verified", async () => {
    searchconsole.sites.get.mockResolvedValue({
      data: { permissionLevel: "siteOwner" },
    });
    searchconsole.sitemaps.submit.mockResolvedValue({});

    const result = await provisionGSC({
      domain: "verified.com",
      sitemapUrl: "https://verified.com/sitemap.xml",
    });

    expect(result.skipped).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.sitemapSubmitted).toBe(true);
  });

  it("adds site and gets verification token when not verified", async () => {
    searchconsole.sites.get.mockRejectedValue(new Error("Not found"));
    searchconsole.sites.add.mockResolvedValue({});
    siteVerification.webResource.getToken.mockResolvedValue({
      data: { token: "google-site-verification=abc123def456" },
    });
    siteVerification.webResource.insert.mockRejectedValue(
      new Error("Verification failed")
    );

    const result = await provisionGSC({
      domain: "newsite.com",
      verificationMethod: "dns",
    });

    expect(result.skipped).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.verificationToken).toBe("google-site-verification=abc123def456");
    expect(result.siteUrl).toBe("sc-domain:newsite.com");
    expect(result.verificationMethod).toBe("dns");
  });

  it("submits sitemap when URL is provided and site verifies", async () => {
    searchconsole.sites.get.mockRejectedValue(new Error("Not found"));
    searchconsole.sites.add.mockResolvedValue({});
    siteVerification.webResource.getToken.mockResolvedValue({
      data: { token: "google-site-verification=xyz" },
    });
    // Verification record is already live → insert succeeds → sitemap submits
    siteVerification.webResource.insert.mockResolvedValue({ data: { id: "withmap.com" } });
    searchconsole.sitemaps.submit.mockResolvedValue({});

    const result = await provisionGSC({
      domain: "withmap.com",
      sitemapUrl: "https://withmap.com/sitemap.xml",
      verificationMethod: "dns",
    });

    expect(result.verified).toBe(true);
    expect(result.sitemapSubmitted).toBe(true);
    expect(searchconsole.sitemaps.submit).toHaveBeenCalledWith({
      siteUrl: "sc-domain:withmap.com",
      feedpath: "https://withmap.com/sitemap.xml",
    });
  });

  it("defers sitemap when site is not verified yet", async () => {
    searchconsole.sites.get.mockRejectedValue(new Error("Not found"));
    searchconsole.sites.add.mockResolvedValue({});
    siteVerification.webResource.getToken.mockResolvedValue({
      data: { token: "google-site-verification=zzz" },
    });
    siteVerification.webResource.insert.mockRejectedValue(new Error("not live"));

    const result = await provisionGSC({
      domain: "deferred.com",
      sitemapUrl: "https://deferred.com/sitemap.xml",
      verificationMethod: "meta",
    });

    expect(result.verified).toBe(false);
    expect(result.sitemapSubmitted).toBe(false);
    expect(result.sitemapDeferred).toBe(true);
    expect(result.sitemapPending).toBe("https://deferred.com/sitemap.xml");
    expect(result.followUpCommand).toContain("status deferred.com --fix");
    expect(searchconsole.sitemaps.submit).not.toHaveBeenCalled();
  });

  it("handles sitemap submission failure gracefully", async () => {
    searchconsole.sites.get.mockRejectedValue(new Error("Not found"));
    searchconsole.sites.add.mockResolvedValue({});
    siteVerification.webResource.getToken.mockResolvedValue({
      data: { token: "google-site-verification=xyz" },
    });
    siteVerification.webResource.insert.mockRejectedValue(new Error("fail"));
    searchconsole.sitemaps.submit.mockRejectedValue(new Error("404"));

    const result = await provisionGSC({
      domain: "badsitemap.com",
      sitemapUrl: "https://badsitemap.com/sitemap.xml",
    });

    expect(result.sitemapSubmitted).toBe(false);
  });

  it("verifies successfully when DNS record already exists", async () => {
    searchconsole.sites.get.mockRejectedValue(new Error("Not found"));
    searchconsole.sites.add.mockResolvedValue({});
    siteVerification.webResource.getToken.mockResolvedValue({
      data: { token: "google-site-verification=ready" },
    });
    siteVerification.webResource.insert.mockResolvedValue({
      data: { id: "newsite.com" },
    });

    const result = await provisionGSC({
      domain: "ready.com",
    });

    expect(result.verified).toBe(true);
  });
});
