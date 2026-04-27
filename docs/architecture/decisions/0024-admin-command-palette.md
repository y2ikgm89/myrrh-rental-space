# 0024. Admin Command Palette with Hybrid Server-Action Search

- Status: Accepted
- Date: 2026-04-27
- Deciders: y2ikgm89

## Context

管理画面の resource 数が 11、admin route 数が 23 を超え、サイドバー走査での到達コストが上昇。
Linear / GitHub / Notion 等で標準化された Cmd+K UX に揃えることで admin 作業効率を改善する必要が生じた。
公式 cmdk ライブラリは導入済み（pages エディタの "/" コマンドで使用中）だが、グローバル Command Palette は未実装。

## Decision

Hybrid 構成 (Option C) を採用:

1. **Recents / Nav / Quick Actions** はサーバ side で計算（layout で fetch）し、static state として cmdk で fuzzy filter
2. **Free-text search** は単一 Server Action `searchAdminResources(query)` が 11 resource を `Promise.allSettled` で並列検索
3. UI primitive は既存 `_shared/components/ui/command.tsx` を流用、新規 Dialog primitive を作らない
4. 既存 Lexical エディタの "/" コマンド（`SlashCommandPlugin`）とは責務分離し、相互依存させない

## Alternatives Considered

- **All-Server Search**: typing 中の RTT が UX を悪化させるため不採用
- **Indexed-Client Search**: bundle サイズと機微情報露出（顧客名・予約詳細）の問題で不採用

## Consequences

### Positive

- typing 開始から first paint まで Linear / GitHub と同等の体感速度
- role-based filtering を server で完結、client bundle に admin 全データを含めない
- 既存 cmdk primitive 流用で新規 dependency ゼロ

### Negative

- 11 resource 並列 query は DB 負荷が増える（後続: index 追加、Cloud SQL slow query log 監視）
- Server Action のレート制限を `formSubmitRateLimiter` 流用とすることで mutation 系と bucket 共有

### Operational

- 監査ログには影響なし（read-only）
- Recents 表示は `AuditLog` を SoT として参照、新規テーブル追加なし

## References

- spec: `docs/superpowers/specs/2026-04-27-admin-command-palette-design.md`
- plan: `docs/superpowers/plans/2026-04-27-admin-command-palette.md`
- 既存 cmdk: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/command.tsx`
