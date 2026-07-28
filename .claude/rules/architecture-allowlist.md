---
paths:
  [
    "__tests__/unit/architecture-boundaries.test.ts",
    "__tests__/unit/architecture/**",
  ]
---

# architecture allowlist 並列 PR

`__tests__/unit/architecture-boundaries.test.ts` の ratchet allowlist
（特に `LIB_TO_DOMAIN_IMPORT_ALLOWLIST`）は **単一の配列リテラル** のため、
複数 PR が同時に行を削除すると merge のたびに `DIRTY` / `CONFLICTING` になる。

## 並列ルール

- **allowlist 行を増減する PR は同時に OPEN 1 本まで**。次の allowlist PR は
  前 PR が main に merge されてから切る
- 並列してよいのは allowlist を触らない変更だけ（例: domain 内のファイル分割、
  pure helper の移動で allowlist 行が変わらないもの）
- lib→domain 解消を複数 seam で進めたいときも、allowlist 編集は **直列**。
  実装 worktree を先に用意しても、push / PR 作成は前件 merge 後に行う

## 競合が起きたときの解消

1. 対象 branch で `git fetch origin main && git merge origin/main`
2. allowlist は **削除の union**（両側で消した行をすべて消す）。cleared 済み行を
   復活させない
3. 実装側の import は「この PR の意図」と「main の新しい正規 path」を両立させる
   （例: domain dispatch + 別 PR で移った maintenance / turnstile inject）
4. rematch 後に `architecture-boundaries` + `bun run validate`、push、auto-merge 継続

## 恒久 adapter（解消対象外）

`LIB_TO_DOMAIN_IMPORT_ALLOWLIST` の一部は「未移行の借り」ではなく **framework
lifecycle の正規 composition** として残す:

| エントリ           | 理由                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer-auth.ts` | Better Auth 公式は `deleteUser.beforeDelete` 等を `betterAuth()` config 内に置く。domain（anonymize / email dispatch）呼び出しは config 縁で行うのが正しい。BA 工場を domain に移すと framework adapter が domain を汚染する |

解消 PR を書くときは上記以外の行だけを削除対象にする。`customer-auth.ts` を
allowlist から外すために DI shim や互換 re-export を足さない（clean-break 禁止）。

## 将来の構造改善（任意）

衝突頻度が高いなら、allowlist を 1 行 1 エントリのテキスト / 1 ファイル 1 エントリに
分離すると git merge が自動解決しやすくなる。それまでは上記の直列運用を守る。
