import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadServiceAccountKey } from "../src/auth.js";

// Mock fs to avoid real file reads
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

// Mock googleapis to avoid real API instantiation
vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: vi.fn() },
    analyticsadmin: vi.fn(),
    tagmanager: vi.fn(),
    webmasters: vi.fn(),
    siteVerification: vi.fn(),
  },
}));

const mockedReadFileSync = vi.mocked(readFileSync);

const VALID_KEY = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  private_key_id: "abc123",
  private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
  client_email: "test@test-project.iam.gserviceaccount.com",
  client_id: "123456789",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

describe("auth - loadServiceAccountKey", () => {
  const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  beforeEach(() => {
    // Reset the module-level cache by re-importing
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
  });

  it("throws when GOOGLE_SERVICE_ACCOUNT_KEY env var is not set", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    // Re-import to get fresh module state
    const { loadServiceAccountKey: freshLoad } = await import("../src/auth.js");

    expect(() => freshLoad()).toThrow("GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set");
  });

  it("throws when key file does not exist", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "/nonexistent/path.json";
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { loadServiceAccountKey: freshLoad } = await import("../src/auth.js");

    expect(() => freshLoad()).toThrow("Cannot read service account key file");
  });

  it("throws when key file is not valid JSON", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "/path/to/bad.json";
    mockedReadFileSync.mockReturnValue("not json {{{");

    const { loadServiceAccountKey: freshLoad } = await import("../src/auth.js");

    expect(() => freshLoad()).toThrow("not valid JSON");
  });

  it("throws when key file is missing required fields", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "/path/to/incomplete.json";
    mockedReadFileSync.mockReturnValue(JSON.stringify({ type: "service_account" }));

    const { loadServiceAccountKey: freshLoad } = await import("../src/auth.js");

    expect(() => freshLoad()).toThrow("missing required fields");
  });

  it("returns parsed key when file is valid", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "/path/to/valid.json";
    mockedReadFileSync.mockReturnValue(VALID_KEY);

    const { loadServiceAccountKey: freshLoad } = await import("../src/auth.js");
    const key = freshLoad();

    expect(key.client_email).toBe("test@test-project.iam.gserviceaccount.com");
    expect(key.project_id).toBe("test-project");
    expect(key.private_key).toContain("BEGIN RSA PRIVATE KEY");
  });
});
