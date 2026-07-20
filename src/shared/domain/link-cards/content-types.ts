/**
 * Link Card — 内部リンクカードのコンテンツ種別 SSoT
 *
 * Prisma enum ではない（複数モデル横断の論理種別）。admin editor（ノード /
 * プラグイン / ダイアログ）と公開描画（resolve-queries /
 * resolve-internal-link-cards）の双方から参照される共有型のため shared/domain に置く。
 */
import { createTypeGuard } from "@/shared/lib/serialize";
import type { FeatureModule } from "@/shared/lib/features/registry";

export type LinkCardContentType = "post" | "news" | "space" | "event";

export const LINK_CARD_CONTENT_TYPES: readonly LinkCardContentType[] = [
  "post",
  "news",
  "space",
  "event",
] as const;

export const isLinkCardContentType = createTypeGuard<LinkCardContentType>(
  LINK_CARD_CONTENT_TYPES,
);

export const LINK_CARD_TYPE_LABELS: Record<LinkCardContentType, string> = {
  post: "記事",
  news: "お知らせ",
  space: "スペース",
  event: "イベント",
};

/**
 * LinkCardContentType → 対応する Feature Module のマッピング。
 *
 * 公開ルートは `requireFeatureEnabled` で 404 ガードされるため（`.claude/rules/app-structure.md`）、
 * Feature Module が OFF の content-type は「サイト内」タブの選択肢・挿入項目から
 * 除外する（無効な種別を新規に選べてしまう insert 経路側の bug 修正、M 級）。
 * `FeatureModule` は値を持たないメタデータ型のみを import（`import type`）しているため、
 * server-only な `features/check.ts` に依存せず client bundle に安全に含められる。
 */
export const LINK_CARD_CONTENT_TYPE_FEATURE_MODULE: Record<
  LinkCardContentType,
  FeatureModule
> = {
  post: "posts",
  news: "news",
  space: "spaces",
  event: "events",
};

/**
 * 有効な Feature Module 集合から、選択可能な LinkCardContentType のみを抽出する純粋関数。
 *
 * admin API route（`/admin/api/link-cards/content-types`）が `getEnabledFeatures()` の
 * 結果をこの関数に通してクライアントへ返し、LinkCardPlugin の「サイト内」タブが
 * それをセレクタのフィルタに使う。DB/feature-check には依存しないため単体テストしやすい。
 */
export function filterEnabledLinkCardContentTypes(
  enabledModules: ReadonlySet<FeatureModule> | readonly FeatureModule[],
): readonly LinkCardContentType[] {
  const enabledSet =
    enabledModules instanceof Set ? enabledModules : new Set(enabledModules);
  return LINK_CARD_CONTENT_TYPES.filter((type) =>
    enabledSet.has(LINK_CARD_CONTENT_TYPE_FEATURE_MODULE[type]),
  );
}
