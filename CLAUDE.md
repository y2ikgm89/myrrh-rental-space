<!--
  維持のしかた（この HTML コメントは context に注入されないので、書いても
  毎セッションの token を消費しない。公式: "Block-level HTML comments in
  CLAUDE.md files are stripped before the content is injected into Claude's
  context"）。

  - 200 行未満を保つ。超えたら追記ではなく `.claude/rules/`（paths でスコープ）か
    `.claude/skills/` へ移す
  - 1 行ごとに「これを消したら Claude は間違えるか？」を問い、No なら消す。
    公式: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"
  - 既に指示なしで正しくできていることは消す。毎回必ず要るなら hook にする
  - 書く前に「これは gate にできないか」を先に考える。できるならそちらへ
  - 検証できない文を書かない（「きれいに書く」ではなく「2 space」）
  - `.claude/rules/` との重複を作らない。両方に書くと片方だけ古くなり、
    矛盾した指示は Claude がどちらかを恣意的に選ぶ
  - 読み込まれたかは `/context` の Memory files で確認できる
  - 設計意図と、意図的に置いていないものの一覧は `.claude/README.md`

  「重複しているから削る」を憶測でやらないこと:

  - 「頼まれたことをやる」「証拠を出す」「破壊的操作は確認する」は Claude Code 組み込みの
    system prompt と内容が重なる。**それでも残す。** subagent は "the agent's own system
    prompt, not the full Claude Code system prompt" で動くが CLAUDE.md は読み込まれる
    （Explore と Plan は除く）。この層だけが subagent まで届く
  - 削ってよいかを確かめる公式の手順は 2 つ。`/doctor` の trim 提案と、実際に挙動が
    変わるかの観察（"test changes by observing whether Claude's behavior actually
    shifts"）。どちらも踏まずに削らない
  - 逆に、散文で「X は存在しない」と書く場面がある（例: `docs/runbooks/` の
    「再暗号化ツールは無い」）。**名前の実在を機械検査する gate をここに当てない** —
    存在しないことを伝える文を消させることになる
-->

# myrrh-rental-space

レンタルスペースの予約サイト。単一の Next.js リポジトリを `APP_SURFACE` で分け、
公開ストアフロントと管理画面の 2 つの Cloud Run サービスとして出荷する。

スタック・セットアップ・コマンド一覧は [`README.md`](README.md)、開発フローは
[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)、運用手順と ADR は
[`docs/README.md`](docs/README.md)。**ここにはそれらから導けないことだけを書く。**

## 規約の正本は gate であって散文ではない

このリポジトリの方針は「守らせたい規約は gate にする」。ハードルールの SSoT は
`eslint.config.mjs` と `__tests__/unit/architecture/` の gate 群で、
CONTRIBUTING はそれを意図的に複製していない（drift 防止）。

- 規約が分からないときは、該当 gate の冒頭 JSDoc を読む。多くの gate は
  「なぜ / 何を見るか / 直し方」を書いている。
- **このファイルにも規約本文を写さない。** 写した瞬間から実装とずれ始める。
  ここに置くのは、gate が無いか、gate では表現できないことだけ。

## 検証

`bun run validate` は **type-check と lint だけ**で、テストを含まない（実行時に
自分でそう表示する。この範囲は
`__tests__/unit/scripts/validate-runner.test.ts` が固定している）。

| いつ                     | 何を走らせるか                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 変更を狭く証明する       | `bun run test -- <file>` / `bun run lint:files -- <paths>`                          |
| commit 前                | `bun run validate`                                                                  |
| PR を出す前              | `bun run validate && bun run build` と、変更範囲のテスト                            |
| CI と同じ入口を踏む      | `bun run lint-format` / `bun run type-check` / `bun run test:all` / `bun run build` |
| 重い E2E / Visual を試す | `gh workflow run ci.yml --ref <branch> -f run_full_ci=true`                         |

- **IMPORTANT: 成功を主張せず、証拠を出す。** 走らせたコマンドとその出力を示す。
  出力を見ていないなら「未検証」と書く。
- **エラーを抑え込まない。** 落ちたら根本原因を直す。握りつぶす・迂回する・条件を
  緩めるのは修正ではない。
- `git push` は lefthook pre-push（type-check + architecture gate 全件）で 80〜110 秒
  かかる。**tool timeout は 300 秒以上**を取る。
- **required check が緑でも、広域 E2E / visual / Lighthouse は走っていない。**
  それらは nightly（schedule）と `run_full_ci=true` の dispatch でしか起動しない。
- 必須 check の一覧は [`.github/branch-protection.json`](.github/branch-protection.json)。
- dev サーバーは人間が所有する。頼まれない限り `bun run dev` を起動も停止もしない。

### 時間を溶かす既知の罠

- `bun run test:unit -- <file>` では絞れない。引数は**追記**されるだけ。単一ファイルは
  `bun run test -- <file>`。
