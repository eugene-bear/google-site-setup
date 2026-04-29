/**
 * Base GTM container template.
 * Defines the standard tags, triggers, and built-in variables
 * for a new website with GA4 tracking.
 */
export declare const BUILT_IN_VARIABLES: readonly ["PAGE_URL", "PAGE_HOSTNAME", "PAGE_PATH", "REFERRER", "EVENT"];
export declare function makeGA4Tag(measurementId: string, triggerIds: string[]): {
    name: string;
    type: string;
    parameter: ({
        type: string;
        key: string;
        value: string;
        list?: undefined;
    } | {
        type: string;
        key: string;
        list: {
            type: string;
            map: {
                type: string;
                key: string;
                value: string;
            }[];
        }[];
        value?: undefined;
    })[];
    firingTriggerId: string[];
    tagFiringOption: string;
    consentSettings: {
        consentStatus: string;
    };
};
export declare function makeAllPagesTrigger(): {
    name: string;
    type: string;
};
export declare function makeMeasurementIdVariable(measurementId: string): {
    name: string;
    type: string;
    parameter: {
        type: string;
        key: string;
        value: string;
    }[];
};
