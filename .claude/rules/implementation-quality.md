---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# 実装品質ルール

## 禁止事項

### 1. 形骸化実装禁止

```typescript
// NG: 空の関数
async function syncCalendar() {
  // TODO: implement
}

// NG: エラー握りつぶし
try {
  await save(data);
} catch {
  /* ignore */
}

// NG: 常に成功を返す
export async function deleteItem(id: string) {
  return { success: true }; // 実際の削除処理がない
}

// OK: executeAdminMutationResult パターンで完全な実装
export async function deleteItem(id: string) {
  return executeAdminMutationResult({
    resource: "item",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const item = await prisma.item.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!item) throw new DomainError("アイテムが見つかりません", "NOT_FOUND");

      await prisma.item.delete({ where: { id } });
      return { id };
    },
    afterSuccess: () => updateTag(CACHE_TAGS.ITEMS),
  });
}
```

### 2. 過剰な抽象化禁止

```typescript
// NG: 1回しか使わないユーティリティ
function formatSingleDate(date: Date): string {
  return date.toLocaleDateString("ja-JP");
}

// NG: 将来の拡張のための過剰設計
// 理由: 使われないインターフェースはメンテナンスコストだけが増大する
interface PluginSystem {
  register(plugin: Plugin): void;
  unregister(name: string): void;
  // ... 使われないインターフェース
}

// OK: 必要最小限。同じパターンが3箇所以上で出現してから抽象化を検討
const formatted = date.toLocaleDateString("ja-JP");
```

### 3. 後方互換ハック禁止

```typescript
// NG: 未使用変数のリネーム
const _oldFunction = () => {}; // 削除すべき

// NG: 削除コメント
// removed: export function legacyHelper() { ... }

// NG: 不要な re-export
export type { OldType as NewType }; // 型エイリアスは不要（prisma-patterns.md 参照）

// OK: 不要なコードは完全削除。参照元も更新
// 削除前: export function legacyHelper() { ... }
// 削除後: ファイルを削除し、参照元で直接実装を使用
```

### 4. デッドコード禁止

```typescript
// NG: 到達不能コード
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  if (type === 'b') return 2
  return 0  // 到達不能

// NG: 使われないインポート
import { unused } from '@/shared/lib/utils'

// OK: 使われないコードは削除
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  return 2  // type === 'b' のみ残り得る
}
```

### 5. ドメインコマンドの共通ロジックはヘルパー関数に抽出

重複チェック・顧客統計更新・ペイロード構築など、複数コマンドで共有するロジックはヘルパー関数に抽出する:

```typescript
// NG: 同じ統計更新ロジックが create/update/cancel に散在
await tx.customer.update({
  where: { id: customerId },
  data: {
    totalReservations: { increment: 1 },
    lastReservationAt: new Date(),
  },
});

// OK: ヘルパー関数に抽出
await updateCustomerStats(tx, customerId, "increment");
```

## 必須事項

### 1. コードを書く前に読む

- 変更対象ファイルと関連ファイルを必ず確認
- 既存パターン・命名規則に従う
- 同じ責務の既存実装がないか確認（重複実装を防ぐ）

### 2. 変更は最小限に

- 要求された変更のみ実装
- 「ついでに」のリファクタリング・コメント追加・型注釈追加をしない
- 変更していないコードに docstring やコメントを追加しない

### 3. 検証を行う

- `bun run type-check` でコンパイル確認
- `bun run lint` でリント確認
- `bun run validate` で両方を並列実行
- コミット前は `bun run validate && bun run build`

### 4. エラーハンドリング

```typescript
// NG: エラーを無視
try {
  await action();
} catch {}

// NG: console.log だけ
try {
  await action();
} catch (e) {
  console.log(e);
}

// OK: logError で構造化ログ + createMutationError で返す
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { createMutationError } from "@/shared/lib/mutation-result";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "deleteItem" },
  });
  return createMutationError("操作に失敗しました");
}
```

