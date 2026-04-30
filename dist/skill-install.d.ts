export declare function getSkillSourceDir(): string;
export declare function getSkillTargetDir(): string;
export declare function isSkillInstalled(): boolean;
export declare function installSkill(): {
    source: string;
    target: string;
};
export declare function uninstallSkill(): {
    target: string;
    removed: boolean;
};
export declare function markSkillDeclined(): void;
export declare function markSkillInstalled(): void;
export declare function shouldAutoPrompt(): boolean;
export declare function autoPromptInstallSkill(): Promise<void>;
