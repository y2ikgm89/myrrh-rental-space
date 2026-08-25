import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

function filePath(path: string): string {
  return join(root, ...path.split("/"));
}

function read(path: string): string {
  return readFileSync(filePath(path), "utf8");
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractCallObject(source: string, callIndex: number): string {
  const openBraceIndex = source.indexOf("{", callIndex);
  if (openBraceIndex < 0) return "";

  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, index + 1);
    }
  }

  return source.slice(openBraceIndex);
}

function namedImportBlock(source: string, modulePath: string): string {
  const escapedModulePath = modulePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escapedModulePath}["']`,
    "u",
  );
  return pattern.exec(source)?.[1] ?? "";
}

describe("admin clean-break dead code boundaries", () => {
  test("admin integration tests must not re-declare schemas inline with z.object", () => {
    // shallow zombie test (production schema を import せず inline 再宣言して
    // safeParse のみ走らせるテスト) は永続化層 0 カバレッジで本物のドリフトを
    // 検知できないため禁止。Server Action を本物呼び出しする integration test、
    // または production schema を import する unit test に置き換えること。
    const dir = filePath("__tests__/integration/actions/admin");
    // 走査根が消えたら**落ちる**。早期 return にすると、ディレクトリの移動や改名で
    // 収集 0 件になり、違反ゼロと区別が付かないまま緑を返す。
    expect(existsSync(dir)).toBe(true);

    const entries = readdirSync(dir).filter((entry) =>
      entry.endsWith(".test.ts"),
    );
    expect(entries.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const entry of entries) {
      const source = readFileSync(join(dir, entry), "utf8");
      if (/\bz\.object\s*\(/.test(source)) {
        offenders.push(entry);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("content managed page editor does not keep builder inserter, legacy section editor, or page-hero editor", () => {
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionInserter.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx",
        ),
      ),
    ).toBe(false);
  });

  test("settings dialog definitions do not keep unused width contracts", () => {
    const typesSource = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/types.ts",
    );
    const postSettings = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx",
    );
    const newsSettings = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/news.tsx",
    );

    expect(typesSource).not.toContain("width:");
    expect(postSettings).not.toContain('width: "default"');
    expect(newsSettings).not.toContain('width: "default"');
  });

  test("shared utils compatibility re-export is removed", () => {
    expect(existsSync(filePath("src/shared/lib/utils.ts"))).toBe(false);
    // form-data.ts はどこからも import されない dead code と判明し
    // Phase B2/B3 でファイルごと削除済み（module-reachability.test.ts 参照）。
    expect(existsSync(filePath("src/shared/lib/form-data.ts"))).toBe(false);

    const utilsTest = read("__tests__/unit/lib/utils.test.ts");
    expect(utilsTest).not.toContain("@/shared/lib/utils");
    expect(utilsTest).not.toContain("@/shared/lib/form-data");
    expect(utilsTest).toContain("@/shared/lib/slug");
  });

  test("shared logger compatibility re-export is removed", () => {
    expect(existsSync(filePath("src/shared/lib/logger.ts"))).toBe(false);

    for (const path of [
      "src/app/sitemap.ts",
      "src/shared/lib/cloudflare.ts",
      "__tests__/unit/lib/logger.test.ts",
    ]) {
      const source = read(path);
      expect(source).not.toContain("@/shared/lib/logger");
      expect(source).toContain("logger-core");
    }
  });

  test("admin password login validation and pages are removed", () => {
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/_shared/lib/validations/auth.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(filePath("src/app/(admin)/admin/(auth)/login/page.tsx")),
    ).toBe(false);
    expect(
      existsSync(
        filePath("src/app/(admin)/admin/(auth)/forgot-password/page.tsx"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath("src/app/(admin)/admin/(auth)/reset-password/page.tsx"),
      ),
    ).toBe(false);
  });

  test("legacy admin Better Auth /api/auth path is not retained in proxy or rate-limit routing", () => {
    for (const path of ["src/proxy.ts", "src/shared/lib/rate-limit.ts"]) {
      expect(read(path)).not.toContain('"/api/auth"');
      expect(read(path)).not.toContain("/api/auth");
    }
  });

  // admin app 全体の fs traverse + regex。pre-push 負荷下で 5s default を超え得るため 30s。
  test("media picker callers declare accept explicitly instead of relying on image compatibility defaults", () => {
    const hookSource = read(
      "src/app/(admin)/admin/(dashboard)/_shared/hooks/use-media-picker.tsx",
    );
    expect(hookSource).not.toContain("旧 useSingleMediaPicker 互換");
    expect(hookSource).not.toContain('accept = "image"');
    expect(hookSource).not.toContain("UseMediaPickerOptions = {}");

    for (const path of [
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/MediaPickerDialog.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/tabs/LibraryTab.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/tabs/UploadTab.tsx",
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/tabs/UrlTab.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain('accept = "image"');
      expect(source).not.toContain("accept?: MediaAcceptType");
    }

    const offenders: string[] = [];
    const callPattern = /\buse(?:Single|Multiple)?MediaPicker\s*\(\s*\{/gu;
    const dialogOffenders: string[] = [];
    const dialogPattern = /<MediaPickerDialog\b[\s\S]*?\/>/gu;
    let mediaPickerCallCandidates = 0;
    let mediaPickerDialogCandidates = 0;
    for (const file of collectSourceFiles(filePath("src/app/(admin)"))) {
      const normalized = relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");

      if (!normalized.endsWith("_shared/hooks/use-media-picker.tsx")) {
        for (const match of source.matchAll(callPattern)) {
          mediaPickerCallCandidates += 1;
          const callSource = extractCallObject(source, match.index ?? 0);
          if (!/\baccept\s*(?::|,)/u.test(callSource)) {
            offenders.push(`${normalized}:${match.index}`);
          }
        }
      }

      if (
        !normalized.endsWith(
          "_shared/components/media-picker/MediaPickerDialog.tsx",
        )
      ) {
        for (const match of source.matchAll(dialogPattern)) {
          mediaPickerDialogCandidates += 1;
          if (!/\baccept=/u.test(match[0])) {
            dialogOffenders.push(`${normalized}:${match.index}`);
          }
        }
      }
    }

    // 判定に届いた候補。matcher が空振りすると offenders も空のまま緑。
    // 実測 24 call / 5 dialog。しきい値は数値リテラル。
    expect(mediaPickerCallCandidates).toBeGreaterThan(10);
    expect(mediaPickerDialogCandidates).toBeGreaterThan(2);
    expect(offenders).toEqual([]);
    expect(dialogOffenders).toEqual([]);
  }, 30000);

  test("admin Input does not keep direct-return compatibility path for inputs without adornments", () => {
    const source = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/ui/input.tsx",
    );

    expect(source).not.toContain("後方互換");
    expect(source).not.toContain("従来通り `<input>` 直接 return");
    expect(source).not.toContain("if (!hasLeading && !hasTrailing) return");
  });

  test("settings Stripe/GCal commands are imported from ownership modules, not compatibility re-exported", () => {
    expect(existsSync(filePath("src/shared/domain/settings/commands.ts"))).toBe(
      false,
    );
    expect(
      existsSync(
        filePath("src/shared/domain/settings/integration-commands.ts"),
      ),
    ).toBe(false);

    const stripeAction = read(
      "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe.ts",
    );
    expect(stripeAction).toContain("@/shared/domain/settings/stripe-commands");
    expect(stripeAction).not.toContain(
      "@/shared/domain/settings/integration-commands",
    );
    expect(stripeAction).not.toContain('@/shared/domain/settings/commands";');

    const calendarAction = read(
      "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts",
    );
    expect(calendarAction).toContain(
      "@/shared/domain/settings/google-calendar-commands",
    );
    expect(calendarAction).not.toContain(
      "@/shared/domain/settings/integration-commands",
    );
    expect(calendarAction).not.toContain('@/shared/domain/settings/commands";');
    const gcalImport = namedImportBlock(
      calendarAction,
      "@/shared/domain/settings/google-calendar-commands",
    );
    for (const gcalCommand of [
      "clearGoogleCalendarServiceAccount",
      "clearGoogleCalendarWebhook",
      "saveGoogleCalendarWebhook",
      "updateEventImportEnabled",
      "updateGoogleCalendarSettings",
      "updateTwoWaySyncSettings",
    ]) {
      expect(gcalImport).toContain(gcalCommand);
    }

    // webhook persistence orchestration は domain 側。lib webhook は API client のみ。
    const calendarWebhookDomain = read(
      "src/shared/domain/settings/google-calendar.ts",
    );
    expect(calendarWebhookDomain).toContain(
      "@/shared/domain/settings/google-calendar-commands",
    );
    expect(calendarWebhookDomain).toContain("saveGoogleCalendarWebhook");
    const calendarWebhookLib = read(
      "src/shared/lib/google-calendar/webhook.ts",
    );
    expect(calendarWebhookLib).not.toContain(
      "@/shared/domain/settings/google-calendar-commands",
    );
    expect(calendarWebhookLib).not.toContain(
      "@/shared/domain/settings/integration-commands",
    );
    // setup 経路は token+channel を原子 save するため、token-only helper は廃止済み。
    // 回帰で復活させないよう、旧シンボル名の残存も禁止する。
    expect(calendarWebhookDomain).not.toContain(
      "saveGoogleCalendarWebhookToken",
    );
    expect(calendarWebhookLib).not.toContain("saveGoogleCalendarWebhookToken");
  });
});
