---
paths:
  - "__tests__/unit/architecture/**"
  - "eslint-rules/**"
---

# gate を書く / 触る

## まず「足すべきか」を判定する

gate は既に大量にある。1 本増やすコストは書く時間ではなく、**以後すべての変更が
通り抜ける関門が 1 つ増えること**。足してよいのは次のどちらかのときだけ:

- 実際に main や本番へ漏れた欠陥がある
- 同じ指摘がレビューで 2 回以上出た

「将来こう間違えるかもしれない」では足さない。1 回きりの間違いは、その場で直す。

## 空振りする gate を書かない

走査して「違反 0 件」を assert する形は、**走査結果が空でも緑になる**。
「調べて違反が無かった」と「調べる対象が 1 つも無かった」を区別できないのが欠陥。

必ず両方を置く:

1. **走査規模の下限** — `expect(files.length).toBeGreaterThan(n)`。
   `toContain(...)` は下限の証明にならない（無関係な文字列でも満たせてしまう）。
   **測るのは走査した集合そのもの**。schema のパース結果や定数の個数を測っても
   「走査が 0 件」を検出できない（監査 A-24 で 4 本が実際にそうなっていた）。
2. **判定の見本（fixture）** — 「落ちるべき書き方」と「落ちてはいけない書き方」を
   両方置く。実装を変異させても落ちない fixture は、fixture ではない。

ESLint の `local/gate-scan-must-not-be-silently-empty` がこれを強制する（適用範囲は
`__tests__/**`。置き場所ではなく形で判定する）。
認識する走査は `readdirSync` / `globSync` / `new Bun.Glob(...).scanSync()` /
`git ls-files` と、`__tests__/helpers/architecture-fs` ・`__tests__/support/tracked-files`
から import した helper。空の assert と見なすのは `toEqual([])` 系に加えて
`expect(x).not.toContain(...)` などの**否定形の包含検査**と、
**走査結果を `test.each` / `describe.each` へ流す形**（0 件ならテストが
1 本も生成されない）も含む。

**しきい値は数値リテラルで書く。** 定数に切り出すと値が読めず、下限が無いものとして
報告される（`expect(files.length).toBeGreaterThan(300)` は通るが、
`toBeGreaterThan(MIN_FILES)` は通らない）。

## 手法の限界を認める

- 静的な grep / 正規表現は**順序**を見られない。チェーン末尾への追記のような
  「順序を含む不変条件」は AST か実行時で見る。
- 正規表現を 2 回広げたら、それは手法が合っていない合図。3 回目に広げず AST へ移す。
- 検査できないことを検査できるように書かない。**粗いなら粗いと docstring に書く**
  ほうが、読む人を誤らせない。

## 免除の入口を増やさない

allowlist を新設しない。免除が要るなら、**対象そのものに理由を書かせる形**にする
（人目に触れる場所に理由が残るため）。入口が 2 つあると、必ず安いほう＝見えないほうが
使われる。既存の例:
`__tests__/unit/architecture/migration-squawk-ignore-is-breaking.test.ts` は
「安全だと散文で主張するだけでは通らない」形にしてある。

## 名前は実在が強制される

散文やコメントから `__tests__/…/*.test.ts` を名指しすると、そのファイルの実在が
機械強制される（tracked file 全体が走査対象。allowlist なし）。
強制: `__tests__/unit/architecture/referenced-gates-exist.test.ts`

## docstring

新しい gate には冒頭に「なぜ / 何を見るか / 直し方」を書く。
落ちた人が最初に読むのはここで、書いていなければ次の人は gate を消しにかかる。
