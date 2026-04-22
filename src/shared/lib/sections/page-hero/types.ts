/**
 * PageHero の型だけを import したい呼び出し側向けの境界ファイル。
 *
 * Zod スキーマと parse 関数の実装は `schema.ts` に集約し、ここでは型の re-export のみ行う。
 */

export type { HeroTransition, PageHero, PageHeroInput } from "./schema";
