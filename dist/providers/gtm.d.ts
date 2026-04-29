import type { GTMResult } from "../types.js";
interface GTMOptions {
    accountId: string;
    domain: string;
    displayName: string;
    measurementId: string;
    serviceAccountEmail?: string;
}
export declare function assertGTMAccountAccess(accountId: string, serviceAccountEmail?: string): Promise<void>;
export declare function provisionGTM(options: GTMOptions): Promise<GTMResult>;
export {};
