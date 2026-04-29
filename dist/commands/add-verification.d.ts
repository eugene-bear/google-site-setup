interface AddVerificationOptions {
    method?: string;
    json?: boolean;
}
export declare function addVerificationCommand(domain: string, opts: AddVerificationOptions): Promise<void>;
export {};
