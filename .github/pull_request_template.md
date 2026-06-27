<!--
  GitHub PR template: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
-->

## 変更の種類

- [ ] バグ修正（既存機能の修正、動作変更なし）
- [ ] 新機能追加
- [ ] リファクタリング（動作変更なし）
- [ ] パフォーマンス改善
- [ ] ドキュメント更新
- [ ] テスト追加・修正
- [ ] CI / ビルド / ツール設定
- [ ] **破壊的変更（後方互換性なし）**

## 変更の概要

<!-- 何を、なぜ変更したか 2〜3 行で -->

## 関連 Issue / Plan

<!-- Closes #123 -->

## 実装詳細

<!-- 実装上の判断ポイント・トレードオフ・代替案の検討 -->

## スクリーンショット / 動画（UI 変更時）

<!-- before / after を並べて -->

## テスト

- [ ] `bun run validate` が exit 0
- [ ] `bun run build` が exit 0
- [ ] 新規 test を追加した（または既存 test で十分であることを確認）
- [ ] 手動動作確認を完了
- [ ] 関連する既存 test への影響を確認

## チェックリスト

- [ ] `AGENTS.md` / `.agents/skills/` のハードルールに準拠している
- [ ] 新しい SSoT 定数を導入した場合、`AGENTS.md` または該当 repo skill を更新した
- [ ] 破壊的変更がある場合、`CODEOWNERS` の対象 owner レビューを依頼した
- [ ] セキュリティに関わる変更（認証 / 決済 / 暗号化 / API route）がある場合、`security-auditor` subagent でレビュー済み
- [ ] DB 変更がある場合、migration diff を PR description に貼った
- [ ] 環境変数を追加した場合、`src/shared/lib/env/*.ts` を更新した

## デプロイ時の注意

<!-- migration 必須 / env var 追加 / cron 再設定 / cache purge 等 -->

## レビュアーへの補足

<!-- 特に確認してほしい箇所があれば -->
