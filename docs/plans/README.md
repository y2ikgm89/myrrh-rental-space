# 実装計画履歴

## 完了した計画

### 002-stripe-payment-settings.md (2026-01-10)

Stripe決済設定 + 画像アップロード統合

**実装内容**:
- 画像アップロード: EditorToolbar.tsx に ImageUploadDialog を統合
- Stripe設定: 決済タブ追加、APIキー暗号化保存、接続テスト機能
- セキュリティ: AES-256-GCM暗号化、XSS対策、ブラウザ拡張対策

**新規ファイル**:
- `src/lib/crypto.ts`
- `src/lib/stripe.ts`
- `src/lib/validations/stripe.ts`
- `src/app/admin/settings/_components/sections/StripeSection.tsx`
- `src/app/admin/settings/_components/tabs/PaymentTab.tsx`

---

### 001-architecture-improvements.md (2026-01-10)

アーキテクチャのベストプラクティス準拠改善

**実装内容**:
- tsconfig.json: target を ES2017 → ES2022 に更新
- globals.css: フォント変数の修正（--font-sans を正しく参照）
- prisma.ts: PostgreSQL Pool の接続設定強化
- layout.tsx: dynamic 設定のコメント明確化

**精査結果**: 総合スコア 4.2/5

---

### settings-tab-refactoring.md (2026-01-09)

設定画面のタブリファクタリング

**実装内容**:
- page.tsx を 773行 → 110行 に削減
- 6タブ構成（一般・事業者・SEO・メール・予約・システム）
- nuqs による URL 状態管理

---

### tiptap-integration.md (2026-01-09)

TipTap エディタの統合

**実装内容**:
- RichTextEditor コンポーネント作成
- EditorToolbar / EditorContent 分離
- BlogForm への統合

---

## 進行中の計画

なし

---

## 未着手の計画

なし
