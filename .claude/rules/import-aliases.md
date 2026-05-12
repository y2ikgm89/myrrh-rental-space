---
description: Import alias 規約 — 内部モジュールの as リネーム禁止、namespace import、barrel export 非推奨、utils.ts 廃止 SSoT
paths:
  - src/**
  - tsconfig.json
---

# Import Alias パターン

- **内部モジュールの `import { X as Y }` 禁止** — 名前衝突は namespace import（`import * as settingsCommands from "..."`）で解決。`settingsCommands.updateTaxSettings()` のように呼び出す
- **許容される alias**: 第三者ライブラリの primitive リネームのみ（`Command as CommandPrimitive`、`Toaster as SonnerToaster`）
- **パススルーラッパー関数禁止** — 何も追加しない `async function X() { return XQuery(); }` は削除。直接 import して使う
- **barrel export の不要な型リネーム禁止** — `export type { FooInput as Foo }` は消費者がいない場合は削除。元の名前でそのまま export する
- **`utils.ts` は非推奨 re-export barrel** — FormData ヘルパーは `@/shared/lib/form-data`、`generateSlug` は `@/shared/lib/slug` が正本。`utils.ts` に新規 import・新関数追加禁止。`cn` は `@/shared/lib/cn`、日付フォーマットは `@/shared/lib/date-format`、`withRetry` は `@/shared/lib/action-helpers`
