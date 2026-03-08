export class DomainError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "CONFLICT"
    | "VALIDATION"
    | "UNAUTHORIZED"
    | "UNEXPECTED";

  constructor(
    message: string,
    code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "VALIDATION"
      | "UNAUTHORIZED"
      | "UNEXPECTED" = "UNEXPECTED",
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
