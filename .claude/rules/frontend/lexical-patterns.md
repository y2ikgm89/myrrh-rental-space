---
description: Lexical 0.43 エディタパターン — 詳細は sub-file を参照
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical パターン（barrel index）

このファイルは barrel index。各トピックは以下 sub-file で管理:

- [core.md](./lexical/core.md) — 概要・技術スタック・Compiler 対応・アーキテクチャ・Inspector・非制御設計・公式プラグイン一覧
- [nodes.md](./lexical/nodes.md) — NodeState API・単一レベル vs コンポジット・コンポジットアーキテクチャ・新規ノード登録チェックリスト
- [plugins.md](./lexical/plugins.md) — プラグイン実装・ノード挿入・コマンド登録・Node Transforms・状態シリアライゼーション・エラーハンドリング
- [toolbar-layout.md](./lexical/toolbar-layout.md) — Editor レイアウト定数・DraggableBlock・プレースホルダー・Floating Toolbar 責務分離・グループ化操作
- [conventions.md](./lexical/conventions.md) — ファイル命名・HTML互換性・禁止事項 28 項目・Gotchas
