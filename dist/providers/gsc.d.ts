import type { GSCResult, VerificationMethod } from "../types.js";
interface GSCOptions {
    domain: string;
    sitemapUrl?: string;
    verificationMethod?: VerificationMethod;
}
export declare function isSupportedVerificationMethod(v: string): v is VerificationMethod;
export declare function listSupportedVerificationMethods(): VerificationMethod[];
export declare function provisionGSC(options: GSCOptions): Promise<GSCResult>;
export {};
