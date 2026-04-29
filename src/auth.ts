import { readFileSync } from "node:fs";
import { google } from "googleapis";
import type { ServiceAccountKey } from "./types.js";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/tagmanager.manage.accounts",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/siteverification",
];

let cachedKeyPath: string | null = null;
let cachedKey: ServiceAccountKey | null = null;

function getKeyPath(): string {
  if (cachedKeyPath) return cachedKeyPath;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.\n" +
        "Set it to the path of your service account JSON key file.\n" +
        'Run "google-site-setup init" for setup instructions.'
    );
  }
  cachedKeyPath = keyPath;
  return keyPath;
}

export function loadServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;

  const keyPath = getKeyPath();
  let raw: string;
  try {
    raw = readFileSync(keyPath, "utf-8");
  } catch {
    throw new Error(
      `Cannot read service account key file at: ${keyPath}\n` +
        "Make sure the file exists and is readable."
    );
  }

  let key: ServiceAccountKey;
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error(
      `Service account key file is not valid JSON: ${keyPath}`
    );
  }

  if (!key.client_email || !key.private_key) {
    throw new Error(
      `Service account key file is missing required fields (client_email, private_key): ${keyPath}`
    );
  }

  cachedKey = key;
  return key;
}

export function getGoogleAuth() {
  const key = loadServiceAccountKey();
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
}

export function getAnalyticsAdminClient() {
  const auth = getGoogleAuth();
  return google.analyticsadmin({ version: "v1beta", auth });
}

export function getTagManagerClient() {
  const auth = getGoogleAuth();
  return google.tagmanager({ version: "v2", auth });
}

export function getSearchConsoleClient() {
  const auth = getGoogleAuth();
  return google.searchconsole({ version: "v1", auth });
}

export function getSiteVerificationClient() {
  const auth = getGoogleAuth();
  return google.siteVerification({ version: "v1", auth });
}
