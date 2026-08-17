# .claude/

Claude Code のプロジェクト設定。**人間向けの説明**で、セッションには読み込まれない。

## 何がいつ読み込まれるか

| 置き場                   | 読み込み                                     | git      |
| ------------------------ | -------------------------------------------- | -------- |
| `../CLAUDE.md`           | 毎セッション、全文                           | 追跡     |
| `rules/*.md`             | `paths:` に一致するファイルを開いたときだけ  | 追跡     |
| `skills/*/SKILL.md`      | description のみ常時、本文は呼ばれたときだけ | 追跡     |
| `agents/*.md`            | description のみ常時、本文は delegate 時だけ | 追跡     |
| `settings.json`          | 起動時（permissions / hook の配線）          | 追跡     |
| `hooks/*.mjs`            | 該当イベントごとにサブプロセスで実行         | 追跡     |
| `settings.local.json`    | 個人用の上書き。秘密値はここ                 | **無視** |
| `logs/ state/ memory/ …` | ローカル state                               | **無視** |

無視されるパスは `.gitignore` の `.claude/` 節が SSoT。実際に読み込まれたかは
セッション中に `/context` を打ち、**Memory files** の一覧で確認できる。

`CLAUDE.md` のブロック HTML コメント（`<!-- … -->`）は context に注入される前に
除去される。**人間の保守者向けのメモは 200 行の予算を消費しない**ので、維持の
しかたはファイル冒頭のコメントに書いてある。

## なぜファイルが少ないか

この設定は一度、flat → 入れ子 → flat → 全削除、と組み替えを繰り返して壊れている。
組み替えのたびに参照が黙って腐り、最後は「どれが現行か分からない」状態になった。

そこで**置き場を 4 つに固定し、増やさない**方針にしている:

- 毎回要る事実 → `CLAUDE.md`（200 行未満を維持する）
- パス限定の規約 → `rules/`（`paths:` frontmatter で必ずスコープする）
- 手順 → `skills/`
- 強制 → `settings.json` + `hooks/`

**規約本文をここに写さない。** このリポジトリのハードルールの正本は
`eslint.config.mjs` と `__tests__/unit/architecture/` の gate 群で、散文に写すと
必ず実装からずれる（`.github/CONTRIBUTING.md` が同じ理由で複製を拒否している）。
ここに書いてよいのは、gate が無いか gate では表現できないことだけ。

## リポジトリ側との結合

- **`.claude/**` は ESLint からも tsc からも見えない**（`eslint.config.mjs` が
  `.claude/**` を globalIgnores、tsconfig の `include` はドット始まりに届かない）。
  品質を担保するのは Prettier だけなので、hook は**依存ゼロの単一ファイル**に保つ。
- 一方で tracked file 全体を走査する gate は `.claude/**` を見る。
  `__tests__/…/*.test.ts` を名指ししたら実在が強制され（`referenced-gates-exist`）、
  実制御文字は禁止され（`source-files-are-text`）、14 桁の migration 名も禁止される
  （`gates-do-not-pin-migrations` の SCAN に `CLAUDE.md` と `.claude` を追加済み）。
- CI の `changes` job のフィルタは `.claude/**` を除外していないので、
  `settings.json` や `hooks/*.mjs` を触った PR は重い job が全部走る。
  逆に `*.md` だけの PR は `code=false` になり、CI では gate が 1 つも走らない
  （ローカルの pre-push は走るので、**push 前に必ず通すこと**）。
- hook の起動は `bun --silent <hooks/*.mjs>`（`shell: powershell`、`args` 無し）。
  PATH 上の `bash` は WSL ランチャで Windows パスを壊す。素の `command: bun` は
  Cursor が usage を stdout に出し、"not valid JSON" で action を止める。

## `agents/` に 1 本だけある理由

公式の作成トリガーは "Define a custom subagent when you **keep spawning the same
kind of worker with the same instructions**"。このリポジトリではそれが起きている。

