/**
 * Base GTM container template.
 * Defines the standard tags, triggers, and built-in variables
 * for a new website with GA4 tracking.
 */
export const BUILT_IN_VARIABLES = [
    "PAGE_URL",
    "PAGE_HOSTNAME",
    "PAGE_PATH",
    "REFERRER",
    "EVENT",
];
export function makeGA4Tag(measurementId, triggerIds) {
    return {
        name: "Google Tag - GA4",
        type: "googtag",
        parameter: [
            {
                type: "TEMPLATE",
                key: "tagId",
                value: measurementId,
            },
            {
                type: "LIST",
                key: "configSettingsTable",
                list: [
                    {
                        type: "MAP",
                        map: [
                            { type: "TEMPLATE", key: "parameter", value: "send_page_view" },
                            { type: "TEMPLATE", key: "parameterValue", value: "true" },
                        ],
                    },
                ],
            },
        ],
        firingTriggerId: triggerIds,
        tagFiringOption: "ONCE_PER_EVENT",
        consentSettings: { consentStatus: "NOT_SET" },
    };
}
export function makeAllPagesTrigger() {
    return {
        name: "All Pages",
        type: "PAGEVIEW",
    };
}
export function makeMeasurementIdVariable(measurementId) {
    return {
        name: "Const - GA4 Measurement ID",
        type: "c",
        parameter: [
            { type: "TEMPLATE", key: "value", value: measurementId },
        ],
    };
}
