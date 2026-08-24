/**
 * EDITOR の page スコープ制限が「引数を省くと無制限」側へ倒れないことを、
 * **型で**固定する（監査 A-78）。
 *
 * ## なぜ
 *
 * `userHasResourceAccess` は resourceId が無いと EDITOR でも無条件 true を返す
 * （list / 集計など id を持たない操作向けの意図的な設計）。
 * その前提のもとで、id を渡し忘れても型検査が通る API が 2 つあった。
 *
 * - `executeAdminMutationResult` の options union に
 *   `{ resourceId?: never; resolveResourceId?: never }` の腕があり、
 *   `checkResourceAccess` と直交していた。つまり
 *   **「チェックを有効にしたつもりで何も見ていない」組み合わせ**が書けた。
 * - `searchByResource(resource, query, scope = {})` は第 3 引数を省くと
 *   WHERE から page 制限が消える。`allowedPageIds` が無い = 制限なし。
 *
 * どちらも今日の呼出はすべて正しく渡しているので実害は出ていない。
 * 直したのは**型 API のほう**で、間違いを書けなくした。
 *
 * ## 何を見るか
 *
 * 代入可能性を型レベルで判定する。`@ts-expect-error` は使わない
 * （どの行のどのエラーを期待しているのかが表現できないため）。
 * 「通ってはいけない形」と「通らなければならない形」を両方置く。
 *
 * ## 直し方
 *
 * ここが落ちたら、`admin-action.ts` の union か `searchByResource` の
 * シグネチャが緩められている。緩めた側を戻す。
 */

import { describe, expect, test } from "bun:test";

import type { ExecuteAdminMutationResultOptions } from "@/admin/lib/admin-action";
import type { searchByResource } from "@/shared/domain/admin-search/queries";

/**
 * 代入可能性。**タプルで包んで分配を止める** — 包まないと union が各要素に
 * 分配され、`(2 | 3) extends 3` が `boolean` になって `= true` が通ってしまう
 * （実測でこれを踏んだ）。
 */
type Assignable<A, B> = [A] extends [B] ? true : false;

type Base = {
  resource: "page";
  action: "update";
  execute: () => Promise<void>;
};

type Options = ExecuteAdminMutationResultOptions<void>;

/** 通らなければならない形: id を静的に渡す。 */
const withResourceId: Assignable<
  Base & { checkResourceAccess: true; resourceId: string },
  Options
> = true;

/** 通らなければならない形: 認証後に解決する。 */
const withResolver: Assignable<
  Base & {
    checkResourceAccess: true;
    resolveResourceId: () => Promise<string | null>;
  },
  Options
> = true;

/**
 * 通ってはいけない形: チェックを有効にしたのに id を供給していない。
 *
 * 旧 union だとここが `true` になり、この宣言が compile error になる。
 */
const checkWithoutAnyId: Assignable<
  Base & { checkResourceAccess: true },
  Options
> = false;

/** チェックを有効にしていなければ id 無しでよい（list / 集計）。 */
const withoutCheckAndWithoutId: Assignable<Base, Options> = true;

/** `searchByResource` の `scope` は必須（既定値 `= {}` を戻すと `2 | 3` になる）。 */
const scopeIsRequired: Assignable<
  Parameters<typeof searchByResource>["length"],
  3
> = true;

describe("resource スコープ API の形（A-78）", () => {
  test("型レベルの判定がすべて意図どおり", () => {
    // 値としても読む。型だけ書いて未使用だと「消してよい」に見える。
    expect([
      withResourceId,
      withResolver,
      withoutCheckAndWithoutId,
      scopeIsRequired,
    ]).toEqual([true, true, true, true]);
    expect(checkWithoutAnyId).toBe(false);
  });
});
