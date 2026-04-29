function extractApiShape(err) {
    if (err && typeof err === "object") {
        const e = err;
        const code = typeof e.code === "number"
            ? e.code
            : typeof e.status === "number"
                ? e.status
                : undefined;
        const errorsField = e.errors || undefined;
        const responseErrors = (() => {
            const r = e.response;
            const data = r?.data;
            const errBlock = data?.error;
            const arr = errBlock?.errors;
            return Array.isArray(arr)
                ? arr
                : undefined;
        })();
        return {
            code,
            message: typeof e.message === "string" ? e.message : undefined,
            errors: errorsField || responseErrors,
        };
    }
    return {};
}
const SCOPE_HINT_BY_OPERATION = {
    "tagmanager.create_version": "tagmanager.edit.containerversions",
    "tagmanager.publish": "tagmanager.publish",
    "tagmanager.create_container": "tagmanager.edit.containers",
    "tagmanager.create_tag": "tagmanager.edit.containers",
};
export function translateGoogleError(err, context) {
    const shape = extractApiShape(err);
    const code = shape.code;
    const message = shape.message || (err instanceof Error ? err.message : String(err));
    const reason = shape.errors?.[0]?.reason;
    // Service-account-not-in-account on GTM accounts.list/get — operation-gated
    if (context.service === "gtm" && context.operation === "gtm.account_access") {
        const sa = context.serviceAccountEmail || "the service account";
        return {
            summary: `Service account ${sa} has no access to GTM account ${context.accountId ?? "(unknown)"}.`,
            fix: "Add it as Admin in tagmanager.google.com → Admin → User Management, then re-run.",
            raw: err,
            code,
            reason,
        };
    }
    if (context.service === "ga4" && context.operation === "ga4.account_access") {
        const sa = context.serviceAccountEmail || "the service account";
        return {
            summary: `Service account ${sa} has no access to GA4 account ${context.accountId ?? "(unknown)"}.`,
            fix: "Add it as Editor in analytics.google.com → Admin → Account Access Management, then re-run.",
            raw: err,
            code,
            reason,
        };
    }
    // Missing OAuth scope
    if (code === 403 && /insufficient.*scope|scope/i.test(message)) {
        const hint = SCOPE_HINT_BY_OPERATION[context.operation];
        return {
            summary: hint
                ? `Missing OAuth scope ${hint} for ${context.operation}.`
                : `Missing OAuth scope for ${context.operation}.`,
            fix: "Add the scope to your service account's OAuth client (or recreate the key with full scopes), then re-run.",
            raw: err,
            code,
            reason,
        };
    }
    // GSC permission / unverified
    if (context.service === "gsc" &&
        (code === 403 ||
            /sufficient permission|forbidden|user does not have/i.test(message))) {
        return {
            summary: `Search Console site for ${context.domain ?? "this domain"} is not verified yet.`,
            fix: context.domain
                ? `Verify the site (e.g. add the meta tag), then run "google-site-setup status ${context.domain} --fix" to retry.`
                : 'Verify the site, then run "google-site-setup status <domain> --fix" to retry.',
            raw: err,
            code,
            reason,
        };
    }
    // 401: auth not working
    if (code === 401) {
        return {
            summary: "Authentication failed talking to Google.",
            fix: "Check that GOOGLE_SERVICE_ACCOUNT_KEY points to a valid key file and that the system clock is correct.",
            raw: err,
            code,
            reason,
        };
    }
    // Quota
    if (code === 429 || /quota|rate.?limit/i.test(message)) {
        return {
            summary: `Hit a Google API rate/quota limit on ${context.service}.${context.operation}.`,
            fix: "Wait a minute and re-run; GTM in particular is throttled to ~0.25 QPS.",
            raw: err,
            code,
            reason,
        };
    }
    // Default fallthrough — pass the raw message through unchanged
    return {
        summary: `${context.service}.${context.operation} failed: ${message}`,
        fix: "Inspect the raw error below for the underlying cause.",
        raw: err,
        code,
        reason,
    };
}
export function formatTranslatedError(t) {
    return `  ✗ ${t.summary}\n  → ${t.fix}`;
}
