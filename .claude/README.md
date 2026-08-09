# .claude/

Claude Code のプロジェクト設定。**人間向けの説明**で、セッションには読み込まれない。

## 何がいつ読み込まれるか

| 置き場                   | 読み込み                                     | git      |
| ------------------------ | -------------------------------------------- | -------- |
| `../CLAUDE.md`           | 毎セッション、全文                           | 追跡     |
| `rules/*.md`             | `paths:` に一致するファイルを開いたときだけ  | 追跡     |
| `skills/*/SKILL.md`      | description のみ常時、本文は呼ばれたときだけ | 追跡     |
| `settings.json`          | 起動時（permissions / hook の配線）          | 追跡     |
| `hooks/*.mjs`            | 該当イベントごとにサブプロセスで実行         | 追跡     |
| `settings.local.json`    | 個人用の上書き。秘密値はここ                 | **無視** |
| `logs/ state/ memory/ …` | ローカル state                               | **無視** |

無視されるパスは `.gitignore` の `.claude/` 節が SSoT。

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
- hook の exec form が `bash` ではなく `bun` なのは、この開発機の PATH 上の `bash` が
  WSL ランチャ（`C:\WINDOWS\system32\bash.exe`）に解決され、Windows パスを渡すと
  壊れるため。`bun` はこのリポジトリの必須ツールで PATH にある。

## 意図的に置いていないもの

増やせば効くわけではないので、理由つきで見送っている。

- **カスタム subagent（`agents/`）** — 組み込みの Explore / Plan / general-purpose で
  足りている。専用エージェントは、同じ役割を繰り返し必要としてから作る。
- **PostToolUse の自動整形 hook** — lefthook pre-commit の `eslint --fix` と
  `prettier --write` が既に staged ファイルを直す。編集のたびに走らせると二重管理に
  なり、毎回のレイテンシだけが増える。
- **commit / PR 用の skill** — 汎用の手順であり、リポジトリ固有の要点（push は
  300 秒以上、PR 前に `validate && build`）は `CLAUDE.md` に 2 行で足りる。

## 変えるとき

1. 「これは gate にできないか」を先に考える。できるなら gate にする。
2. `rules/` を足すときは `paths:` を必ず付ける。付けないと毎セッション読み込まれ、
   `CLAUDE.md` を分割した意味が消える。
3. `CLAUDE.md` が 200 行を超えたら、増やすのではなく `rules/` か `skills/` へ移す。
4. `hooks/` を触ったら、実際に JSON を流し込んで**止まるべきものと通るべきものの
   両方**を確かめる。fail open の設計なので、壊れても静かに素通りする。
