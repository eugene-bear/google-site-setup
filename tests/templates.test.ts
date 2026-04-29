import { describe, it, expect } from "vitest";
import {
  makeGA4Tag,
  makeAllPagesTrigger,
  makeMeasurementIdVariable,
  BUILT_IN_VARIABLES,
} from "../src/templates/gtm-base.js";

describe("GTM templates", () => {
  describe("makeGA4Tag", () => {
    it("creates a googtag type tag with correct measurement ID", () => {
      const tag = makeGA4Tag("G-ABC123", ["trigger1"]);

      expect(tag.type).toBe("googtag");
      expect(tag.name).toBe("Google Tag - GA4");
      expect(tag.firingTriggerId).toEqual(["trigger1"]);
      expect(tag.tagFiringOption).toBe("ONCE_PER_EVENT");
    });

    it("includes measurement ID in parameters", () => {
      const tag = makeGA4Tag("G-XYZTEST", ["t1"]);

      const tagIdParam = tag.parameter.find(
        (p: any) => p.key === "tagId"
      );
      expect(tagIdParam).toBeDefined();
      expect(tagIdParam!.value).toBe("G-XYZTEST");
      expect(tagIdParam!.type).toBe("TEMPLATE");
    });

    it("configures send_page_view in settings table", () => {
      const tag = makeGA4Tag("G-TEST", ["t1"]);

      const configSettings = tag.parameter.find(
        (p: any) => p.key === "configSettingsTable"
      );
      expect(configSettings).toBeDefined();
      expect(configSettings!.type).toBe("LIST");

      // Verify the send_page_view setting exists in the nested structure
      const list = configSettings!.list as any[];
      expect(list.length).toBeGreaterThan(0);

      const firstMap = list[0].map;
      const parameterEntry = firstMap.find((m: any) => m.key === "parameter");
      expect(parameterEntry?.value).toBe("send_page_view");

      const valueEntry = firstMap.find((m: any) => m.key === "parameterValue");
      expect(valueEntry?.value).toBe("true");
    });

    it("supports multiple trigger IDs", () => {
      const tag = makeGA4Tag("G-MULTI", ["t1", "t2", "t3"]);
      expect(tag.firingTriggerId).toEqual(["t1", "t2", "t3"]);
    });
  });

  describe("makeAllPagesTrigger", () => {
    it("creates a PAGEVIEW trigger named All Pages", () => {
      const trigger = makeAllPagesTrigger();
      expect(trigger.name).toBe("All Pages");
      expect(trigger.type).toBe("PAGEVIEW");
    });
  });

  describe("makeMeasurementIdVariable", () => {
    it("creates a constant variable with the measurement ID", () => {
      const variable = makeMeasurementIdVariable("G-VAR123");

      expect(variable.name).toBe("Const - GA4 Measurement ID");
      expect(variable.type).toBe("c");
      expect(variable.parameter[0].key).toBe("value");
      expect(variable.parameter[0].value).toBe("G-VAR123");
    });
  });

  describe("BUILT_IN_VARIABLES", () => {
    it("includes expected variables", () => {
      expect(BUILT_IN_VARIABLES).toContain("PAGE_URL");
      expect(BUILT_IN_VARIABLES).toContain("PAGE_HOSTNAME");
      expect(BUILT_IN_VARIABLES).toContain("PAGE_PATH");
      expect(BUILT_IN_VARIABLES).toContain("REFERRER");
      expect(BUILT_IN_VARIABLES).toContain("EVENT");
      expect(BUILT_IN_VARIABLES.length).toBe(5);
    });
  });
});