- `bun run db:seed` を単体で叩くと失敗する。`.env.local` の `APP_SURFACE` を seed の
  安全ガードが「デプロイされたプロセス」の印と見るため。ローカル再構築は
  `bun run setup` か `bun run db:reset`。
- `bun run test -- <file>` は Prisma client を作り直さない（`test:unit` /
  `test:integration` / `test:all` は作り直す）。`schema.prisma` を触った直後は先に
  `bun run db:generate`。忘れると古い client のまま緑になり、落ちるのは pre-push。
- `bun run e2e` は既存サーバーを再利用しない。手動起動中の dev サーバーが 3000 を
  占有していると必ず落ちる。
- `bun run format` は引数なしだとリポジトリ全体を書き換える。触ったファイルだけ渡す。
- `ESLINT_SKIP_TYPE_CHECK=1` を自分で付けない。型情報を使う lint が丸ごと無効になる。
  設定してよいのは lefthook pre-commit だけ。
- **ESLint に `--cache` を足さない。** 型情報を使うルールで、**他ファイルの型変化が
  原因の違反を見逃す**（実証: 依存側だけを `Promise` 返しに変えると
  `no-floating-promises` が `--cache` ありで緑・無しで赤）。速度目的でも不可。
- 新しい worktree では先に `bun install`。`.worktreeinclude` が運ぶのは `.env*` /
  `generated/` / `playwright/.auth/` だけで `node_modules` は入らない
  （`postinstall` が prisma generate まで済ませる）。

## 作業の進め方

### スコープ

- **頼まれたことをやる。** 隣接する気になるコードを直さない。設定項目・フラグ・
  オプションを頼まれずに足さない。範囲外で見つけた問題は直さず、PR 本文か会話で
  報告して終わりにする。
- 1 PR = 1 論理変更。目安 300 行 / 10 ファイル。超えるなら分割する。
- 抽象化は 3 回目の重複から。2 回目まではコピーのままでよい。
- 1 つの振る舞いにつきテストは 1 本。網羅は既存の gate と CI の仕事。
  （gate 自体を書くときは別 — 見本は「落ちるべき形」と「落ちてはいけない形」の
  2 本が要る。`.claude/rules/architecture-gates.md`）
- **新しい gate を足すのは、実際に起きた欠陥に対してだけ。** 「将来こう間違えるかも
  しれない」で増やさない。増やすコストは書く時間ではなく、以後すべての変更が
  通り抜ける関門の数。
- **レビューの指摘を全部潰さない。** 人でも subagent でも、指摘を探せと言われた
  レビュアーは健全な実装にも何か見つける。直すのは**正しさか要件に効くもの**だけで、
  残りは任意として報告する。全部追うと、抽象化の層・防御的コード・起こりえない
  ケースのテストが積み上がる。

### 完了の定義

着手前に「何が揃えば終わりか」を 1 度決め、途中で動かさない。既定は次の 3 つだけ:

1. 頼まれた振る舞いが実現している
2. 変更範囲のテストと `bun run validate` が緑（**出力を確認済み**）
3. 既存の gate を 1 つも壊していない

満たしたら**止める**。ついでの改善・追加のテスト・リファクタは、別の依頼として
提案するところまでが仕事。

### 手を止める条件

- 同じ問題を 2 回直して直らない → 3 回目を試さず、何を試して何が起きたかを報告する。
  文脈が失敗した試行で汚れているので、続けるなら `/clear` して、分かったことを
  含めた指示で仕切り直すほうが速い。
- 要件の読み方が 2 通りあり、どちらを取るかで成果物が変わる → 聞く。
- 破壊的な DB 操作、本番に触る操作、10 ファイルを超える一括書き換え
  → 実行前に確認する。

## 緑を偽装しない

**落ちている gate を通すために gate の側を触らない。**

やってはいけないこと:

- テストの `skip` / 削除 / assertion の弱め、allowlist・除外リストへの追記
- `--no-verify` / `LEFTHOOK=0` / `core.hooksPath` の上書き（hook が deny する）
- 素の `bun test`（hook が deny する）
- 走らせていないのに「テストが通った」と書くこと

gate が落ちたら、まず **gate の主張が正しいか**を読んで判定する。

- 主張が正しい → 実装を直す。
- 主張が誤っている → **なぜ誤りかを根拠つきで示してから** gate を直す。
  「通らないから」は根拠ではない。

**免除の入口を増やさない。** このリポジトリは一度
[`scripts/lint-migrations.ts`](scripts/lint-migrations.ts) の allowlist を削除して
いる — 入口が 2 つあると、「SQL に理由を書く（人目に触れる）」より「リストに 1 行
足す（見えない）」ほうが安いので、必ず弱いほうが使われる。

型のエスケープハッチ（`as any` / `@ts-ignore`）はこの repo で実質使われていない。
足すなら 1 行に限定し、理由を隣に書く。

## エージェント設定

置き場・設計意図・意図的に置いていないものは
[`.claude/README.md`](.claude/README.md)。規約を足すときは、まず gate にできないかを
考える。
