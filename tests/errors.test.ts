import { describe, it, expect } from "vitest";
import { translateGoogleError, formatTranslatedError } from "../src/errors.js";

describe("translateGoogleError", () => {
  it("explains GTM account-access failures with the User Management fix", () => {
    const err = new Error("GTM account 9999999 not in accounts.list()");
    const t = translateGoogleError(err, {
      service: "gtm",
      operation: "gtm.account_access",
      accountId: "9999999",
      serviceAccountEmail: "sa@example.iam.gserviceaccount.com",
    });
    expect(t.summary).toContain("9999999");
    expect(t.summary).toContain("sa@example.iam.gserviceaccount.com");
    expect(t.fix).toContain("User Management");
  });

  it("explains GA4 account-access failures with the Account Access Management fix", () => {
    const err = Object.assign(new Error("Not found"), { code: 404 });
    const t = translateGoogleError(err, {
      service: "ga4",
      operation: "ga4.account_access",
      accountId: "12345",
      serviceAccountEmail: "sa@example.iam.gserviceaccount.com",
    });
    expect(t.summary).toContain("12345");
    expect(t.fix).toContain("Account Access Management");
  });

  it("explains GSC permission errors with the verify+status-fix path", () => {
    const err = Object.assign(new Error("User does not have sufficient permission"), {
      code: 403,
    });
    const t = translateGoogleError(err, {
      service: "gsc",
      operation: "gsc.sitemap.submit",
      domain: "example.com",
    });
    expect(t.summary).toContain("not verified");
    expect(t.fix).toContain("status example.com --fix");
  });

  it("flags missing OAuth scopes with the operation hint", () => {
    const err = Object.assign(new Error("Request had insufficient authentication scopes"), {
      code: 403,
    });
    const t = translateGoogleError(err, {
      service: "gtm",
      operation: "tagmanager.create_version",
    });
    expect(t.summary).toContain("scope");
    expect(t.summary).toContain("tagmanager.edit.containerversions");
  });

  it("falls through unknown errors with the raw message preserved", () => {
    const err = new Error("Boom: something else broke");
    const t = translateGoogleError(err, {
      service: "ga4",
      operation: "ga4.something",
    });
    expect(t.summary).toContain("Boom: something else broke");
    expect(t.raw).toBe(err);
  });

  it("formatTranslatedError renders summary + fix on two lines", () => {
    const formatted = formatTranslatedError({
      summary: "X",
      fix: "Do Y",
      raw: null,
    });
    expect(formatted).toContain("✗ X");
    expect(formatted).toContain("→ Do Y");
  });
});
