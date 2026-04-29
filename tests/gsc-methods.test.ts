import { describe, it, expect } from "vitest";
import {
  isSupportedVerificationMethod,
  listSupportedVerificationMethods,
} from "../src/providers/gsc.js";

describe("GSC verification methods", () => {
  it("lists the five supported methods", () => {
    expect(listSupportedVerificationMethods()).toEqual([
      "meta",
      "file",
      "dns",
      "gtm",
      "analytics",
    ]);
  });

  it("accepts each supported method", () => {
    for (const m of ["meta", "file", "dns", "gtm", "analytics"]) {
      expect(isSupportedVerificationMethod(m)).toBe(true);
    }
  });

  it("rejects unknown methods", () => {
    expect(isSupportedVerificationMethod("carrierpigeon")).toBe(false);
    expect(isSupportedVerificationMethod("")).toBe(false);
    expect(isSupportedVerificationMethod("DNS")).toBe(false);
  });
});
