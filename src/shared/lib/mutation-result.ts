export type MutationError = {
  readonly error: string;
  readonly fieldErrors?: Record<string, string[]>;
};

export type MutationResult<T = null> = T | MutationError;

export function createMutationError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): MutationError {
  return fieldErrors ? { error, fieldErrors } : { error };
}

export function isMutationError(result: unknown): result is MutationError {
  return (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string"
  );
}

/**
 * MutationErrorをそのまま返す（identity function）
 *
 * @deprecated Task 6 で削除予定 — createValidationMutationError に置き換え
 */
export function toMutationError(error: MutationError): MutationError {
  return error;
}
