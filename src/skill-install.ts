import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const SKILL_NAME = "google-site-setup";

export function getSkillSourceDir(): string {
  // dist/skill-install.js → ../skill (sibling of dist)
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "skill");
}

export function getSkillTargetDir(): string {
  return join(homedir(), ".claude", "skills", SKILL_NAME);
}

export function isSkillInstalled(): boolean {
  return existsSync(join(getSkillTargetDir(), "SKILL.md"));
}

function copyDirSync(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDirSync(s, d);
    else copyFileSync(s, d);
  }
}

export function installSkill(): { source: string; target: string } {
  const source = getSkillSourceDir();
  const target = getSkillTargetDir();
  if (!existsSync(source)) {
    throw new Error(`Skill source not found at ${source}. Reinstall the package.`);
  }
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  copyDirSync(source, target);
  return { source, target };
}

export function uninstallSkill(): { target: string; removed: boolean } {
  const target = getSkillTargetDir();
  if (!existsSync(target)) return { target, removed: false };
  rmSync(target, { recursive: true, force: true });
  return { target, removed: true };
}

// --- Auto-prompt state (tracked in ~/.google-site-setup/config.json) ---

const PROMPT_FLAG_PATH = join(homedir(), ".google-site-setup", "skill-prompt.json");

interface PromptState {
  declined?: boolean;
  installedAt?: string;
}

function loadPromptState(): PromptState {
  if (!existsSync(PROMPT_FLAG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PROMPT_FLAG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function savePromptState(state: PromptState): void {
  mkdirSync(dirname(PROMPT_FLAG_PATH), { recursive: true });
  writeFileSync(PROMPT_FLAG_PATH, JSON.stringify(state, null, 2) + "\n");
}

export function markSkillDeclined(): void {
  savePromptState({ ...loadPromptState(), declined: true });
}

export function markSkillInstalled(): void {
  savePromptState({ ...loadPromptState(), installedAt: new Date().toISOString(), declined: false });
}

export function shouldAutoPrompt(): boolean {
  if (isSkillInstalled()) return false;
  if (loadPromptState().declined) return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  if (process.argv.includes("--json")) return false;
  // Don't prompt for the skill commands themselves or --help/--version.
  const cmd = process.argv[2];
  if (!cmd || cmd === "install-skill" || cmd === "uninstall-skill") return false;
  if (cmd === "--help" || cmd === "-h" || cmd === "--version" || cmd === "-V") return false;
  return true;
}

export async function autoPromptInstallSkill(): Promise<void> {
  if (!shouldAutoPrompt()) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) =>
    rl.question(
      "Claude Code skill for google-site-setup is not installed.\nInstall it now to ~/.claude/skills/google-site-setup? [Y/n] ",
      resolve
    )
  );
  rl.close();
  const yes = answer.trim() === "" || /^y(es)?$/i.test(answer.trim());
  if (!yes) {
    markSkillDeclined();
    console.log("Skipped. Run `google-site-setup install-skill` later to install.\n");
    return;
  }
  try {
    const { target } = installSkill();
    markSkillInstalled();
    console.log(`Skill installed at ${target}\n`);
  } catch (err) {
    console.error(`Skill install failed: ${(err as Error).message}\n`);
  }
}
