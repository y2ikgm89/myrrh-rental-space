# 050-colocation-refactor.md (2026-01-19)

Next.js コロケーションパターン統合

## 概要

`src/admin/` と `src/public/` を App Router 配下に移動し、Next.js 公式のコロケーションパターンに準拠した構造に統合。

## 問題点（移行前）

```
src/
├── admin/              # ビジネスロジック（158ファイル）
├── public/             # ビジネスロジック（73ファイル）
└── app/
    ├── (admin)/admin/  # ページルート
    └── (public)/       # ページルート
```

関連ファイルが物理的に離れており、コンテキストの把握が困難だった。

## 移行後の構造

```
src/
├── app/
│   ├── (admin)/admin/
│   │   ├── (auth)/
│   │   └── (dashboard)/
│   │       ├── _shared/           # ← src/admin/ から移動
│   │       │   ├── components/
│   │       │   ├── actions/
│   │       │   ├── hooks/
│   │       │   ├── contexts/
│   │       │   ├── lib/
│   │       │   └── types/
│   │       └── ...
│   │
│   └── (public)/
│       ├── _shared/               # ← src/public/ から移動
│       │   ├── components/
│       │   ├── actions/
│       │   ├── lib/
│       │   └── emails/
│       └── ...
│
└── shared/                        # 変更なし
```

## 完了フェーズ

- Phase 1: 管理画面の `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- Phase 2: 公開ページの `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- Phase 3: 旧ディレクトリ削除・最終ビルド検証
- Phase 4: ドキュメント更新

## 変更ファイル

| ファイル        | 変更内容           |
| --------------- | ------------------ |
| `tsconfig.json` | パスエイリアス更新 |
| `CLAUDE.md`     | 構造セクション更新 |

## パスエイリアス変更

```json
{
  "paths": {
    "@/admin/*": ["./src/app/(admin)/admin/(dashboard)/_shared/*"],
    "@/public/*": ["./src/app/(public)/_shared/*"],
    "@/shared/*": ["./src/shared/*"]
  }
}
```

既存のインポートパス（`@/admin/components/ui` 等）は変更不要。

## 効果

- 関連ファイルが物理的に近接（コロケーション）
- Next.js 公式パターンに準拠
- `_` プレフィックスによりルーティングから除外
- インポートパス変更なし（パスエイリアス維持）

## マイグレーション

不要（ファイル移動のみ）
