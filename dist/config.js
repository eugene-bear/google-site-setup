import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".google-site-setup");
const SITES_DIR = join(CONFIG_DIR, "sites");
const GLOBAL_CONFIG_PATH = join(CONFIG_DIR, "config.json");
function ensureDirs() {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
    if (!existsSync(SITES_DIR))
        mkdirSync(SITES_DIR, { recursive: true });
}
// --- Global config (account IDs from init) ---
export function loadGlobalConfig() {
    ensureDirs();
    if (!existsSync(GLOBAL_CONFIG_PATH))
        return {};
    try {
        return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveGlobalConfig(config) {
    ensureDirs();
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
// --- Per-site config (provisioning results) ---
function siteConfigPath(domain) {
    const safe = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
    return join(SITES_DIR, `${safe}.json`);
}
export function loadSiteConfig(domain) {
    ensureDirs();
    const path = siteConfigPath(domain);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    }
    catch {
        return null;
    }
}
export function saveSiteConfig(config) {
    ensureDirs();
    config.updatedAt = new Date().toISOString();
    writeFileSync(siteConfigPath(config.domain), JSON.stringify(config, null, 2) + "\n");
}
export function getConfigDir() {
    return CONFIG_DIR;
}
