import { pageBuilderDocumentSchema } from "./schema";

export type PageBuilderValidationIssue = {
  readonly path: readonly string[];
  readonly message: string;
};

export type PageBuilderNodeValidationIssue = PageBuilderValidationIssue & {
  readonly nodeId: string;
  readonly fieldPath: readonly string[];
};

export type PageBuilderValidationResult = {
  readonly isValid: boolean;
  readonly issueCount: number;
  readonly issues: readonly PageBuilderValidationIssue[];
  readonly documentIssues: readonly PageBuilderValidationIssue[];
  readonly nodeIssues: Readonly<
    Record<string, readonly PageBuilderNodeValidationIssue[]>
  >;
};

const EMPTY_NODE_ISSUES: readonly PageBuilderNodeValidationIssue[] = [];

function normalizeIssuePath(
  path: readonly (string | number | symbol)[],
): string[] {
  return path.map((segment) =>
    typeof segment === "symbol"
      ? (segment.description ?? segment.toString())
      : typeof segment === "number"
        ? String(segment)
        : segment,
  );
}

function isNodeIssuePath(
  path: readonly string[],
): path is [string, string, ...string[]] {
  return path[0] === "nodes" && typeof path[1] === "string";
}

function fieldPathMatches(
  actualPath: readonly string[],
  expectedPath: readonly string[],
): boolean {
  if (actualPath.length !== expectedPath.length) {
    return false;
  }

  return actualPath.every((segment, index) => segment === expectedPath[index]);
}

export function validatePageBuilderDocument(
  input: unknown,
): PageBuilderValidationResult {
  const parsed = pageBuilderDocumentSchema.safeParse(input);

  if (parsed.success) {
    return {
      isValid: true,
      issueCount: 0,
      issues: [],
      documentIssues: [],
      nodeIssues: {},
    };
  }

  const issues: PageBuilderValidationIssue[] = [];
  const documentIssues: PageBuilderValidationIssue[] = [];
  const nodeIssues: Record<string, PageBuilderNodeValidationIssue[]> = {};

  for (const issue of parsed.error.issues) {
    const path = normalizeIssuePath(issue.path);
    const normalizedIssue = {
      path,
      message: issue.message,
    } satisfies PageBuilderValidationIssue;

    issues.push(normalizedIssue);

    if (isNodeIssuePath(path)) {
      const [, nodeId, ...fieldPath] = path;
      nodeIssues[nodeId] ??= [];
      nodeIssues[nodeId].push({
        ...normalizedIssue,
        nodeId,
        fieldPath,
      });
      continue;
    }

    documentIssues.push(normalizedIssue);
  }

  return {
    isValid: false,
    issueCount: issues.length,
    issues,
    documentIssues,
    nodeIssues,
  };
}

export function getPageBuilderNodeValidationIssues(
  validation: PageBuilderValidationResult,
  nodeId: string,
): readonly PageBuilderNodeValidationIssue[] {
  return validation.nodeIssues[nodeId] ?? EMPTY_NODE_ISSUES;
}

export function getPageBuilderNodeFieldError(
  validation: PageBuilderValidationResult,
  nodeId: string,
  fieldPath: readonly string[],
): string | null {
  for (const issue of getPageBuilderNodeValidationIssues(validation, nodeId)) {
    if (fieldPathMatches(issue.fieldPath, fieldPath)) {
      return issue.message;
    }
  }

  return null;
}

export function getFirstPageBuilderValidationNodeId(
  validation: PageBuilderValidationResult,
): string | null {
  for (const issue of validation.issues) {
    if (isNodeIssuePath(issue.path)) {
      return issue.path[1];
    }
  }

  return null;
}
