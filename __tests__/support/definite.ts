/**
 * テストで「無いはずがない値」を取り出すヘルパー。
 *
 * ## なぜ `!` を使わないか
 *
 * `noUncheckedIndexedAccess` が有効なので `rows[0]` は `T | undefined` になり、
 * `rows[0]!.amount` と書きたくなる。ところが実際に空だったときに出るのは
 *
 *   TypeError: Cannot read properties of undefined (reading 'amount')
 *
 * だけで、**何が無かったのかが分からない**。落ちた行を読んで、そこから
 * 「rows が空だったのか、amount が無いのか」を推測することになる。
 *
 * `definite(rows[0], "refunds[0]")` なら
 *
 *   Error: refunds[0] が無い（null / undefined）
 *
 * と出る。テストの失敗は診断のためにあるので、名前を付けて落とす。
 *
 * ## なぜ cast を使わないか
 *
 * 引数を `T | null | undefined` で受ければ、guard の後は TypeScript が `T` に
 * 絞る。`as NonNullable<T>` は要らない。**戻り値を cast で作るヘルパーは、
 * 呼び出し側の `!` を 1 箇所に集めただけ**で、嘘の位置が変わるだけになる。
 */
export function definite<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${what} が無い（null / undefined）`);
  }
  return value;
}

/**
 * mock の n 回目の呼び出しの引数。
 *
 * `mock.calls[0]![1]` が頻出するので専用にする。呼ばれていなければ
 * 「n 回目の呼び出しが無い」で落ちるので、`toHaveBeenCalled` を書き忘れた
 * テストでも原因が読める。
 */
export function nthCall<A extends readonly unknown[]>(
  mockFn: { readonly mock: { readonly calls: readonly A[] } },
  index: number,
  what: string,
): A {
  return definite(
    mockFn.mock.calls[index],
    `${what} の ${index + 1} 回目の呼び出し`,
  );
}
