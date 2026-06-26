/**
 * page-hero barrel — CLIENT-SAFE.
 *
 * `pageHeroConfigSchema` (zod 値) は **意図的に re-export していない** (portable-text と同型)。
 * schema 値が必要な server / admin client は `./schema` を直接 deep-import すること:
 *
 *   import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero/schema";
 *
 * 背景: strict-dynamic CSP 下で公開 'use client' が barrel 経由で zod chunk を引き込むと、
 * `◐` 静的シェルで生成 HTML に nonce 無し `<script>` が焼かれ全 client chunk が CSP block。
 * 詳細は `.claude/rules/sections.md` および `__tests__/unit/architecture-boundaries.test.ts`
 * の deny-list grep gate を参照。
 */
export {
  HERO_TRANSITIONS,
  type PageHeroConfig,
  type PageHeroConfigInput,
  type PageHeroVariant,
  type HeroTransition,
} from "./schema";
export { pageHeroMetadata } from "./metadata";
export { DEFAULT_PAGE_HERO } from "./defaults";
