import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DashboardRoleForE2E = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER";

/**
 * IAP 模擬管理者 (`testUsers.admin.email`) の role を指定値に切り替える。
 *
 * `scripts/e2e/set-admin-role.ts` を spawn する thin wrapper。RBAC 境界の
 * 回帰テストで beforeAll / afterAll から VIEWER ↔ SUPER_ADMIN を swap する用途。
 *
 * NOTE: Setting 同様シングルトン行 (User) を mutate するため、呼び出し元の
 * describe は `test.describe.configure({ mode: "serial" })` で serialize する。
 * 加えて、他ファイルの admin spec と worker 間で並列実行され得るため、
 * afterAll での確実な復元が必須。
 */
export async function setAdminRoleForE2E(
  role: DashboardRoleForE2E,
): Promise<void> {
  const workspaceRoot = path.join(__dirname, "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "set-admin-role.ts",
  );

  await execFileAsync("bun", [scriptPath, role], {
    cwd: workspaceRoot,
    env: process.env,
  });
}
