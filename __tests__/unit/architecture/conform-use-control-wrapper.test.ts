/**
 * Conform custom UI は `src/shared/lib/conform/control.tsx` 経由だけ。
 *
 * `useInputControl` は mount effect で `document.forms.namedItem(formId)` を探し、
 * Radix Portal が children を 1 render 遅らせると form 未登場のまま warn して終わる。
 * 公式代替は `unstable_useControl` + 自前 name carrier。`unstable_` と register bind
 * は wrapper に閉じ、呼び出し側は `useFieldControl` / `HiddenControlInput` /
 * `fields.X.value` だけを使う。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const WRAPPER = join(SRC_ROOT, "shared", "lib", "conform", "control.tsx");

const CONFORM_REACT_IMPORT =
  /import\s*\{[^}]*\}\s*from\s*["']@conform-to\/react(?:\/[^"']+)?["']/gsu;

function conformReactImportClauses(source: string): string[] {
  return [...source.matchAll(CONFORM_REACT_IMPORT)].map(
    (match) => match[0] ?? "",
  );
}

/** `useInputControl` / `useTypedInputControl` の import か。コメントは対象外。 */
export function hasBannedLegacyControlImport(source: string): boolean {
  if (
    /import\s*\{[^}]*\buseTypedInputControl\b[^}]*\}\s*from\s*["'][^"']+["']/su.test(
      source,
    )
  ) {
    return true;
  }
  return conformReactImportClauses(source).some((clause) =>
    /\buseInputControl\b/u.test(clause),
  );
}

/**
 * `useFieldControl(fields.X)` なのに visible 要素が `name={fields.X.name}` を
 * 持つか。hidden carrier 無しだと `change()` が Conform に届かない。
 */
export function visibleNamedFieldControls(source: string): string[] {
  const controlled = new Set<string>();
  for (const match of source.matchAll(
    /useFieldControl\(\s*fields\.([A-Za-z_][\w]*)\s*\)/gu,
  )) {
    const name = match[1];
    if (name) controlled.add(name);
  }

  const namedVisible = new Set<string>();
  for (const match of source.matchAll(
    /name=\{\s*fields\.([A-Za-z_][\w]*)\.name\s*\}/gu,
  )) {
    const name = match[1];
    if (name) namedVisible.add(name);
  }

  return [...controlled].filter((name) => namedVisible.has(name)).sort();
}

/** `@conform-to/react` から `useControl` / `unstable_useControl` を直接 import しているか。 */
export function hasDirectUseControlImport(source: string): boolean {
  return conformReactImportClauses(source).some(
    (clause) =>
      /\bunstable_useControl\b/u.test(clause) || /\buseControl\b/u.test(clause),
  );
}

describe("conform useControl wrapper", () => {
  test("検出できる形・できない形（fixture）", () => {
    expect(
      hasBannedLegacyControlImport(
        'import { useInputControl } from "@conform-to/react";',
      ),
    ).toBe(true);
    expect(
      hasBannedLegacyControlImport(
        'import {\n  useForm,\n  useInputControl,\n} from "@conform-to/react";',
      ),
    ).toBe(true);
    expect(
      hasBannedLegacyControlImport(
        'import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";',
      ),
    ).toBe(true);
    expect(
      hasBannedLegacyControlImport(
        'import { useForm, getInputProps } from "@conform-to/react";',
      ),
    ).toBe(false);
    expect(
      hasBannedLegacyControlImport(
        'import { useFieldControl } from "@/shared/lib/conform/control";',
      ),
    ).toBe(false);
    expect(
      hasBannedLegacyControlImport("// useInputControl is unable to find form"),
    ).toBe(false);

    expect(
      hasDirectUseControlImport(
        'import { unstable_useControl } from "@conform-to/react";',
      ),
    ).toBe(true);
    expect(
      hasDirectUseControlImport(
        'import { useControl } from "@conform-to/react";',
      ),
    ).toBe(true);
    expect(
      hasDirectUseControlImport(
        'import { unstable_useControl as useControl } from "@conform-to/react";',
      ),
    ).toBe(true);
    expect(
      hasDirectUseControlImport('import { useForm } from "@conform-to/react";'),
    ).toBe(false);

    expect(
      visibleNamedFieldControls(
        `const questionControl = useFieldControl(fields.question);
<Input name={fields.question.name} />`,
      ),
    ).toEqual(["question"]);
    expect(
      visibleNamedFieldControls(
        `const questionControl = useFieldControl(fields.question);
<HiddenControlInput field={fields.question} control={questionControl} />
<Input id={fields.question.id} value={questionControl.value ?? ""} />`,
      ),
    ).toEqual([]);
  });

  test("src は useInputControl / useTypedInputControl を import しない", () => {
    expect(existsSync(WRAPPER)).toBe(true);
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain(WRAPPER);

    const offenders = files
      .filter((file) =>
        hasBannedLegacyControlImport(readFileSync(file, "utf-8")),
      )
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  test("unstable_useControl / useControl の直接 import は control.tsx のみ", () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(300);

    const offenders = files
      .filter((file) => file !== WRAPPER)
      .filter((file) => hasDirectUseControlImport(readFileSync(file, "utf-8")))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);

    expect(hasDirectUseControlImport(readFileSync(WRAPPER, "utf-8"))).toBe(
      true,
    );
  });

  test("useFieldControl の visible 要素は name を持たない", () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(300);

    const offenders = files.flatMap((file) => {
      const fields = visibleNamedFieldControls(readFileSync(file, "utf-8"));
      if (fields.length === 0) return [];
      return [`${relative(ROOT, file)}: ${fields.join(", ")}`];
    });
    expect(offenders).toEqual([]);
  });
});
