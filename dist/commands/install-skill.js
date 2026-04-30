import { installSkill, uninstallSkill, markSkillInstalled } from "../skill-install.js";
export function installSkillCommand() {
    try {
        const { source, target } = installSkill();
        markSkillInstalled();
        console.log(`Installed skill`);
        console.log(`  from: ${source}`);
        console.log(`  to:   ${target}`);
        console.log(`\nClaude Code will pick it up on next start.`);
    }
    catch (err) {
        console.error(`Failed to install skill: ${err.message}`);
        process.exit(1);
    }
}
export function uninstallSkillCommand() {
    const { target, removed } = uninstallSkill();
    if (removed) {
        console.log(`Removed skill at ${target}`);
    }
    else {
        console.log(`No skill installed at ${target}`);
    }
}
