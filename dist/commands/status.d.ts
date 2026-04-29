interface StatusOptions {
    json?: boolean;
    fix?: boolean;
}
export declare function statusCommand(domain: string | undefined, opts: StatusOptions): Promise<void>;
export {};
