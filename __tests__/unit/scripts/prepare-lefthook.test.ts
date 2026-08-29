import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  declaredHookNames,
  findMissingHooks,
  planLefthookPrepare,
  runPrepareLefthook,
} from "../../../scripts/prepare-lefthook";

const ROOT = process.cwd();

describe("prepare lefthook", () => {
  test("package.json prepare は || true せず script に委譲する", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts?: { prepare?: string } };
    expect(pkg.scripts?.prepare).toBe("bun scripts/prepare-lefthook.ts");
  });

  test("lefthook.yml から hook 名が読める（走査が空振りしていない）", () => {
    const names = declaredHookNames(
      readFileSync(join(ROOT, "lefthook.yml"), "utf8"),
    );
    expect(names.length).toBeGreaterThan(2);
    expect(names).toContain("pre-commit");
  });

  test("jobs を持たない top-level key は hook と見なさない", () => {
    // `colors` のような設定 key を hook 名として拾うと、装着済み判定が
    // 永久に「欠けている」になる。
    expect(
      declaredHookNames("colors: false\npre-push:\n  jobs:\n    - run: x\n"),
    ).toEqual(["pre-push"]);
  });

  test("marker の無いファイルは未装着とみなす", () => {
    const readHook = (name: string): string | null =>
      name === "pre-commit"
        ? '#!/bin/sh\nif [ "$LEFTHOOK" = "0" ]; then exit 0; fi\n'
        : name === "pre-push"
          ? "#!/bin/sh\necho 誰かの手書き hook\n"
          : null;

    expect(
      findMissingHooks({
        names: ["pre-commit", "pre-push", "commit-msg"],
        readHook,
      }),
    ).toEqual(["pre-push", "commit-msg"]);
  });
});

describe("install するかどうかの判定", () => {
  const base = {
    ci: undefined,
    gitEntryExists: true,
    linkedWorktree: false,
    missingHooks: [] as readonly string[],
  };

  test("CI と .git 不在は skip", () => {
    expect(planLefthookPrepare({ ...base, ci: "true" })).toEqual({
      kind: "skip",
      reason: "CI",
    });
    expect(planLefthookPrepare({ ...base, gitEntryExists: false }).kind).toBe(
      "skip",
    );
    // `CI=1` は CI 扱いにしない（`"true"` だけ）。hook が欠けていれば install する。
    expect(
      planLefthookPrepare({ ...base, ci: "1", missingHooks: ["pre-commit"] })
        .kind,
    ).toBe("install");
  });

  test("装着済みなら install しない（bun install を非ゼロで終わらせない）", () => {
    // これが今回の本題。core.hooksPath が設定されていると lefthook install は
    // exit 1 になるが、hook は既に入っている。打たなければ良い。
    expect(planLefthookPrepare(base)).toEqual({
      kind: "skip",
      reason: "hook は装着済み",
    });
  });

  test("欠けていれば main checkout では install する", () => {
    expect(
      planLefthookPrepare({ ...base, missingHooks: ["pre-commit"] }).kind,
    ).toBe("install");
  });

  test("linked worktree では欠けていても install せず落とす", () => {
    // worktree から install すると共有 hook がこの worktree の node_modules を
    // 指すように書き換わる（実測）。使い捨ての worktree を消すと main が壊れる。
    const plan = planLefthookPrepare({
      ...base,
      linkedWorktree: true,
      missingHooks: ["pre-commit"],
    });
    expect(plan.kind).toBe("fail");
    expect(plan.kind === "fail" && plan.reason).toContain("main checkout");
  });

  test("linked worktree でも装着済みなら skip", () => {
    expect(planLefthookPrepare({ ...base, linkedWorktree: true }).kind).toBe(
      "skip",
    );
  });
});

describe("plan の実行", () => {
  const collect = (): { log: (message: string) => void; lines: string[] } => {
    const lines: string[] = [];
    return { log: (message) => lines.push(message), lines };
  };

  test("skip のとき install を呼ばず、理由を出す（無言で通さない）", async () => {
    let called = 0;
    const { log, lines } = collect();
    const result = await runPrepareLefthook({
      plan: { kind: "skip", reason: "hook は装着済み" },
      install: () => {
        called += 1;
        return Promise.resolve(1);
      },
      log,
    });

    expect({ called, result, logged: lines.length }).toEqual({
      called: 0,
      result: 0,
      logged: 1,
    });
  });

  test("fail のとき install を呼ばず 1 を返す", async () => {
    let called = 0;
    const { log, lines } = collect();
    const result = await runPrepareLefthook({
      plan: { kind: "fail", reason: "main checkout で bun install を実行して" },
      install: () => {
        called += 1;
        return Promise.resolve(0);
      },
      log,
    });

    expect({ called, result, logged: lines.length }).toEqual({
      called: 0,
      result: 1,
      logged: 1,
    });
  });

  test("install 失敗を伝播する", async () => {
    const { log } = collect();
    expect(
      await runPrepareLefthook({
        plan: { kind: "install" },
        install: () => Promise.resolve(1),
        log,
      }),
    ).toBe(1);
  });
});