## Server Action 実装パターン

→ `error-handling.md` の `executeAdminMutationResult` パターンを参照。

## Gotchas

### 禁止事項 / セキュリティ / 外部 API

- **フォームヒント「上記の項目から自動生成されません」「手動で入力してください」は dead column の sign** — 構造化フィールド（`postalCode` + `prefecture` + `city` + `streetAddress` + `buildingName` 等）が既にあるのに display 用カラム（`Settings.address` 等）を並走させる SSoT 違反パターン。構造化フィールドから派生関数（`formatXxxAddress(entity)` / `buildAddress(info)` 等）に一本化し display 用カラムを destructive migration で削除するのが業界標準（Stripe / Shopify / Google Address Validation API）。実例: `Settings.address` 削除（2026-05-01 migration `20260501033054_drop_settings_address`）。新規フィールド追加時もこの sign を持ち込まない
- **公開側で `value.split("\n")` / `\r\n+` 等の改行 split 配列展開している `String? @db.Text` カラムは SSoT 違反 sign** — 入力が `Textarea`（改行区切り plain text）/ 公開描画が配列の semantic gap。データ層を `Json @default("[]")` 配列化 + useFieldArray + dnd-kit 入力 UI（追加ボタン + 並べ替え + 削除）に揃えるのが業界標準（Eventbrite / connpass の構造化アクセス入力、shadcn / Linear / Stripe Dashboard の構造化リスト編集）。実例: `Location.access String?` → `Location.accessLines Jsonb` 配列化（2026-05-01 migration `20260501040959_location_access_to_jsonb_array`）+ `LocationChapter.tsx` の `split("\n")` 削除 + `LocationForm.tsx` に `AccessLinesField`（useFieldArray + dnd-kit）導入。新規カラム追加時もこの sign を持ち込まない
- **同モデルへの並列公開 query は publication filter 契約を共有必須（"twin queries" drift 防止）** — `getPublicPage(slug)` が `where: { slug, isPublished: true, isActive: true }` を持つのに `getPageSeo(slug)` の `where` が `{ slug }` だけ、のような twin queries の filter drift は draft の本文は 404 でも metadata（OGP description / metaKeywords / `<meta>` tag）が公開ページに流れる silent leak を起こす（実例: 2026-05-07 修正、`isPublished: true, isActive: true` を `getPageSeo` に追加）。判定基準: 「同 model に対する複数の `'use cache'` / 公開 fetch helper があり、片方のみ publication filter 持ち」→ 全 helper に同 filter を伝播。新規 SEO/metadata query 追加時は対応する content query の `where` を grep + 同期させる

### フレームワーク固有

