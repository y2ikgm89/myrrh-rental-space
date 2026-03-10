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
