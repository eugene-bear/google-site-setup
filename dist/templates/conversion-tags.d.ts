import type { tagmanager_v2 } from "googleapis";
export type ConversionPlatform = "ads" | "meta" | "clarity" | "linkedin";
export declare const ALL_PLATFORMS: ConversionPlatform[];
export interface ConversionTagDefinition {
    name: string;
    notes: string;
    body: tagmanager_v2.Schema$Tag;
}
export declare function getConversionTag(platform: ConversionPlatform): ConversionTagDefinition;