- **`inline-block` + 日本語 + `tracking-*` の intrinsic width が letter-spacing を無視（Chromium）** — `<span inline-block tracking-[0.18em]>カレンダー</span>` の `getBoundingClientRect().width` が 64px なのに内部 text range は 82.61px で box からはみ出す。`border-b-*` を `inline-block` に付けると下線がテキスト末尾（「ー」等）まで届かない silent bug。対処: `text-decoration: underline` + `decoration-2` + `underline-offset-[Npx]` + `decoration-accent`（テキスト描画パイプラインで box 計算バイパス、`transition-colors` が `text-decoration-color` を自動含む）。参照実装: `events-view-switcher.tsx` / `mypage-nav.tsx`
- **`.w-max` Tailwind クラスは `@theme --container-max: 80rem` に上書き済み** — プロジェクトが `--container-max` を `.w-max { width: 1280px }` として生成するため、Tailwind デフォルトの `width: max-content` として使えない silent bug。`max-content` が必要な場合は `style={{ width: "max-content" }}` インライン指定（Tailwind arbitrary `[width:max-content]` も可）
- **Turbopack HMR は新規 arbitrary value / data variant を拾わないことがある** — `right-[0.18em]` / `group-data-[state=active]:bg-accent` 等の新規追加クラスが CSS に生成されず computed style が `auto` / `rgba(0,0,0,0)` にフォールバック。対処フロー: ① `python3 -c "import shutil; shutil.rmtree('.next', ignore_errors=True)"` ② dev サーバー再起動 ③ ブラウザタブ閉じて再オープン（HTTP cache が古い CSS を保持するため reload では不十分）
- **Radix Tabs で SC children を preserve するには `forceMount` + `data-[state=inactive]:hidden`** — デフォルトでは inactive な `Tabs.Content` が unmount され、CC 内で page.tsx から props で渡した SC children の React element identity が失われる（内部 hook 再実行・scroll position 喪失等）。`<Tabs.Content forceMount className="outline-none data-[state=inactive]:hidden">` で DOM を保持したまま CSS で非表示切替する。参照実装: `events-view-switcher.tsx`
- **Prisma 7 `JsonNull` / `DbNull` の参照同一性フットガン** — `@generated/prisma/browser` と `@generated/prisma/client` は内部で異なる runtime（`runtime/index-browser` vs `runtime/client`）を import しており、`Prisma.JsonNull` は両者で **別オブジェクト参照** になる。Prisma 4+ では unique object 実装で identity 比較されるため、混在すると Prisma client が sentinel と認識せず通常 null として扱う silent bug。**runtime sentinel 値は必ず `@generated/prisma/client` から直接 import**（`shared/db/` / `shared/domain/` のみ許可、他は `@/shared/lib/validations/enums/prisma-types` ゲートウェイの type-only re-export 経由）。`architecture-boundaries.test.ts` で gateway の値 re-export を禁止
- **`'use cache'` は dev 環境でもキャッシュが永続する** — DB を管理画面外で直接更新（SQL / `bun -e`）しても `updateTag` が呼ばれないためキャッシュが残る。dev サーバー再起動で全キャッシュがクリアされる。管理画面の Server Actions 経由の更新は `afterSuccess` の `updateTag` で即時反映される
- **`revalidateTag` は Next.js 16 で 2 引数必須** — `revalidateTag(tag: string, profile: string | CacheLifeConfig)`。第 2 引数 `profile` は省略不可（旧 Next.js 14/15 との破壊的変更）。`CACHE_LIFE.*` 定数を渡すのが正しい用法。監査・レビュー時に「余分な引数」と誤識別しないこと
- **`createElement` の 3-arg form は required `children` props と非互換** — `createElement(Component, propsWithoutChildren, children)` は props 型が `{ children: ReactNode }` を要求する場合 TS2769（`Property 'children' is missing in type ...`）。対処: `createElement(Component, { ...props, children })` で children を props に含める 2-arg form に統一。`.ts` ファイル（JSX 不使用）で React Email 系コンポーネントを動的生成する際に遭遇する。`email-template-test.ts` 参照実装
- **`updateTag` は 1 引数** — `updateTag(tag: string)` は `revalidateTag` とは異なり第 2 引数なし。混同しない
- **`getCacheTag.spaces.detail(arg)` は公開側 `/spaces/[slug]` が slug でタグ付けしている** — 管理 mutation で `updateTag(getCacheTag.spaces.detail(id))` を渡すと公開詳細ページのキャッシュが無効化されない silent bug（`admin/_shared/actions/space.ts:35` に現存）。正しくは `updateTag(getCacheTag.spaces.detail(slug))`（`invalidateReviewCaches` 参照実装）。`reviews.space(id)` / `reviews.stats(id)` は内部専用タグなので id のまま OK
- **`global-error.tsx` に `next/font/google` 使用不可** — admin.css/public.css をインポートしないため、変数モードのフォント CSS が preload されるが未使用警告になる。`<body style={{ fontFamily: '...' }}>` でシステムフォントを直接指定する
- **時刻依存の設定トグルに `CACHE_LIFE.STATIC_SETTINGS` 禁止** — メンテナンスモード等、即時反映が必要な設定は `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` を使う（`STATIC_SETTINGS` は 'days' 単位のため切り替えが即時反映されない）
- **管理画面 Suspense 内 async SC には `connection()` 必須** — PPR では Suspense 境界ごとに動的判定される。layout の `headers()` は子の Suspense 境界に伝播しない。`new Date()` や uncached データを使う async Server Component には `await connection()` を先頭に配置（[公式推奨](https://nextjs.org/docs/app/api-reference/functions/connection)）。page.tsx 本体には不要
- **`generateViewport` は `"use cache"` クエリと組み合わせる** — `viewport` の static export から `generateViewport()` async 関数に変更すると動的レンダリングを引き起こすが、内部クエリが `"use cache"` ならキャッシュから読み取る。layout.tsx が既に動的（`getHeaderSettings` 等）なら影響なし
- **`'use cache'` 関数に Zod スキーマ・関数・クラスインスタンスを引数で渡せない** — React シリアライゼーション制約。`Cannot access X on the server. You cannot dot into a temporary client reference` エラー。DB フェッチのみをキャッシュ関数に閉じ、バリデーション等は外で行う
- **`$generateHtmlFromNodes` は Route Handler で動作しない** — `@lexical/html` は `document.createElement` 等を要求。Route Handler (Node.js) には DOM がないため 500 エラー。プレビューはクライアント側 `renderEditorStateJsonToHtmlClient` で生成。Server Actions の `renderEditorStateToHtmlLazy` は動作する
- **`serverExternalPackages: ["better-auth"]` は Turbopack 開発サーバーで 500** — 公式は推奨するが Turbopack の resolveAlias と競合する。`transpilePackages: ["better-auth"]` + `turbopack.resolveAlias` で代替
- **`Cannot find module 'node:X': Unsupported external type Url for commonjs reference` (Turbopack)** — server-only モジュールが Client Component バンドルに混入した時の典型エラー。原因は barrel の `export *` で Node-only SDK（`ical-generator` / `resend` / `googleapis` / `@touch4it/*` / `stripe` / `nodemailer` / `google-auth-library`）を純粋関数と混在させ Client から import したケース。対処: ① SDK 依存 barrel に `import "server-only"` を追加 ② 純粋関数は別サブパス（例: `ical/urls.ts`）に分離し Client Component をサブパス import に切替（参照実装: `@/shared/lib/ical/urls`）。検出 grep は `server-only-patterns.md` §検出 grep を参照
- **アイコンライブラリは `@tabler/icons-react`** — lucide-react から完全移行済み。全アイコンは `Icon` プレフィックス + PascalCase（例: `IconPlus`, `IconBrandGoogle`）。型は `TablerIcon`（旧 `LucideIcon`）。ブランドアイコン（LINE, Google, Stripe 等）も Tabler に統合済み
- **RHF 7.72 で `Control<T>` が invariant** — 異なるフォーム型で共有するコンポーネントの公式パターンは存在しない。Pure Component（RHF 非依存の値+callback props）+ Connected ラッパー（`as Path<T>` で型ブリッジ）が最善。`as Control<any>` / `as never` 禁止。参照実装: `LayoutFields.tsx` + `LayoutFieldsConnected`
- **`exactOptionalPropertyTypes` で optional prop に `T | undefined` を渡せない** — `prop?: string` に `string | undefined` を渡すとエラー。コンポーネント props では `prop: string | undefined`（required + union）で宣言する。`prop?: string` は「省略可能だが渡すなら `string`」の意味
- **認証・プライベートページには `robots: { index: false, follow: false }` 必須** — `/login`, `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, `/mypage/*` 等。layout.tsx に設定すれば全サブページに継承。未設定だとクロールバジェット浪費＋低品質ページ評価リスク
- **Zod schema / Server module の挙動確認は `bun -e "import('./path/to/module.ts').then(...)"`** — dev server 起動・ブラウザ往復なしに `safeParse({})` / 関数戻り値を直接検証できる。SSoT ドリフト調査・スキーマ整合検証で特に有効（例: 2026-05-07 home CTA throw root cause を `bun -e "const {ctaConfigSchema} = await import('./src/.../section.ts'); console.log(ctaConfigSchema.safeParse({}))"` で 1 コマンド特定）。`tsx` / `ts-node` 不要、TypeScript はそのまま実行可能
- **`createTypedConfigGetterFromSchema` の fallback 契約** — `section-defaults.ts` の `getXxxConfig` は「実 config parse 失敗 → `safeParse({})` フォールバック → それも失敗で throw」。**全 section schema は empty object で必ず default 値を生成できなければならない**。required field を追加する際は `.default()` を必ず付ける（または `.optional()` 化）。`title.min(1)` のような default なし required は SectionRenderer throw → ErrorBoundary 露出の silent bug（→ `ssot-singletons.md` §Section schema 重複）

### セキュリティ

- **API Route の処理順序: 認証 → バリデーション → ビジネスロジック** — バリデーションを認証前に実行すると未認証者にパラメータ名・型情報が漏洩する。`checkPermission` を最初に呼ぶ
- **`proxy.ts` のヘッダー名は `x-pathname`** — `x-next-pathname` ではない。`headers().get()` で参照する側が不一致だと常に `""` が返りリダイレクトロジックが壊れる
- **`next.config.ts` に seed/開発専用ドメインを残さない** — `placehold.co` 等の開発用 `remotePatterns` / CSP `img-src` は本番で不要。`dangerouslyAllowSVG` も seed 画像のためだけに有効化しない
- **監査ログの provider 判定は全 OAuth プロバイダーを列挙** — `ctx.path.includes("social")` だけでは LINE が "google" として記録される。`/line` → `"line"`、`/google` → `"google"` と個別判定する
- **新しい iframe 埋め込みサービス追加時は `proxy.ts` の `frame-src` 更新必須** — Google Maps（`https://www.google.com`）、YouTube、Stripe 等。未登録だと `Refused to frame` エラーでサイレントにブロックされる
- **Google Maps Embed API は `https://www.google.com/maps/embed/v1/` を使用** — 非公式パラメータ（`pb=`, `output=embed`）禁止。API key は `getDecryptedGoogleMapsApiKey()` で復号。Maps Embed API は無料（使用量無制限）
- **Instagram 画像は `*.cdninstagram.com` と `*.fbcdn.net` の両方が必要** — Meta は CDN ドメインを使い分ける。`proxy.ts` の `img-src` と `next.config.ts` の `remotePatterns` の両方に追加すること
- **`revalidateTag` 先のキャッシュが存在するか確認必須** — cron で `revalidateTag(CACHE_TAGS.X, ...)` を呼んでも、対応するクエリに `'use cache'` + `cacheTag(CACHE_TAGS.X)` がなければ無効化対象が存在しない。新規 cron 追加時は公開クエリ側のキャッシュ設定を必ず確認
- **`proxy.ts` の `timingSafeEqual` はシークレット比較の標準** — Cron / Webhook のトークン比較に使用。`!==` による文字列比較はタイミング攻撃に脆弱。新規トークン比較追加時も同関数を使う
- **dev 便利バイパスには本番ガード必須** — Turnstile / Cron で `if (!secret) return true` パターンは `process.env["NODE_ENV"] === "production"` で本番を保護。staging 環境も保護対象
- **空配列フォールバック `|| arr.length === 0` で全許可にしない** — `ALLOWED_MIME_TYPES.OTHER = []` + `|| allowedTypes.length === 0` で全 MIME 通過していた。空配列は「何も許可しない」を意味すべき

### 外部 API 統合

- **Resend SDK の `emails.send()` 直接呼び出し禁止** — `@/shared/lib/email/send.ts` の `sendEmail()` 経由のみ。idempotency key + exponential backoff retry（429/500/503）が自動適用される。接続テスト `api-keys/resend.ts` の `domains.list()` のみ例外（単発検証）
- **Google Calendar API 呼び出しは `withGoogleApiRetry()` 必須** — `@/shared/lib/google-calendar/retry.ts`。公式推奨の 429/500/503 + ネットワークエラー（ECONNRESET/ETIMEDOUT/EAI_AGAIN/ENOTFOUND/ECONNREFUSED）を exponential backoff（1s → 2s → 4s + jitter）で自動再試行。400/401/403/404/410 は即時失敗（公式準拠）。新規 API 呼び出し追加時は必ずラップする
- **Resend `CreateEmailOptions` は discriminated union** — `Omit<CreateEmailOptions, "from"> + { ...payload, from }` は `exactOptionalPropertyTypes: true` 下で union 型を失うため、`as CreateEmailOptions` で SDK 境界 cast が許容される（`Prisma.InputJsonObject` と同じ扱い、`send.ts` 内の 1 箇所のみ）
- **Resend idempotency key は 2 引数形式** — `resend.emails.send(payload, { idempotencyKey })` が Resend v6 公式推奨。payload 内 inline も動作するが公式ドキュメント準拠のため 2 引数形式に統一（`send.ts` 内部実装）。key 形式は `<event-type>/<entity-id>` + 24 時間有効、長い URL / email は `hashForKey()`（sha256 先頭 32 文字）でハッシュ化
- **Cloudflare Turnstile は `validateTurnstile({ token, expectedAction })` 経由のみ** — `@/shared/lib/action-helpers` の SSoT ヘルパー経由。`remoteip` は内部で `getClientIpFromHeaders()` から自動取得、`idempotency_key` は `crypto.randomUUID()` で自動生成、timeout は公式推奨 10 秒。`verifyTurnstileToken` 直接呼び出しは `turnstile.ts` 内部のみ。Server Action / Better Auth before hook / API Route いずれも同じヘルパーを通す
- **Turnstile action 識別子は `TURNSTILE_ACTIONS` (client-safe) が SSoT** — `@/shared/lib/turnstile-actions`。Widget の `data-action` と server 側 `expectedAction` の両方が同じ定数を参照。公式制約: alphanumeric + `_` + `-`、最大 32 文字。新規フォーム追加時は定数にエントリを追加してから widget + server 両方で参照
- **Turnstile secret key は DB 管理 (`Settings.turnstileSecretKey`)** — `.env` / `.env.example` に `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` を置かない（管理画面 `/admin/settings/security-integrations` で設定）。本番で secret 未設定は `verifyTurnstileToken` が `HIGH` severity でログ + 拒否、開発では検証スキップ
- **Better Auth エンドポイントの Turnstile は `x-captcha-response` ヘッダー契約** — `admin-auth.ts` の before hook で `/request-password-reset` と `/reset-password` を保護。クライアントは `adminAuthClient.resetPassword({ ..., fetchOptions: { headers: { "x-captcha-response": token } } })` の形式で送信。Better Auth 公式 `captcha` プラグインと同一契約のため将来のプラグイン移行時もクライアント改修不要
- **TurnstileWidget の `appearance` は prop で切替可能（デフォルト `"always"`＝公式標準）** — `DEFAULT_TURNSTILE_APPEARANCE` (`@/shared/lib/turnstile-actions`) は Cloudflare 公式デフォルトの `"always"`（Bot 保護 UI を明示）。widget を見せたくないフォームでは `appearance="interaction-only"`、プログラム的に実行する高度ケースでは `appearance="execute"` を明示指定。型は `TurnstileAppearance` で 3 値に限定済み。`size: "flexible"` + `retry: "auto"` + `refreshExpired: "auto"` は全モード共通の標準
- **iCal (.ics) 生成は `@/shared/lib/ical` のヘルパー経由のみ** — `ical-generator` v10 + `@touch4it/ical-timezones` ベース。`ical()` / `ICalCalendar` の直接呼び出し禁止。UID は `buildReservationUid` / `buildEventRegistrationUid`（RFC 5545 `<localpart>@<domain>` 形式で永続安定）、update/cancel では `icsSequence: { increment: 1 }` を mutation に配線し `METHOD:CANCEL|REQUEST` ICS を同一 UID + 新 SEQUENCE で送ることで既存カレンダー登録を上書き。Add to Calendar の ICS ダウンロードは `/api/calendar/reservation/[id]` / `/api/calendar/event/[registrationId]` の customer-authenticated route handler URL を使用（`data:` URL は Gmail / Outlook Web ブロックのため禁止）。UI は `AddToCalendar` Server Component（`variant="public"` で Google/Outlook のみ、`"authenticated"` で 3 択）。`ical-generator` は 75 オクテット行折り返しを自動適用するためテストで `ics.replace(/\r\n /g, "")` で unfold してから assert。詳細: `.claude/rules/ical-patterns.md`
- **`icsSequence` インクリメント対象は user-facing state transition のみ** — 予約: `updateReservation` / `cancelReservation` / `cancelCustomerReservation` / `confirmReservation` / `completeReservation` / `markNoShow` / `deleteReservation` / `restoreReservation`。イベント申込: `cancelEventRegistration` / `updateEventRegistration`。**対象外**: `paymentStatus` / Stripe ID（`payment-commands.ts` / `payment-queries.ts`）・`googleCalendarEventId` / `calendarSyncedAt`（`calendar-sync.ts`）・`notes` のみ（`updateReservationNotesCommand`）。SEQUENCE の意味は「カレンダー予定の内容が変わったか」
- **新規外部 SaaS 統合時はプライバシーポリシーへの記載必須** — `terms-templates.ts` の `PRIVACY_POLICY_TEMPLATE` §7「利用する外部サービス」と env vars の整合性検証 grep: `grep "process.env\[" src/shared/lib/env/server.ts src/shared/lib/env/client.ts`。新規 OAuth プロバイダ・分析・決済・ストレージ等を追加した場合、サービス節 (`<h3>7.x ...</h3>`) と §8「個人データの越境移転」の事業者列挙を更新。記載漏れは個人情報保護法 21 条（利用目的明示義務）違反リスク。検出例: Cloudflare R2 が env にあるのに §7 不在だった事例（2026-04-21 修正）
- **規約テンプレート HTML はプレースホルダー機構で Settings 連動** — `terms-templates.ts` の `【〜を入力してください】` 形式の `PLACEHOLDER` 文字列が `applyBusinessInfo()` で Settings 値に置換される。未設定フィールドはプレースホルダーがそのまま残り、管理画面で管理者への入力プロンプトとして機能する（intentional UX）。新規プレースホルダー追加は 4 箇所同時更新: ① `PLACEHOLDER` const + ② `applyBusinessInfo()` の `replacements` 配列 + ③ `BusinessInfo` interface + ④ `extractBusinessInfo()`（`terms/new/page.tsx`）+ seed `seedTerms()` の `businessInfo` 構築。同一プレースホルダーがテンプレート内に複数回出現するため `replaceAll` 必須（`replace` だと先頭のみ）

### レートリミッター

- **`/api/auth/get-session` は `apiRateLimiter`（100/分）で制限** — `authMutationRateLimiter`（20/15分）に含めると、ページ遷移のたびにカウントが消費され sign-in が 429 で拒否される。`checkRateLimit()` で `get-session` を分岐済み
- **`authMutationRateLimiter` は sign-in/sign-up/sign-out 等の mutation 専用** — 旧 `authRateLimiter`（read/write 一括 10/15分）は廃止済み