- リポジトリ全体を対象にした調査を実測したとき、返ってきた 169 件の主張のうち
  **CONFIRMED 103 / IMPRECISE 63 / REFUTED 3** — 約 4 割がそのままでは不正確だった。
  誤りは形が偏る（「使われていない」の過剰主張、走査範囲の申告漏れ、根拠の無い断定）
- 組み込みの **Explore と Plan は CLAUDE.md を読み込まない**（general-purpose は
  読む）。規約の判断が要る調べ物を Explore に投げると、この repo の前提を知らないまま
  答える

`codebase-investigator` はこの 2 つを同時に埋める。読み取り専用
（`tools: Read, Grep, Glob, Bash` — Edit と Write を持たない）で、system prompt が
`path:line` の提示と未確認範囲の申告を要求する。

**消してよい条件**: 調査の不正確率が下がらない、または誰も delegate しなくなったとき。
効いているかは公式の skill eval と同じやり方で測る — 同じ質問をこの subagent 有り /
無しで別セッションに投げて比べる。

<!--
  agents/ を新規に作った直後だけ、Claude Code の再起動が要る。ファイル watcher が
  covers するのはセッション開始時に存在していたディレクトリだけなので、
  「そのスコープで最初の 1 本」は再起動しないと読み込まれない。
-->

## 意図的に置いていないもの

増やせば効くわけではないので、理由つきで見送っている。

- **2 本目以降の subagent** — `agents/` にあるのは `codebase-investigator` 1 本だけ
  （理由は下記）。検証役は別に作っていない。差分のレビューは `/code-review` が、
  主張の相互検証は dynamic workflow が既に担っており、どちらも呼び出しごとに
  プロンプトが変わるので固定した定義にする意味が薄い。
- **PostToolUse の自動整形 hook** — lefthook pre-commit の `eslint --fix` と
  `prettier --write` が既に staged ファイルを直す。編集のたびに走らせると二重管理に
  なり、毎回のレイテンシだけが増える。
- **commit / PR 用の skill** — 汎用の手順であり、リポジトリ固有の要点（push は
  300 秒以上、PR 前に `validate && build`）は `CLAUDE.md` に 2 行で足りる。
- **`REVIEW.md`** — レビューの nit 上限や再レビューの収束ルールを書ける公式機構
  だが、読むのは Team / Enterprise 向けのマネージド Code Review だけ。ローカルの
  `/code-review` は **`REVIEW.md` を読まない**ので、今このリポジトリに置いても
  何も起きない。Code Review を有効化したときに初めて意味を持つ。
- **`output-styles/`** — 作るなら `keep-coding-instructions: true` を必ず付ける。
  カスタム output style は既定で「**変更をどうスコープするか・どう検証するか**」
  という Claude Code 組み込みのソフトウェアエンジニアリング指示ごと落とす。
  ここが抜けると、`CLAUDE.md` に何を書いても土台が消える。

## 並列で動かすとき

公式は並列化を 4 つに分けている。**同じファイルを触る作業を分けるのは subagent では
なく worktree** で、subagent は「本会話を汚さずに調べ物をさせる」ための道具。

| したいこと                           | 使うもの                                                     | 現状             |
| ------------------------------------ | ------------------------------------------------------------ | ---------------- |
| 自分で複数セッションを回す           | `claude --worktree <name>`                                   | **設定済み**     |
| 独立タスクを渡して後で見る           | `claude agents`（agent view / research preview）             | 追加設定は不要   |
| 大きな変更を分割して並列に編集させる | `/batch`（5〜30 の worktree 隔離 subagent が各々 PR を開く） | 追加設定は不要   |
| 本会話を汚さずに調べ物をさせる       | subagent                                                     | 組み込みで足りる |

「設定済み」の中身は `.worktreeinclude`（`.env*` / `generated/` /
`playwright/.auth/` を運ぶ）と、`.gitignore` の `.claude/worktrees/`。

- **新しい worktree の初期化は `bun install` だけ。** `node_modules` は運ばれないが、
  `postinstall` が prisma generate まで済ませる。
