export type Service = "ga4" | "gtm" | "gsc" | "siteverification";
export interface ErrorContext {
    service: Service;
    operation: string;
    accountId?: string;
    domain?: string;
    serviceAccountEmail?: string;
}
export interface TranslatedError {
    summary: string;
    fix: string;
    raw: unknown;
    code?: number;
    reason?: string;
}
export declare function translateGoogleError(err: unknown, context: ErrorContext): TranslatedError;
export declare function formatTranslatedError(t: TranslatedError): string;
