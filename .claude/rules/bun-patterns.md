---
paths:
  - __tests__/**
  - e2e/**
  - scripts/**
  - bunfig.toml
  - tsconfig.json
  - package.json
  - prisma/seed.ts
  - prisma.config.ts
---

# Bun パターンルール

> Bun 1.3.x runtime + Bun Test 対応。公式仕様（[bun.com/docs](https://bun.com/docs)）準拠で 2026-05-15 verification 済。

## TypeScript セットアップ（公式推奨）

公式（`bun.com/docs/runtime/typescript`）は `@types/bun` パッケージ + `tsconfig.json#compilerOptions.types` に `"bun"` 指定が canonical:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["node", "bun"],
  },
}
```

```jsonc
// package.json
{
  "devDependencies": {
    "@types/bun": "^1.3.x",
  },
}
```

**禁止**: 旧名 `bun-types` パッケージ（公式 deprecated alias）/ `/// <reference types="bun-types" />` triple-slash directive（`@types/bun` + tsconfig 設定で global に解決済のため不要）。

**`@types/node` との併用**: Bun は Node API 互換 runtime のため両者の型併用 OK。本プロジェクトは Next.js + Node modules 利用のため `["node", "bun"]` の順で両方有効化。

## Bun Runtime API 採用方針（scripts / seed）

`scripts/**` と `prisma/seed.ts` は Bun runtime native API を使う。`node:fs` / `node:child_process` / `dotenv` の Node-style shim は使わない:

| 用途            | Bun native（採用）                                             | Node shim（禁止）                             |
| --------------- | -------------------------------------------------------------- | --------------------------------------------- |
| ファイル読込    | `Bun.file(path).text()` / `Bun.file(path).exists()`            | `node:fs.readFileSync` / `node:fs.existsSync` |
| ファイル書込    | `Bun.write(path, content)`                                     | `node:fs.writeFileSync`                       |
| ファイル探索    | `new Bun.Glob("**/*.ts").scanSync({ cwd })`                    | `node:fs.readdirSync` + 自前再帰              |
| サブプロセス    | `Bun.spawnSync([...], { stdout, stderr, env })` (primary form) | `node:child_process.spawnSync`                |
| 環境変数読込    | `process.env` （Bun が `.env` / `.env.local` を auto-load）    | `dotenv` パッケージ                           |
| argv            | `process.argv.slice(2)`（`Bun.argv` は alias）                 | -                                             |
| TypeScript 実行 | `bun scripts/foo.ts`（拡張子 `.ts` のまま直接実行）            | `tsx` / `ts-node` / `.mjs` への transpile     |

### `Bun.spawnSync` の primary form

公式 docs では **配列引数 + options object** の形式が primary:

```ts
// OK: primary form（配列引数）
const proc = Bun.spawnSync(["bun", "test", file], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env, // 省略時は親プロセスの env を継承
});
proc.success; // boolean — exitCode === 0
proc.exitCode; // number（spawnSync は常に number 返却、null なし）

// secondary form（object 引数）も valid だが、公式 docs example は配列形式が中心
Bun.spawnSync({ cmd: ["bun", "test", file], stdout: "inherit" });
```

### `Bun.Glob.scanSync` の OS-native path separator

