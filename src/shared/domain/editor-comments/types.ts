import type { EditorCommentStatus } from "@/shared/db/enums";
export type { EditorCommentStatus } from "@/shared/db/enums";

type DateLike = Date | string;

export type CommentableContentType = "post" | "news" | "page" | "faq";

const COMMENTABLE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "post",
  "news",
  "page",
  "faq",
]);

export function isCommentableContentType(
  value: string,
): value is CommentableContentType {
  return COMMENTABLE_CONTENT_TYPES.has(value);
}

type CommentUserSummary = {
  id: string;
  name: string;
  image: string | null;
};

export type EditorComment = {
  id: string;
  threadId: string;
  content: string;
  isDeleted: boolean;
  deletedAt: DateLike | null;
  deletedBy: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
  createdBy: string | null;
  createdByUser?: CommentUserSummary;
  deletedByUser?: CommentUserSummary | null;
};

export type EditorCommentThread = {
  id: string;
  markId: string;
  contentType: string;
  contentId: string;
  quotedText: string;
  status: EditorCommentStatus;
  resolvedAt: DateLike | null;
  resolvedBy: string | null;
  createdAt: DateLike;
  updatedAt: DateLike;
  createdBy: string | null;
  comments: EditorComment[];
  createdByUser?: CommentUserSummary;
  resolvedByUser?: CommentUserSummary | null;
};

export type CreateThreadInput = {
  markId: string;
  contentType: CommentableContentType;
  contentId: string;
  quotedText: string;
  initialComment: string;
};

export type AddCommentInput = {
  threadId: string;
  content: string;
};

export type GetThreadsQuery = {
  contentType: CommentableContentType;
  contentId: string;
  status?: EditorCommentStatus;
};

export type ThreadListItem = {
  id: string;
  markId: string;
  quotedText: string;
  status: EditorCommentStatus;
  commentCount: number;
  latestComment?: {
    content: string;
    createdAt: DateLike;
    createdByName: string;
  };
  createdAt: DateLike;
  createdByName: string;
};

export type MarkInfo = {
  markId: string;
  threadId: string;
  status: EditorCommentStatus;
  commentCount: number;
};
