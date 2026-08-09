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
自分でそう表示する）。

| いつ                     | 何を走らせるか                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 変更を狭く証明する       | `bun run test -- <file>` / `bun run lint:files -- <paths>`                          |
| commit 前                | `bun run validate`                                                                  |
| PR を出す前              | `bun run validate && bun run build` と、変更範囲のテスト                            |
| CI と同じ入口を踏む      | `bun run lint-format` / `bun run type-check` / `bun run test:all` / `bun run build` |
| 重い E2E / Visual を試す | `gh workflow run ci.yml --ref <branch> -f run_full_ci=true`                         |

- **「通った」は実コマンドの出力でだけ主張する。** 出力を見ていないなら「未検証」と書く。
- `git push` は lefthook pre-push（type-check + architecture gate 全件）で 80〜110 秒
  かかる。**tool timeout は 300 秒以上**を取る。
- **CI が緑でもテストが走ったとは限らない。** `changes` job が「コード変更なし」と
  判定した PR では、重い step が丸ごと skip されたまま required check は成功になる。
- 必須 check の一覧は [`.github/branch-protection.json`](.github/branch-protection.json)。
- dev サーバーは人間が所有する。頼まれない限り `bun run dev` を起動も停止もしない。

### 時間を溶かす既知の罠

- `bun run test:unit -- <file>` では絞れない。引数は**追記**されるだけ。単一ファイルは
  `bun run test -- <file>`。
- `bun run db:seed` を単体で叩くと失敗する。`.env.local` の `APP_SURFACE` を seed の
  安全ガードが「デプロイされたプロセス」の印と見るため。ローカル再構築は
  `bun run setup` か `bun run db:reset`。
- `bun run db:migrate` には破壊的操作ガードが**無い**（`db:push` / `db:reset` にはある）。
  Prisma CLI の接続先は `DIRECT_URL` が最優先。走らせる前に接続先を確かめる。
- `bun run e2e` は既存サーバーを再利用しない。手動起動中の dev サーバーが 3000 を
  占有していると必ず落ちる。
- `bun run format` は引数なしだとリポジトリ全体を書き換える。触ったファイルだけ渡す。
- `ESLINT_SKIP_TYPE_CHECK=1` を自分で付けない。型情報を使う lint が丸ごと無効になる。
  設定してよいのは lefthook pre-commit だけ。

## 作業の進め方

### スコープ

- **頼まれたことをやる。** 隣接する気になるコードを直さない。抽象化を先取りしない。
  設定項目・フラグ・オプションを頼まれずに足さない。範囲外で見つけた問題は
  **報告**して終わりにする。
- 1 PR = 1 論理変更。目安 300 行 / 10 ファイル。超えるなら分割する。
- 抽象化は 3 回目の重複から。2 回目まではコピーのままでよい。
- 1 つの振る舞いにつきテストは 1 本で足りる。網羅は既存の gate と CI の仕事。
- **新しい gate を足すのは、実際に起きた欠陥に対してだけ。** 「将来こう間違えるかも
  しれない」で増やさない。増やすコストは書く時間ではなく、以後すべての変更が
  通り抜ける関門の数。

### 完了の定義

着手前に「何が揃えば終わりか」を 1 度決め、途中で動かさない。既定は次の 3 つだけ:

1. 頼まれた振る舞いが実現している
2. 変更範囲のテストと `bun run validate` が緑（**出力を確認済み**）
3. 既存の gate を 1 つも壊していない

満たしたら**止める**。ついでの改善・追加のテスト・リファクタは、別の依頼として
提案するところまでが仕事。

### 手を止める条件

- 同じ失敗を 3 回直しても直らない → 何を試して何が起きたかを報告し、指示を仰ぐ。
  4 回目を自分の判断で試さない。
- 要件の読み方が 2 通りあり、どちらを取るかで成果物が変わる → 聞く。
- 破壊的な DB 操作、本番に触る操作、大量ファイルの一括書き換え → 実行前に確認する。

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

## エージェント設定の置き場

| 置き場                  | 中身                                                       |
| ----------------------- | ---------------------------------------------------------- |
| このファイル            | 毎セッション効く事実と規約                                 |
| `.claude/rules/`        | パス限定の規約（該当ファイルを開いたときだけ読み込まれる） |
| `.claude/skills/`       | 手順書（呼ばれたときだけ読み込まれる）                     |
| `.claude/settings.json` | permissions と hook の配線                                 |
| `.claude/hooks/`        | 決定論的な禁止（指示ではなく強制）                         |
| `.claude/README.md`     | 上記の設計意図と、変更するときの注意                       |