`new Bun.Glob(pattern).scanSync({ cwd })` は **OS-native path separator** で結果を返す（Windows = `\`、POSIX = `/`）。`bun test <path>` の引数に渡す場合は POSIX に正規化:

```ts
const glob = new Bun.Glob("**/*.test.ts");
for (const rel of glob.scanSync({ cwd: root })) {
  // Windows: "lib\\crypto.test.ts" → "lib/crypto.test.ts" に正規化
  const posix = rel.replaceAll("\\", "/");
  files.push(`${root}/${posix}`);
}
```

`onlyFiles: true` は default のため明示不要（公式仕様: ScanOptions §`onlyFiles` デフォルト `true`）。`absolute: true` を指定すると絶対パスで返るが、`bun test` 引数では相対パスでも動作するため通常不要。

### `dotenv` 不使用

Bun runtime は **`.env` → `.env.{NODE_ENV}` → `.env.local`** の順で起動時に自動 load する公式仕様（後勝ち、`.env.local` が最優先）。`scripts/*` / `prisma/seed.ts` を **`bun <file>` 経由で起動する限り**、`import "dotenv/config"` は不要。

`prisma.config.ts` も同様で、Prisma CLI を `bunx --bun prisma <cmd>` 経由で呼ぶ前提なら `env("DATABASE_URL")` のみで動作（`bunx --bun` 指定なしだと `prisma` bin の `#!/usr/bin/env node` shebang で Node 起動されて Bun auto-load の恩恵を受けない silent bug の温床 — `package.json` scripts は全 prisma 呼び出しを `bunx --bun prisma` に統一済）。

`Bun.env` / `import.meta.env` は `process.env` の alias（同一オブジェクト）。

### per-file isolation runner（`scripts/run-tests.ts`）

bun:test の `mock.module()` は process-global live binding を残す公式仕様（[Bun docs §Module Mocking](https://bun.com/docs/test/mocks)）。同一 `bun test` 起動で複数 \*.test.ts を走らせると先行 file の mock が後続 file の実 import を上書きする。

`scripts/run-tests.ts` で各 \*.test.ts を独立した `Bun.spawnSync` サブプロセスで順次起動し干渉を物理排除する。実装は Bun native（`Bun.Glob` + `Bun.spawnSync` + `Bun.file`）、TypeScript 直接実行（拡張子 `.ts`）、`scanSync` 同期走査（per-file runner は sync で十分）。

```bash
bun scripts/run-tests.ts __tests__/unit
bun scripts/run-tests.ts __tests__/integration
bun scripts/run-tests.ts __tests__/unit __tests__/integration  # 複数 dir
bun scripts/run-tests.ts __tests__/unit/lib/crypto.test.ts     # 単一 file
```

## bunfig.toml 採用設定

| セクション | キー      | 値                          | 根拠                                    |
| ---------- | --------- | --------------------------- | --------------------------------------- |
| `[test]`   | `preload` | `setup-dom.ts` + `setup.ts` | jsdom + global env mock                 |
| `[test]`   | `root`    | `./__tests__`               | E2E (Playwright) を `bun test` から除外 |
| `[test]`   | `timeout` | `5000`                      | 公式デフォルト（明示）                  |

**不採用**:

- `[run] bun = true`（node → bun symlink）— `bunx --bun prisma` 明示で十分、暗黙の path 書換は思想として避ける
- `[run] noOrphans = true`（Bun 1.3.14+）— Bun 1.3.14 は `@lexical/utils` / `@lexical/selection` の dynamic import 経路で TDZ regression が再現するため、現状 Bun 1.3.13 base に統一しており当機能は採用不可。Lexical / Bun upstream の fix 後に再評価
- `[install] frozenLockfile = true`（global）— CI は `bun install --frozen-lockfile` flag で明示、local の auto-install を阻害しない
- `[test] coverage = true`（global）— per-file isolation runner と lcov 上書きが非互換、単発 `bun test --coverage <file>` で十分

## 禁止事項

1. **`vi.*` API の使用禁止**
   - `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.restoreAllMocks()` は Vitest 専用
   - `bun:test` の `mock()`, `mock.module()`, `spyOn()` を使用（→ `bun-patterns/mocking.md`）

2. **`mock.module()` を import より後に呼ぶことを禁止**
   - TDZ（Temporal Dead Zone）の問題が発生する
   - モック関数定義 → `mock.module()` → `import` の順序を守る

3. **モックのリセット漏れ禁止**
   - テスト間でモック状態が漏れると偽陽性の原因になる
   - `beforeEach` で `mockReset()` または `mockClear()` を呼ぶ、もしくは `using` キーワード

4. **型なしモック関数の使用禁止**
   - `mock()` は型パラメータを明示する: `mock<() => Promise<User | null>>()`
   - 型なしは `never[]` 等の推論ミスを引き起こす

5. **テストの削除・無効化禁止**
   - `test.skip()` / `test.only()` をコミットしない
   - 失敗するテストは原因を調査して修正する

6. **`bunfig.toml [test]` の `conditions` キーは機能しない**
   - Bun はこのキーを無視する
   - `bun test --conditions=react-server` は CLI フラグとして機能するが、React を server build に解決して `createContext`・`useRef` が消えるため `server-only` 対策には**使わない**こと
   - `server-only` 対策は `__tests__/setup.ts` の `mock.module('server-only', () => ({}))` で対処（設定済み）

7. **「Phase 完遂」「test green」宣言前に `test:unit` + `test:integration` 両走必須**
   - unit pass のみで完遂宣言すると integration fixture drift（Portable Text rename / migration 追従 / mock 漏れ等）が silent に残る
   - canonical 完遂順: `bun run validate` → `bun run test:unit` → `bun run test:integration` → `bun run build`

8. **`scripts/**`と`prisma/seed.ts`で`node:fs`/`node:child_process`/`dotenv` 直接 import 禁止\*\*
   - Bun runtime native API（`Bun.file` / `Bun.spawnSync` / `Bun.Glob`）に統一
   - dotenv は Bun の `.env` auto-load と機能重複（`bunx --bun prisma` で CLI も auto-load 経路に統一）

9. **`scripts/*.mjs` 新規作成禁止**
   - Bun は TypeScript を `.ts` 拡張子のまま直接実行可能
   - `.mjs` は Node-shim の名残、`.ts` + TypeScript native types で記述する

10. **`bun-types` パッケージ採用禁止 / `/// <reference types="bun-types" />` 記述禁止**
    - 公式現行推奨は `@types/bun` + tsconfig.json `types: ["node", "bun"]`
    - triple-slash directive は `@types/bun` + tsconfig 設定で global 解決済のため不要

## Gotchas

- **`mock.module()` のグローバルスコープ干渉** — 公式仕様で live binding を残すため、複数テストファイルを同時実行すると、ファイル A の `mock.module("@/shared/lib/foo", ...)` がファイル B の実 import を上書きし、`Export named 'X' not found` エラー / 偽陽性 fail / ハングを引き起こす。**canonical 解決**: `package.json` の `test:unit` / `test:integration` は `scripts/run-tests.ts` 経由で各 \*.test.ts を **独立した bun サブプロセス**で起動する per-file isolation runner（process boundary が module cache を物理分離）。追加防御として ① モック対象モジュールの**全 export をモックに含める** ② `afterEach(() => mock.restore())` で同 file 内 test 間も復元。特に `@/shared/db/enums`, `@/shared/lib/errors/server`, `@/shared/lib/crypto`, `@/shared/lib/route-responses`, `@/shared/lib/constants` は複数テストでモックされるため全 export 必須。詳細 → `bun-patterns/mocking.md` §mock.module の live binding 仕様 / `bun-patterns/test-runner.md` §per-file isolation runner
- **`Bun.Glob.scanSync` は OS-native path separator** — Windows で `\` を返すため、`bun test <path>` 引数化する際は `.replaceAll("\\", "/")` で POSIX 正規化必須。公式 docs §ScanOptions に明記、cross-platform script 設計の必須前処理
- **`Bun.spawnSync` の戻り値型は `SyncSubprocess`** — `success: boolean` / `exitCode: number`（常に number、null なし）/ `stdout: Buffer | undefined` / `stderr: Buffer | undefined` / `signalCode?: string` / `exitedDueToTimeout?: true`。**`Bun.spawn` (async) の戻り値は `Subprocess` で `exitCode: number | null`** — async 完了前は null。両者の型差は公式 docs §spawn API 参照
- **`Promise.reject()` が `fireAndForget` テストで "Unhandled error between tests"** — `Promise.reject()` は即座に rejected になり、`fireAndForget` の `.catch()` 登録前に Bun が未処理として検出する場合がある。`queueMicrotask(() => reject(error))` で遅延拒否し、`.catch()` が先に登録されるようにする
- **`bun run test:unit` の exit-code 判定は `scripts/run-tests.ts` の集計行 + failed file 一覧を読む** — per-file isolation runner は `[run-tests] done: X passed, Y failed in Zs` を末尾出力し、1 件でも fail なら exit 1 を返す。bg job notification の「exit 0」だけ見ると失敗を見落とすため、必ず `tail -10 <output>` で `done:` 行と直後の `failed files:` リストを確認する。個別 file の fail は `grep -E "^\(fail\)"` で旧来通り抽出可能
- **`package.json` test バッチの ghost dir は silent fail** — 存在しない `__tests__/...` path をバッチに残すと `bun test` が `333 files were searched / Tests need ".test"...` で exit 1。新規 dir 削除 / rename 時は `test:unit` / `test:integration` script を grep で確認
- **ローカル Bun 1.3.14 は `@lexical/*` の TDZ regression で Lexical unit テストが local-only fail（CI は pinned Bun で pass）** — `bun run test:unit` で `__tests__/unit/components/editor/lexical/**`（`CoverNode` / `html-to-lexical-json` / `render-editor-state-to-html-client` 等）が `ReferenceError: Cannot access 'HorizontalRuleNode$1' before initialization`（`node_modules/@lexical/react/LexicalHorizontalRuleNode.dev.mjs`）で落ちるのは **Bun 1.3.14 の dynamic import TDZ regression**（§bunfig.toml 採用設定 `noOrphans` 不採用理由と同根、`@lexical/utils` / `@lexical/selection` / `@lexical/react` で再現、プロジェクトは **Bun 1.3.13 base に統一**済）。**Lexical 非依存の変更で発生した失敗かどうか**は ① 単独実行（`bun test <file>`）で pass するか ② CI ログの unit batch が全 pass か で切り分ける（自分の変更が Lexical に無関係なら CI は影響を受けない）。ローカルでフル `test:unit` を緑にしたい場合のみ `bun upgrade --to 1.3.13` で pin に戻す
- **`;` 連結したテスト + build の background 実行は最後のコマンドの exit code しか反映しない** — `bun run test:unit; bun run test:integration; bun run build` を `run_in_background` で流すと、途中の test:unit が fail（exit 1）でも最後の build が exit 0 なら notification は「exit 0」になり失敗を見落とす。各段を `&&` で連結する（fail で短絡 + 全体 exit 1）か、出力の `[run-tests] done:` 行・`===== BUILD =====` 前の `failed files:` を必ず確認する（→ §Gotchas `bun run test:unit` の exit-code 判定）
- **形骸化 test (`expect(module.fn).toBeDefined()` のみ) は timeout 延長より削除が canonical** — 実装変更を検出しない test は `test-quality.md` 「形骸化テスト禁止」違反。dynamic import が遅い場合の対処は timeout 延長ではなく削除して本質的な behavior coverage を別途追加する
- **`react.cache()` を `mock.module("react", ...)` で identity 化しても Bun では完全に外れない** — `cache: fn => fn` で置き換えても、`getX = cache(async () => ...)` の戻り値 Promise が複数 test 間で leak し describe block を跨ぐと前 test の値が返る silent bug。**症状**: 単独 (`bun test <file>`) では pass、batch 実行で同 describe 後段が fail。**対処**: 内部に `'use cache'` を持つ helper を呼ぶ場合、外側の `cache()` request-memo は過剰なため**削除**して plain async function 化（cross-request 層で十分、test も clean）
- **Bun mock cross-file 汚染の典型診断: 単独 pass / batch fail** — `bun test fileA.ts` 単独で全 pass、`bun test fileA.ts fileB.ts` で fileA の特定 describe block 後半が fail する場合、fileB の `mock.module()` が同 path を上書きして leak している。`grep -rn 'mock.module.*"<path>"' __tests__/` で重複 mock を検出。**現プロジェクトは `bun test <空白区切り複数 file>` / `bun test <親ディレクトリ>` を完全禁止**: `bun run test:unit` / `test:integration` は `scripts/run-tests.ts` 経由で各 \*.test.ts を独立 process 起動するため、cross-file 汚染が物理的に発生しない
- **`bun -e "import('@/shared/db/prisma')"` は `server-only` 制約で失敗 / `bun -e "import('@generated/prisma/client')"` は DB 認証エラー** — `bun -e` でも `.env` / `.env.local` は auto-load されるが、`server-only` モジュール参照で client component 制約に抵触。dev DB の素朴な count / select 確認は ① `bunx --bun prisma studio` ② 管理画面 UI ③ 既存 Server Action / API route + `curl` のいずれかで行う。MINGW64 環境で `psql` コマンドは不在のため shell 直接 SQL は不可
- **`prisma <cmd>` 直接呼び出しは Node shebang で起動 → Bun .env auto-load を受けない silent bug** — `prisma generate` を package.json script で書くと PATH 経由で `node_modules/.bin/prisma` を引き、`#!/usr/bin/env node` shebang で Node runtime 起動 → `prisma.config.ts` の `env("DATABASE_URL")` が `Cannot resolve environment variable` で fail。`bunx --bun prisma <cmd>` で必ず Bun runtime 経由起動を強制（`package.json` の `db:*` script 全件統一済）

## 参考

- [Bun 公式 docs](https://bun.com/docs) — Runtime API / Test / Install
- [Bun.spawn / Bun.spawnSync](https://bun.com/docs/api/spawn) — subprocess API（primary form: 配列引数）
- [Bun.file / Bun.write](https://bun.com/docs/api/file-io) — fast file IO、BunFile lazy-loaded
- [Bun.Glob](https://bun.com/docs/api/glob) — Glob 走査、`scanSync` / `scan`、OS-native path separator
- [Bun env auto-load](https://bun.com/docs/runtime/env) — `.env` → `.env.{NODE_ENV}` → `.env.local` の順
- [Bun + TypeScript](https://bun.com/docs/runtime/typescript) — `@types/bun` + tsconfig `types: ["bun"]` が公式推奨
- [bunfig.toml](https://bun.com/docs/runtime/bunfig) — 全セクション spec（[install] / [run] / [test] / [serve] / runtime）
- [Bun Test 公式](https://bun.com/docs/cli/test) — モック / アサーション / Bun ランタイム固有 API
- `.claude/rules/bun-patterns/mocking.md` — mock.module / spyOn / live binding
- `.claude/rules/bun-patterns/test-runner.md` — per-file isolation runner / DOM / Symbol.dispose
