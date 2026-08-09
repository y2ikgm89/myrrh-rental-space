---
paths:
  - "__tests__/unit/architecture/**"
  - "__tests__/unit/architecture-boundaries.test.ts"
  - "eslint.config.mjs"
  - "eslint-rules/**"
---

# allowlist と免除の扱い

ゲートの allowlist（`ALLOWLIST` / `*_EXEMPT` / `eslint-disable` /
`-- squawk-ignore`）は、規約そのものより drift しやすい。**規約を守っている
ことの証拠は、規約の側ではなく免除の側に出る。**

## 触るときの手続き

- **allowlist を触る PR は同時 OPEN 1 本まで。** 複数を並行させると、片方の
  マージでもう片方の entry が失効しても誰も気付かない。
- entry を足すときは「**なぜここでは規約が成り立たないのか**」を書く。
  「まだ直していない」は理由にならない。直してから消す。
- entry が今も違反していることを検査する（移行済みの entry を消し忘れると、
  allowlist が「ここは対象外」と主張し続ける）。
- 免除を消す方向にしか動かない ratchet として設計する。件数で固定するのが
  一番安全（増えたら落ちる／減らしたら定数を下げる 1 行が要る）。

## 免除の入口は 1 つに絞る

入口が 2 つあると、必ず**見えない方**が使われる。
migration の squawk 免除でパス allowlist を廃して
`-- squawk-ignore-file <rule>`（SQL 本文に理由が残る）だけにしたのはこの理由。

## ESLint 側

- `reportUnusedDisableDirectives` / `reportUnusedInlineConfigs` は `error`。
  効かなくなった `eslint-disable` は落ちる。
- **ファイル単位の off は `eslint.config.mjs` に理由付きで書く。**
  インラインの `eslint-disable-next-line` は、pre-commit の `--fix` が
  `ESLINT_SKIP_TYPE_CHECK=1`（型付きルール自体を読み込まない）で走るたびに
  「unused disable directive」として自動削除されて安定しない。実際に CI を
  落としたことがある。
- テストダブルの側で本番向けルールを外すのは正当（満たすと検証対象が消える種類）。
  その場合もファイル群を名指しし、理由を config に書く。

## 「除外されている」は安全の証明ではない

テストや gate に理由付きの除外があるとき、それは「なぜ落ちるか」の説明であって
「壊れていない」ことの証明ではない。契約に依存している側を実際に開いて確かめる。

subagent や静的走査が「未使用 / dead」と言ってきたら、削除の前に必ず
`Grep` で再確認する。別ディレクトリのテスト群・runbook 中の言及・
rotation 用の lazy な export を見落としやすい。
