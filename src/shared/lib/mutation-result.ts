/**
 * Server Action の失敗結果。
 *
 * **フィールド単位のエラーはここに乗せない（監査 A-80）。**
 * かつて `fieldErrors?: Record<string, string[]>` を持っていたが、
 * 184 箱所で作られて src 内の読み手は 0 だった（テストだけが存在を assert）。
 * フォームのフィールドエラーは Conform の `fields.X.errors` が担うで
 * （`admin-field-error-association.test.ts` が強制）、2 つ目の経路を
 * “作るだけで届かない”状態で残しておくと、
 * テストは緑なのに画面に何も出ないという差が固定される。
 *
 * 一括操作ダイアログ等でフィールド単位の表示が要るなら、
 * そのときに描画側と対で導入すること。
 */
export type MutationError = {
  readonly error: string;
  readonly code?: string;
};

export type MutationResult<T = null> = T | MutationError;

export function createMutationError(
  error: string,
  code?: string,
): MutationError {
  return {
    error,
    ...(code ? { code } : {}),
  };
}

export function isMutationError(result: unknown): result is MutationError {
  return (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string"
  );
}
