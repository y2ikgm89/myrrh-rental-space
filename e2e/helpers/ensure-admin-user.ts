import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let ensureAdminUserPromise: Promise<void> | null = null;

async function runEnsureAdminUserScript(): Promise<void> {
  const workspaceRoot = path.join(__dirname, "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "ensure-admin-user.ts",
  );

  await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
}

export async function ensureAdminUser(): Promise<void> {
  if (!ensureAdminUserPromise) {
    ensureAdminUserPromise = runEnsureAdminUserScript();
  }

  try {
    await ensureAdminUserPromise;
  } catch (error) {
    ensureAdminUserPromise = null;
    throw error;
  }
}
