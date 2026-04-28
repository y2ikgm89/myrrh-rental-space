---
description: Server Action パターン（Next.js 16 / "use server" 契約 / 'use cache' / キャッシュ無効化）— 詳細は sub-file を参照
---

# Server Action パターン（barrel index）

> **注**: このファイルは TOC のみ。実体は sub-file が `paths:` で auto-load する。手動参照用。

- [server-actions/export-contract.md](./server-actions/export-contract.md) — `"use server"` export 契約 / Reader 関数は Route Handler が canonical
- [server-actions/use-cache.md](./server-actions/use-cache.md) — 'use cache' パターン / キャッシュ無効化（updateTag / revalidateTag / CACHE_TAGS）
- [server-actions/implementation.md](./server-actions/implementation.md) — `executeAdminMutationResult` / 公開データ取得（safeFetch + toPlainObject）
- [server-actions/prohibitions.md](./server-actions/prohibitions.md) — キャッシュタグ命名規則 / 禁止事項 / ファイル配置 / Gotchas
