import type { GlobalConfig, SiteConfig } from "./types.js";
export declare function loadGlobalConfig(): GlobalConfig;
export declare function saveGlobalConfig(config: GlobalConfig): void;
export declare function loadSiteConfig(domain: string): SiteConfig | null;
export declare function saveSiteConfig(config: SiteConfig): void;
export declare function getConfigDir(): string;
