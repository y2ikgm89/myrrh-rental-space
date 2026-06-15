/**
 * CommentPanel
 *
 * @description エディタコメントのサイドパネル（Google Docs 型・一覧=詳細同居）
 *
 * コンテンツに紐づくコメントスレッドを縦並びカードで表示する。各カードは
 * その場で展開でき（複数同時展開可）、一覧を見ながら個別スレッドを操作できる。
 * 本文マーク選択中（activeMarkId）のカードは自動展開 + スクロールされる。
 */

"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMessage, IconX } from "@tabler/icons-react";
import { SCROLL_TO_MARK_COMMAND } from "@/admin/components/editor/lexical/plugins";
import { Button } from "@/admin/components/ui/button";
import { Skeleton } from "@/admin/components/ui/skeleton";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { Tabs, TabsList, TabsTrigger } from "@/admin/components/ui/tabs";
import {
  resolveThread,
  reopenThread,
  deleteThread,
  addComment,
  deleteComment,
  createCommentThread,
} from "@/admin/actions/editor-comment";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";
import type {
  EditorCommentThread,
  CommentableContentType,
  ThreadListItem,
} from "@/admin/types/editor-comment";
import { CommentCard } from "./CommentCard";
import { CommentForm } from "./CommentForm";
import { toggleExpanded, withActiveExpanded } from "./comment-panel-state";

type CommentPanelProps = {
  /** パネルの表示状態 */
  isOpen: boolean;
  contentType: CommentableContentType;
  contentId: string;
  activeMarkId?: string | null;
  onClose?: () => void;
  pendingComment?: {
    markId: string;
    quotedText: string;
  } | null;
  onPendingCommentSubmit?: (comment: string) => void;
};

