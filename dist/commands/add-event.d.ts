interface AddEventOptions {
    params?: string[];
    ecommerce?: boolean;
    json?: boolean;
}
export declare function addEventCommand(domain: string, eventName: string, opts: AddEventOptions): Promise<void>;
export {};
