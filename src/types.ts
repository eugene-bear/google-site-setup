export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

export interface GA4Result {
  propertyId: string;
  propertyName: string;
  measurementId: string;
  streamId: string;
  skipped: boolean;
}

export interface GTMResult {
  containerId: string;
  containerPublicId: string;
  containerName: string;
  versionId: string;
  snippet: {
    head: string;
    body: string;
  };
  skipped: boolean;
}

export type VerificationMethod = "meta" | "file" | "dns" | "gtm" | "analytics";

export interface GSCResult {
  siteUrl: string;
  verified: boolean;
  verificationToken?: string;
  verificationMethod?: VerificationMethod;
  verificationInstructions?: string;
  sitemapSubmitted: boolean;
  sitemapDeferred?: boolean;
  sitemapPending?: string;
  followUpCommand?: string;
  skipped: boolean;
}

export interface ProvisionResult {
  domain: string;
  timestamp: string;
  ga4: GA4Result | null;
  gtm: GTMResult | null;
  gsc: GSCResult | null;
  accountIdSource?: {
    ga4: "flag" | "config" | "none";
    gtm: "flag" | "config" | "none";
  };
}

export interface SiteConfig {
  domain: string;
  createdAt: string;
  updatedAt: string;
  ga4?: GA4Result;
  gtm?: GTMResult;
  gsc?: GSCResult;
}

export interface GlobalConfig {
  gaAccountId?: string;
  gtmAccountId?: string;
  serviceAccountEmail?: string;
  defaultTimezone?: string;
  defaultCurrency?: string;
  lastValidated?: string;
}

export interface ProvisionOptions {
  domain: string;
  gaAccount?: string;
  gtmAccount?: string;
  sitemap?: string;
  name?: string;
  timezone?: string;
  currency?: string;
  measurementId?: string;
  verificationMethod?: VerificationMethod;
  skipGa4?: boolean;
  skipGtm?: boolean;
  skipGsc?: boolean;
  noSavedConfig?: boolean;
  confirmSavedConfig?: boolean;
  dryRun?: boolean;
  json?: boolean;
}