const TAB_VALUES = ["active", "resolved"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const TAB_VALUE_SET = new Set<string>(TAB_VALUES);
function isTabValue(value: string): value is TabValue {
  return TAB_VALUE_SET.has(value);
}

type ThreadsByStatus = {
  active: ThreadListItem[];
  resolved: ThreadListItem[];
};

const EMPTY_THREADS: ThreadsByStatus = { active: [], resolved: [] };

async function fetchCommentThreads(params: {
  contentType: CommentableContentType;
  contentId: string;
  status: "ACTIVE" | "RESOLVED";
}): Promise<ThreadListItem[]> {
  const searchParams = new URLSearchParams({
    contentType: params.contentType,
    contentId: params.contentId,
    status: params.status,
  });
  return fetchAdminJson(
    `/admin/api/editor-comments/threads?${searchParams.toString()}`,
  );
}

async function fetchThreadDetail(
  threadId: string,
): Promise<EditorCommentThread> {
  return fetchAdminJson(`/admin/api/editor-comments/threads/${threadId}`);
}

export function CommentPanel({
  isOpen,
  contentType,
  contentId,
  activeMarkId,
  onClose,
  pendingComment,
  onPendingCommentSubmit,
}: CommentPanelProps) {
  const [tab, setTab] = useState<TabValue>("active");
  const [threadsByStatus, setThreadsByStatus] =
    useState<ThreadsByStatus>(EMPTY_THREADS);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [detailMap, setDetailMap] = useState<
    Record<string, EditorCommentThread>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const [editor] = useLexicalComposerContext();
  const cardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const threads =
    tab === "active" ? threadsByStatus.active : threadsByStatus.resolved;
  const allThreads = [...threadsByStatus.active, ...threadsByStatus.resolved];

  // active カードの展開は render 時に derive（setState 不要）。
  // ユーザーの手動トグルは expandedIds、active 由来の展開はここで union する。
  const effectiveExpanded = withActiveExpanded(
    expandedIds,
    activeMarkId,
    allThreads,
  );

  // 一覧（active / resolved 両方）を取得
  const loadThreads = async () => {
    const [active, resolved] = await Promise.all([
      fetchCommentThreads({ contentType, contentId, status: "ACTIVE" }),
      fetchCommentThreads({ contentType, contentId, status: "RESOLVED" }),
    ]);
    setThreadsByStatus({ active, resolved });
  };

  // detail を lazy fetch（未取得時のみ）
  const ensureDetail = async (threadId: string) => {
    if (detailMap[threadId]) return;
    try {
      const detail = await fetchThreadDetail(threadId);
      setDetailMap((prev) => ({ ...prev, [threadId]: detail }));
    } catch {
      // 展開時 detail 取得は best-effort（一覧は表示済み）
    }
  };

  // 初回・コンテンツ変更時に一覧取得
  useEffect(() => {
    let ignore = false;
    startTransition(async () => {
      setIsLoading(true);
      try {
        const [active, resolved] = await Promise.all([
          fetchCommentThreads({ contentType, contentId, status: "ACTIVE" }),
          fetchCommentThreads({ contentType, contentId, status: "RESOLVED" }),
        ]);
        if (!ignore) setThreadsByStatus({ active, resolved });
      } catch (error) {
        if (!ignore) {
          toast.error(
            error instanceof Error
              ? error.message
              : "コメントの取得に失敗しました",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [contentType, contentId]);

  // activeMarkId 変化に追従してタブを切り替える（render 時 state 調整）。
  // 公式「Adjusting state during render」パターン（set-state-in-effect 回避）。
  const [prevActiveMarkId, setPrevActiveMarkId] = useState(activeMarkId);
  if (activeMarkId !== prevActiveMarkId) {
    setPrevActiveMarkId(activeMarkId);
    if (activeMarkId) {
      const match = allThreads.find((t) => t.markId === activeMarkId);
      if (match) {
        const target = match.status === "RESOLVED" ? "resolved" : "active";
        if (tab !== target) setTab(target);
      }
    }
  }

  // activeMarkId 変化時に該当カードへスクロール（副作用は scroll のみ。
  // detail 取得は CommentCard が onNeedDetail で自律的に要求する）。
  const scrollToActive = useEffectEvent((markId: string) => {
    const match = allThreads.find((t) => t.markId === markId);
    if (!match) return;
    requestAnimationFrame(() => {
      cardElementsRef.current
        .get(match.id)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
  useEffect(() => {
    if (activeMarkId) scrollToActive(activeMarkId);
  }, [activeMarkId]);

  // ↑/↓: 隣接カードのトグルボタンへフォーカス移動（Google Docs の next/prev comment 相当）
  const handleNavigate = (threadId: string, dir: -1 | 1) => {
    const index = threads.findIndex((t) => t.id === threadId);
    if (index === -1) return;
    const target = threads[index + dir];
    if (!target) return;
    const toggle = cardElementsRef.current
      .get(target.id)
      ?.querySelector<HTMLButtonElement>("button[aria-expanded]");
    toggle?.focus();
  };

  const handleToggle = (threadId: string) => {
    const willExpand = !expandedIds.has(threadId);
    setExpandedIds((prev) => toggleExpanded(prev, threadId));
    // detail 取得は CommentCard が展開時に onNeedDetail で要求する。
    // 展開時はカード → 本文の双方向同期（該当マークへスクロール + フラッシュ）。
    if (willExpand) {
      const markId = allThreads.find((t) => t.id === threadId)?.markId;
      if (markId) editor.dispatchCommand(SCROLL_TO_MARK_COMMAND, markId);
    }
  };

  const collapseAndForget = (threadId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(threadId);
      return next;
    });
    setDetailMap((prev) => {
      const { [threadId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleResolve = (threadId: string) => {
    startTransition(async () => {
      const result = await resolveThread(threadId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("スレッドを解決しました");
      collapseAndForget(threadId);
      startTransition(() => {
        void loadThreads();
      });
    });
  };

  const handleReopen = (threadId: string) => {
    startTransition(async () => {
      const result = await reopenThread(threadId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("スレッドを再オープンしました");
      collapseAndForget(threadId);
      startTransition(() => {
        void loadThreads();
      });
    });
  };

  const handleDeleteThread = (threadId: string) => {
    startTransition(async () => {
      const result = await deleteThread(threadId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("スレッドを削除しました");
      collapseAndForget(threadId);
      startTransition(() => {
        void loadThreads();
      });
    });
  };

  const handleAddReply = async (threadId: string, content: string) => {
    const result = await addComment({ threadId, content });
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    const detail = await fetchThreadDetail(threadId);
    setDetailMap((prev) => ({ ...prev, [threadId]: detail }));
    await loadThreads();
  };

  const handleDeleteComment = (commentId: string, threadId: string) => {
    startTransition(async () => {
      const result = await deleteComment(commentId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      const detail = await fetchThreadDetail(threadId);
      setDetailMap((prev) => ({ ...prev, [threadId]: detail }));
      await loadThreads();
    });
  };

  const handlePendingCommentSubmit = async (content: string) => {
    if (!pendingComment) return;
    const result = await createCommentThread({
      markId: pendingComment.markId,
      contentType,
      contentId,
      quotedText: pendingComment.quotedText,
      initialComment: content,
    });
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    toast.success("コメントを追加しました");
    onPendingCommentSubmit?.(content);
    await loadThreads();
  };

  const activeCount = threadsByStatus.active.length;
  const resolvedCount = threadsByStatus.resolved.length;
  const emptyMessage =
    tab === "active"
      ? "未解決のコメントはありません"
      : "解決済みのコメントはありません";

  return (
    <aside
      aria-label="コメントパネル"
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={cn(
        // ブロック設定（Inspector）と同じ in-flow モデル: ツールバー下〜カード下端で h-full、
        // 開閉は width トランジションで右からのスライド感を維持（fixed オーバーレイ廃止）。
        "h-full min-h-0 shrink-0 overflow-hidden bg-background transition-[width] duration-200 ease-out",
        isOpen ? "w-[420px] border-l border-border" : "w-0 border-l-0",
      )}
    >
      {/* 固定幅の内側ラッパー: width アニメーション中も内容がリフローしない */}
      <div className="flex h-full w-[420px] flex-col">
        {/* ヘッダー（Inspector と同じ帯: border-b / px-2 py-1.5 / text-xs） */}
        <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border px-2 py-1.5">
          <span className="flex items-center gap-1.5 pl-1 text-xs font-medium text-foreground">
            <IconMessage className="h-4 w-4" aria-hidden="true" />
            コメント
          </span>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="コメントパネルを閉じる"
              title="コメントパネルを閉じる"
            >
              <IconX className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* 新規コメント入力（pendingComment がある場合） */}
        {pendingComment && (
          <div className="border-b border-border p-3">
            <div className="rounded-lg border border-primary bg-primary/5 p-3">
              <p className="mb-2 text-sm text-muted-foreground">
                &ldquo;
                {pendingComment.quotedText.length > 100
                  ? `${pendingComment.quotedText.slice(0, 100)}...`
                  : pendingComment.quotedText}
                &rdquo;
              </p>
              <CommentForm
                onSubmit={handlePendingCommentSubmit}
                placeholder="コメントを入力..."
                autoFocus
              />
            </div>
          </div>
        )}

        {/* タブ + カードリスト */}
        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (isTabValue(v)) setTab(v);
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2">
            <TabsTrigger value="active" className="gap-1">
              未解決
              {activeCount > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {activeCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved" className="gap-1">
              解決済み
              {resolvedCount > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {resolvedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="space-y-3">
                {skeletonKeys(3, "comment").map((key) => (
                  <Skeleton key={key} className="h-20 w-full" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    ref={(el) => {
                      if (el) cardElementsRef.current.set(thread.id, el);
                      else cardElementsRef.current.delete(thread.id);
                    }}
                  >
                    <CommentCard
                      thread={thread}
                      detail={detailMap[thread.id]}
                      isExpanded={effectiveExpanded.has(thread.id)}
                      isActive={thread.markId === activeMarkId}
                      onToggle={handleToggle}
                      onNeedDetail={ensureDetail}
                      onNavigate={handleNavigate}
                      {...(thread.status === "ACTIVE" && {
                        onResolve: handleResolve,
                      })}
                      {...(thread.status === "RESOLVED" && {
                        onReopen: handleReopen,
                      })}
                      onDelete={handleDeleteThread}
                      onAddReply={handleAddReply}
                      onDeleteComment={handleDeleteComment}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </aside>
  );
}
