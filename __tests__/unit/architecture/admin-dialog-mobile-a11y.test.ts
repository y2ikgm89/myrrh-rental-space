import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_UI_ROOT = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_shared",
  "components",
  "ui",
);

const DIALOG_PRIMITIVES = [
  {
    name: "Dialog",
    path: join(ADMIN_UI_ROOT, "dialog.tsx"),
    contentName: "DialogPrimitive.Content",
    footerName: "DialogFooter",
  },
  {
    name: "AlertDialog",
    path: join(ADMIN_UI_ROOT, "alert-dialog.tsx"),
    contentName: "AlertDialogPrimitive.Content",
    footerName: "AlertDialogFooter",
  },
] as const;

function readPrimitive(path: string): string {
  return readFileSync(path, "utf8");
}

describe("admin dialog mobile accessibility contract", () => {
  for (const primitive of DIALOG_PRIMITIVES) {
    test(`${primitive.name} content stays within mobile dynamic viewport and can scroll internally`, () => {
      const { contentName, path } = primitive;
      const source = readPrimitive(path);
      const contentBlock = source.slice(source.indexOf(contentName));

      expect(contentBlock).toContain("w-[calc(100%-2rem)]");
      expect(contentBlock).toContain("max-h-[calc(100dvh-2rem)]");
      expect(contentBlock).toContain("overflow-y-auto");
      expect(contentBlock).toContain("rounded-lg");
      expect(contentBlock).toContain('aria-modal="true"');
      expect(contentBlock).not.toContain("w-full max-w-lg");
    });

    test(`${primitive.name} footer preserves JSX action order on narrow viewports`, () => {
      const { footerName, path } = primitive;
      const source = readPrimitive(path);
      const footerBlock = source.slice(
        source.indexOf(`function ${footerName}`),
      );

      expect(footerBlock).toContain("flex flex-col gap-2");
      expect(footerBlock).toContain("sm:flex-row sm:justify-end");
      expect(footerBlock).not.toContain("flex-col-reverse");
      expect(footerBlock).not.toContain("space-x-2");
    });
  }
});
