import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return listFiles(fullPath);
    }
    return [fullPath];
  });
}

describe("admin dashboard shell", () => {
  test("layout は通知とブランディングの取得で管理画面シェルをブロックしない", () => {
    const source = readRepoFile("src/app/(admin)/admin/(dashboard)/layout.tsx");

    expect(source).not.toContain("getAdminBrandingSettings");
    expect(source).not.toContain("getUnreadNotificationCount");
    expect(source).not.toContain("getRecentNotifications");
    expect(source).toContain("<Suspense");
  });

  test("通知ポップオーバーはモバイル viewport に収まる幅指定を持つ", () => {
    const source = readRepoFile(
      "src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx",
    );

    expect(source).toContain("w-[calc(100vw-2rem)]");
    expect(source).toContain("max-w-96");
  });

  test("admin の window.open(_blank) は noopener,noreferrer を指定する", () => {
    const adminRoot = join(root, "src/app/(admin)");
    const violations = listFiles(adminRoot)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .flatMap((file) => {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        return lines.flatMap((line, index) => {
          if (!line.includes("window.open")) return [];
          const snippet = lines.slice(index, index + 4).join(" ");
          if (!snippet.includes('"_blank"') && !snippet.includes("'_blank'")) {
            return [];
          }
          if (snippet.includes("noopener,noreferrer")) return [];
          return [`${file}:${String(index + 1)}`];
        });
      });

    expect(violations).toEqual([]);
  });
});
