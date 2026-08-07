---
paths:
  [
    "__tests__/**",
    "scripts/run-tests.ts",
    "scripts/test-db-runner-env.ts",
    "scripts/test-db-url.ts",
    "scripts/migrate-test-db.ts",
    "bunfig.toml",
  ]
---

# unit / integration テスト（bun test）

## 実行は必ず runner 経由

`bun scripts/run-tests.ts <path...>`（`test:unit` / `test:integration` の実体）。
各 `*.test.ts` を独立した `bun test --conditions production` サブプロセスで起動する。

- 素の `bun test <dir>` 禁止: `mock.module()` の process-global live binding が
  ファイル間干渉する
- `--conditions production` がないと Lexical（全 14 @lexical パッケージ）の
  循環 ESM import が TDZ violation で落ちる
- coverage を bunfig.toml に常設しない（per-file runner と干渉し不正確）。
  必要時は単発 `bun test --coverage <file>` を参考値として使う

## mock パターン

- `mock.module()` を先に宣言し、テスト対象は宣言後に `await import(...)` で
  動的 import する（静的 import は mock 適用前に評価される）
- preload（`__tests__/setup.ts`）が server-only の no-op 化・DATABASE_URL のダミー固定・
  暗号化キー mock を行う。共有ヘルパーは `__tests__/mocks/`（例:
  `errors-server` の `installErrorsServerMock`）。それ以外はファイルローカルの
  `mock.module()` が現行スタイル
- JSDOM が必要なテストは `installJSDOMForTests()` を beforeEach で再適用できる

## 実 DB 統合テスト（要 Postgres）

- 新規の実 DB テストは `process.env["TEST_DATABASE_URL"]` または
  `process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"] …` を
  ファイル先頭付近に書けば `scripts/serial-db-test-detection.ts` が serial bucket に
  **自動検出**する（`mock.module("@/shared/db/prisma")` するファイルは除外）。
  マーカーが効かない edge case のみ `SERIAL_DB_TEST_FORCE_INCLUDE` に opt-in 登録
- preload が DATABASE_URL をダミーに固定するため、prisma gateway を
  **動的 import する前に** `process.env.DATABASE_URL` を TEST_DATABASE_URL で上書きする
  （gateway は module load 時 snapshot を読む）
- afterAll で `prisma.$disconnect()`（しないとサブプロセスがハング）
- TEST_DATABASE_URL 未設定での直接実行は describe.skip で **silent skip** される
  （runner 経由なら docker compose の既定値 localhost:5433/myrrh_test が自動注入）
- 並行競合の再現テストは beforeAll で warmup 並行バーストが必要
  （cold connection では競合が偶発的に直列化して隠れる）
- 遅いテストは `test(name, fn, 30_000)` のように第 3 引数で per-test timeout を
  明示上書きする（既定 5000ms）

## 静的ゲートの分担

`__tests__/**` は ESLint 対象外。テストコードの静的ゲートは tsconfig.test.json の
型チェック（`bun run type-check` の tsc:test）のみ。命名は `*.test.ts`
（`*.spec.ts` は Playwright 用で runner に拾われない）。

## gate を触るときに固定すること

`expect(offenders).toEqual([])` 型の gate（`__tests__/unit/architecture/**` の大半）を
**新規に書くとき・広げるとき・狭めるとき**は、次の 3 方向を fixture で固定し、
さらに **4. fixture と実走査が同じ経路を通ること**を満たす。
1 つでも欠けると、直したつもりの gate が別方向に穴を開ける。

1. **新しく検出したい形が落ちる**
2. **前から検出していた形を今も落とす**
3. **正当な形が通る**

2 と 3 は「直す側」が最も飛ばしやすい。実測で起きた:

| 抜けた方向 | 何が起きたか                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2          | `public-path-alias-hygiene` に相対 import の検出を足したとき、`_shared` 内のファイルを**丸ごと走査から外した**。前身が弾いていた `@/app/(public)/_shared/…` 形が通るようになった（Codex が指摘するまで気づかず） |
| 3          | 同じ gate で、`_shared` 内の兄弟 relative import まで違反にして 28 ファイルを誤検出した                                                                                                                          |
| 3          | `errors-server-mock-coverage` の免除を「呼び出し本体だけ」に絞ったら、docstring 内の同じ呼び出しに正規表現が当たる形・spread 変数名が `actual` でない形など、**正当な 3 ファイルを誤検出**した（撤回した）       |

**判定ロジックは純粋関数として export し、fixture は合成文字列で書く。** 実ファイルへ
違反を注入する probe は「今このリポジトリで落ちること」しか示さず、リファクタで
壊れても気づけない。fixture なら CI が毎回検証する。

**免除（allowlist / early return / skip）を足すときは、免除の粒度を必ず書く。**
「このファイルは対象外」と「この行は対象外」は別物で、前者はたいてい広すぎる。

### 4. fixture が通る経路と、実走査が通る経路を同じにする

上の 3 方向を書いても、**fixture と実走査が別の道を通っていれば何も保証されない**。
同じ gate に対して 3 往復の指摘を受けた原因はすべてこれだった:

| 分岐のさせ方                                        | 何が検証されなくなるか                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 部品を個別に fixture し、実走査は inline で合成する | **合成部分**（`selectTriggerTags` と `hasAccessibleName` を繋ぐ filter）。壊れても fixture は緑   |
| 判定に既定引数を置き、fixture だけが引数を渡す      | **既定の配線**。`pageExists = existsSync` は実走査だけが通り、fixture は誰も通らない              |
| ファイル単位の early return で免除する              | **免除されたファイルの残りの判定**。`_shared` 内を丸ごと外したら、そこの旧 alias 形も一緒に外れた |

対処は 1 つ: **合成後の判定を 1 つの関数にまとめて export し、gate 本体も fixture も
それだけを呼ぶ。** 外部依存（ファイルシステム等）は**必須引数**で受け、実走査の
呼び出し側で明示的に渡す。既定値を置くと、その既定を通るのは実走査だけになる。

```ts
// 判定は純粋・必須引数。fixture も gate 本体もこれを呼ぶ。
export function missingRoutePages(
  entries: readonly Entry[],
  pageExists: (pagePath: string) => boolean,
) { … }

// 実走査の境界でだけ依存を注入する。
expect(missingRoutePages(sidebarEntries, existsSync)).toEqual([]);
```

### 絞り込みを撤回してよい

正当な形を誤検出する判定は、入れないほうがよい。**抜けたときの帰結が「黙って通る」
ではなく「別のところで大声で落ちる」なら、壊れやすい判定を足すより
docstring に範囲を正直に書いて留める**（`errors-server-mock-coverage` がその例）。
「gate があること」自体は目的ではない。