- **`worktree.baseRef` の既定は `"fresh"`** — リポジトリの既定ブランチ（`main`）から
  切る。feature ブランチで作業中に subagent を worktree 隔離すると、**その subagent は
  作業中のコミットを見ない**。作業中のコードに働かせたいときだけ `settings.json` に
  `{"worktree": {"baseRef": "head"}}` を置く。既定のままにしてあるのは、どちらが
  正しいかが使い方で変わるため。
- **agent teams は experimental で既定無効**。teammate ごとに別の Claude インスタンスに
  なるのでコストが高く、worktree による隔離もしない（ファイルの所有を自分で分ける
  必要がある）。個人開発では上の 3 つで足りる。

## 長く自律実行させるとき

公式は根本原因をこう説明している — "Claude stops when the work looks done.
Without a check it can run, 'looks done' is the only signal available"。
つまり対策は「ズルするな」と指示することではなく、**走らせられる check を与える**
こと。強さの順に 4 段あり、どれを使うかは「止まる判定を誰がやるか」で決まる。

| 段  | 仕組み                                               | 判定するのは                     |
| --- | ---------------------------------------------------- | -------------------------------- |
| 1   | プロンプト内で「check を走らせて通るまで直せ」と書く | 作業中の Claude 自身             |
| 2   | `/goal <条件>`                                       | 毎ターン後に走る**別のモデル**   |
| 3   | Stop hook                                            | 自前のスクリプト（決定論的）     |
| 4   | 検証用 subagent / `/code-review`                     | 差分だけを見る**別コンテキスト** |

このリポジトリで使えるのは 1 と 4。2 と 3 は入れていない。Stop hook は毎ターン必ず
走るので、CI 相当の検査を掛けると 1 ターンごとに数十秒を恒常的に足すことになる。
長く回したいときは、まず `/goal` を試すほうが安い（条件に
`or stop after 20 turns` のような打ち切り節を含められる）。

4 が効くのは、**作業したモデル自身に採点させない**から。ただし公式が警告している
とおり、指摘を探せと言われたレビュアーは健全な実装にも何か見つけるので、
「正しさか要件に効くものだけを挙げよ」と条件を付けて呼ぶこと。
`/code-review` は effort を下げるほど「確信のあるものだけ」を返す。

subagent を回すときは frontmatter の `maxTurns` でターン数の上限を切れる。
`tools` / `disallowedTools` で読み取り専用にもできる（組み込みの Explore と Plan は
Write と Edit を拒否した read-only 構成）。

skill を足したら、効いているかは**思い込みでなく比較で**確かめる。公式の言い方では
「skill が起動したことは、Claude がそれを見つけた証拠であって、意図どおり動いた証拠
ではない」。同じプロンプトを skill 有り / 無しの**新しいセッション**で走らせて比べる
（`skill-creator` プラグインがこの比較を自動化する）。

## 変えるとき

1. 「これは gate にできないか」を先に考える。できるなら gate にする。
2. `rules/` を足すときは `paths:` を必ず付ける。付けないと毎セッション読み込まれ、
   `CLAUDE.md` を分割した意味が消える。
3. `CLAUDE.md` が 200 行を超えたら、増やすのではなく `rules/` か `skills/` へ移す。
4. `hooks/` を触ったら、実際に JSON を流し込んで**止まるべきものと通るべきものの
   両方**を確かめる。fail open の設計なので、壊れても静かに素通りする。
5. **`CLAUDE.md` と `rules/` に同じことを書かない。** 両方に書くと片方だけ古くなる。
   矛盾した指示があると Claude はどちらかを恣意的に選ぶので、ときどき両方を
   読み直して重複と矛盾を落とす（公式の Consistency 指針）。
6. 検証できない文を書かない。「きれいに書く」ではなく「2 space」、「テストする」
   ではなく「`bun run test -- <file>` を通す」。曖昧な指示ほど従われない。
7. skill の `description` は**「いつ使うか」を先頭**に置き、利用者が実際に打つ語
   （日本語の言い回しを含む）を入れる。listing は 1 件 1,536 文字で切られ、
   後ろから落ちる。
