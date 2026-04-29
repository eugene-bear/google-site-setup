import type { GA4Result } from "../types.js";
interface GA4Options {
    accountId: string;
    domain: string;
    displayName: string;
    timezone: string;
    currency: string;
    serviceAccountEmail?: string;
}
export declare function assertGA4AccountAccess(accountId: string, serviceAccountEmail?: string): Promise<void>;
export declare function provisionGA4(options: GA4Options): Promise<GA4Result>;
export {};
