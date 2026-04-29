import type { ServiceAccountKey } from "./types.js";
export declare function loadServiceAccountKey(): ServiceAccountKey;
export declare function getGoogleAuth(): import("google-auth-library").JWT;
export declare function getAnalyticsAdminClient(): import("googleapis").analyticsadmin_v1beta.Analyticsadmin;
export declare function getTagManagerClient(): import("googleapis").tagmanager_v2.Tagmanager;
export declare function getSearchConsoleClient(): import("googleapis").searchconsole_v1.Searchconsole;
export declare function getSiteVerificationClient(): import("googleapis").siteVerification_v1.Siteverification;
