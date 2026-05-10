---
paths:
  - __tests__/**
  - e2e/**
---

# Bun パターンルール

> Bun 1.3.x / Bun Test ランタイム対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **基本構造 + DOM (jsdom) + 環境変数モック + Symbol.dispose + ファイル配置 + コマンド + カバレッジ** — `bun-patterns/test-runner.md`
> - **mock / spyOn / mock.module + Vitest API 禁止表 + 純粋モジュール非モック / 連続呼び出し / mock.calls** — `bun-patterns/mocking.md`
> - **Server Actions 統合テスト（依存差し替え + アクション直呼び）** — `bun-patterns/server-actions-tests.md`

## 禁止事項

1. **`vi.*` API の使用禁止**
   - `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.restoreAllMocks()` は Vitest 専用
   - `bun:test` の `mock()`, `mock.module()`, `spyOn()` を使用（→ `bun-patterns/mocking.md`）

2. **`mock.module()` を import より後に呼ぶことを禁止**
   - TDZ（Temporal Dead Zone）の問題が発生する
   - モック関数定義 → `mock.module()` → `import` の順序を守る

3. **モックのリセット漏れ禁止**
   - テスト間でモック状態が漏れると偽陽性の原因になる
   - `beforeEach` で `mockReset()` または `mockClear()` を呼ぶ

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
   - 実例: 2026-05-10 セッションで unit 3934 pass / integration 22 fail（navigation / homepage-settings の Phase 0 token rename + section schema PortableTextSpan 化追従漏れ）
   - canonical 完遂順: `bun run validate` → `bun run test:unit` → `bun run test:integration` → `bun run build`

## Gotchas

- **`mock.module()` のグローバルスコープ干渉** — 複数テストファイルを同時実行すると、ファイル A の `mock.module("@/shared/lib/foo", ...)` がファイル B の実 import を上書きし、`Export named 'X' not found` エラーやハングを引き起こす。対策: (1) モック対象モジュールの**全 export をモックに含める**（使わない関数もスタブで返す）。(2) `package.json` の `test` スクリプトでディレクトリ別に分離実行（`bun test __tests__/unit/lib && bun test __tests__/unit/api && ...`）。特に `@/shared/db/enums`, `@/shared/lib/errors/server`, `@/shared/lib/crypto`, `@/shared/lib/route-responses`, `@/shared/lib/constants` は複数テストでモックされるため全 export 必須。単独実行（`bun test <file>`）では問題なし
- **`Promise.reject()` が `fireAndForget` テストで "Unhandled error between tests"** — `Promise.reject()` は即座に rejected になり、`fireAndForget` の `.catch()` 登録前に Bun が未処理として検出する場合がある。`queueMicrotask(() => reject(error))` で遅延拒否し、`.catch()` が先に登録されるようにする
- **`bun run test:unit` の exit-code / notification summary は信頼しない** — per-directory `&&` チェーンの末尾バッチだけ pass すると background notification が「exit 0」と表示されるケースがある（2026-05-05 セッションで 28 件 fail を見落とした実例）。fail の真値は `grep -c "^(fail)"` または末尾の `Ran [0-9]+ tests across [0-9]+ files` 直前の `[0-9]+ pass` / `[0-9]+ fail` 行で確認する。bg job では `grep -E "^\(fail\)"` を tail で抽出するパターンが安全
- **`package.json` test バッチの ghost dir は silent fail** — 存在しない `__tests__/...` path をバッチに残すと `bun test` が `333 files were searched / Tests need ".test"...` で exit 1。新規 dir 削除 / rename 時は `test:unit` / `test:integration` script を grep で確認（2026-05-06 `__tests__/unit/domain/terms` ghost で実発生）
- **形骸化 test (`expect(module.fn).toBeDefined()` のみ) は timeout 延長より削除が canonical** — 実装変更を検出しない test は `test-quality.md` 「形骸化テスト禁止」違反。dynamic import が遅い場合（calendar-sync route 18.9s 等）の対処は timeout 延長ではなく削除して本質的な behavior coverage を別途追加する
- **`react.cache()` を `mock.module("react", ...)` で identity 化しても Bun では完全に外れない** — `cache: fn => fn` で置き換えても、`getX = cache(async () => ...)` の戻り値 Promise が複数 test 間で leak し describe block を跨ぐと前 test の値が返る silent bug。**症状**: 単独 (`bun test <file>`) では pass、batch 実行で同 describe 後段が fail。**対処**: 内部に `'use cache'` を持つ helper を呼ぶ場合、外側の `cache()` request-memo は過剰なため**削除**して plain async function 化（cross-request 層で十分、test も clean）。判定: 1 関数内で 2 層キャッシュが入れ子なら外側を削除候補（実例: 2026-05-07 `getEnabledFeatures` で `cache()` 削除、`'use cache'` の内側 `getFeatureModulesSettings` のみ残す形に修正）
- **Bun mock cross-file 汚染の典型診断: 単独 pass / batch fail** — `bun test fileA.ts` 単独で全 pass、`bun test fileA.ts fileB.ts` で fileA の特定 describe block 後半が fail する場合、fileB の `mock.module()` が同 path を上書きして leak している。`grep -rn 'mock.module.*"<path>"' __tests__/` で重複 mock を検出。`bun test __tests__/unit/lib` のような per-dir batch は `package.json test:unit` の **&& chain（順次実行）**だから OK、空白区切りのファイル直接指定は同一 process で contamination する
- **`bun -e "import('@/shared/db/prisma')"` は `server-only` 制約で失敗 / `bun -e "import('@generated/prisma/client')"` は dotenv 未読込で DATABASE_URL 認証エラー** — `bun -e` 経由では `.env.local` 自動読込なし + `server-only` モジュール参照で client component 制約に抵触。dev DB の素朴な count / select 確認は ① `bunx prisma studio` ② 管理画面 UI ③ 既存 Server Action / API route + `curl` のいずれかで行う。MINGW64 環境で `psql` コマンドは不在のため shell 直接 SQL は不可

## 参考

> **詳細リファレンス（モック詳細実装・Bun ランタイム API）**: `docs/reference/bun-test.md`
