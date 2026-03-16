/**
 * Comment Plugin
 *
 * @description Lexical MarkNode を使用したコメント機能を提供するプラグイン
 *
 * 公式推奨パターン: @lexical/mark を使用してテキストにマークを追加
 * @see https://lexical.dev/docs/concepts/serialization#mark-nodes
 */

"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type EditorState,
  type LexicalCommand,
  type LexicalEditor,
  mergeRegister,
  type LexicalNode,
} from "lexical";
import {
  $getMarkIDs,
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from "@lexical/mark";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/admin/components/ui/button";

// =============================================================================
// Types & Commands
// =============================================================================

export type AddCommentPayload = {
  markId: string;
  quotedText: string;
};

export const ADD_COMMENT_COMMAND: LexicalCommand<AddCommentPayload> =
  createCommand("ADD_COMMENT_COMMAND");

export const REMOVE_COMMENT_COMMAND: LexicalCommand<string> = createCommand(
  "REMOVE_COMMENT_COMMAND",
);

export const CLICK_MARK_COMMAND: LexicalCommand<string> =
  createCommand("CLICK_MARK_COMMAND");

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * ユニークなマークIDを生成
 */
export function generateMarkId(): string {
  return `mark_${crypto.randomUUID()}`;
}

/**
 * 選択範囲のテキストを取得
 */
function getSelectedText(editor: LexicalEditor): string {
  let selectedText = "";

  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selectedText = selection.getTextContent();
    }
  });

  return selectedText;
}

// =============================================================================
// Hook: useComment
// =============================================================================

export type UseCommentReturn = {
  canAddComment: boolean;
  addComment: () => AddCommentPayload | null;
  activeMarkIds: string[];
};

export function useComment(): UseCommentReturn {
  const [editor] = useLexicalComposerContext();
  const [canAddComment, setCanAddComment] = useState(false);
  const [activeMarkIds, setActiveMarkIds] = useState<string[]>([]);

  const syncCommentState = useEffectEvent((editorState: EditorState) => {
    editorState.read(() => {
      const selection = $getSelection();
      const isRangeSelected = $isRangeSelection(selection);

      // eslint-disable-next-line @eslint-react/set-state-in-effect -- runs from a Lexical listener through useEffectEvent, not directly from an effect body
      setCanAddComment(isRangeSelected && !selection.isCollapsed());

      if (!isRangeSelected) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- runs from a Lexical listener through useEffectEvent, not directly from an effect body
        setActiveMarkIds([]);
        return;
      }

      const anchorNode = selection.anchor.getNode();
      if ($isTextNode(anchorNode)) {
        const markIds = $getMarkIDs(anchorNode, selection.anchor.offset);
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- runs from a Lexical listener through useEffectEvent, not directly from an effect body
        setActiveMarkIds(markIds ?? []);
      } else {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- runs from a Lexical listener through useEffectEvent, not directly from an effect body
        setActiveMarkIds([]);
      }
    });
  });

  // 選択状態の監視
  useEffect(() => {
    syncCommentState(editor.getEditorState());

    return editor.registerUpdateListener(({ editorState }) => {
      syncCommentState(editorState);
    });
  }, [editor]);

  // コメントを追加
  const addComment = (): AddCommentPayload | null => {
    const quotedText = getSelectedText(editor);
    if (!quotedText) return null;

    const markId = generateMarkId();

    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $wrapSelectionInMarkNode(selection, selection.isBackward(), markId);
      }
    });

    return { markId, quotedText };
  };

  return { canAddComment, addComment, activeMarkIds };
}

// =============================================================================
// Component: CommentButton (for Floating Toolbar)
// =============================================================================

type CommentButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export function CommentButton({ onClick, disabled }: CommentButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      disabled={disabled}
      aria-label="コメントを追加"
      title="コメントを追加"
    >
      <MessageSquarePlus className="h-4 w-4" />
    </Button>
  );
}

// =============================================================================
// Plugin: CommentPlugin
// =============================================================================

type CommentPluginProps = {
  onMarkClick?: (markId: string) => void;
};

export function CommentPlugin({ onMarkClick }: CommentPluginProps) {
  const [editor] = useLexicalComposerContext();
  // イベントリスナーを追跡してクリーンアップ
  const clickListenersRef = useRef<Map<string, () => void>>(new Map());
  const handleMarkClick = useEffectEvent((markId: string) => {
    onMarkClick?.(markId);
  });

  // マーククリックのリスナー登録
  useEffect(() => {
    const clickListeners = clickListenersRef.current;

    return mergeRegister(
      // マーククリックコマンド
      editor.registerCommand(
        CLICK_MARK_COMMAND,
        (markId) => {
          handleMarkClick(markId);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // コメント追加コマンド
      editor.registerCommand(
        ADD_COMMENT_COMMAND,
        (payload) => {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              $wrapSelectionInMarkNode(
                selection,
                selection.isBackward(),
                payload.markId,
              );
            }
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // コメント削除コマンド
      editor.registerCommand(
        REMOVE_COMMENT_COMMAND,
        (markId) => {
          editor.update(() => {
            const markNodeMap = $getMarkNodesInDocument();
            const markNodes = markNodeMap.get(markId);
            if (markNodes) {
              for (const markNode of markNodes) {
                $unwrapMarkNode(markNode);
              }
            }
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // マークノードのクリックイベントをキャプチャ
      editor.registerMutationListener(MarkNode, (mutations) => {
        for (const [nodeKey, mutation] of mutations) {
          // 削除時: イベントリスナーをクリーンアップ
          if (mutation === "destroyed") {
            const listener = clickListeners.get(nodeKey);
            if (listener) {
              const element = editor.getElementByKey(nodeKey);
              element?.removeEventListener("click", listener);
              clickListeners.delete(nodeKey);
            }
          } else if (mutation === "created" || mutation === "updated") {
            // 既存のリスナーがあれば削除
            const existingListener = clickListeners.get(nodeKey);
            if (existingListener) {
              const element = editor.getElementByKey(nodeKey);
              element?.removeEventListener("click", existingListener);
            }

            const element = editor.getElementByKey(nodeKey);
            if (element) {
              const listener = () => {
                editor.getEditorState().read(() => {
                  const node = $getNodeByKey(nodeKey);
                  if ($isMarkNode(node)) {
                    const ids = node.getIDs();
                    const firstId = ids[0];
                    if (firstId) {
                      editor.dispatchCommand(CLICK_MARK_COMMAND, firstId);
                    }
                  }
                });
              };
              // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener -- cleanup is handled via clickListeners Map (lines below)
              element.addEventListener("click", listener);
              clickListeners.set(nodeKey, listener);
            }
          }
        }
      }),
      // コンポーネントアンマウント時に全リスナーをクリーンアップ
      () => {
        for (const [nodeKey, listener] of clickListeners) {
          const element = editor.getElementByKey(nodeKey);
          element?.removeEventListener("click", listener);
        }
        clickListeners.clear();
      },
    );
  }, [editor]);

  return null;
}

// =============================================================================
// Utility: Get all MarkNodes in document
// =============================================================================

function $getMarkNodesInDocument(): Map<string, MarkNode[]> {
  const markNodeMap = new Map<string, MarkNode[]>();
  const root = $getRoot();

  // DFS でルートからすべてのノードを走査
  const traverse = (node: LexicalNode) => {
    if ($isMarkNode(node)) {
      const ids = node.getIDs();
      for (const id of ids) {
        const existing = markNodeMap.get(id) ?? [];
        existing.push(node);
        markNodeMap.set(id, existing);
      }
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        traverse(child);
      }
    }
  };

  for (const child of root.getChildren()) {
    traverse(child);
  }

  return markNodeMap;
}

// =============================================================================
// Hook: useMarkIds - Get all mark IDs in the current document
// =============================================================================

export function useMarkIds(): string[] {
  const [editor] = useLexicalComposerContext();
  const [markIds, setMarkIds] = useState<string[]>([]);
  const updateMarkIds = useEffectEvent((editorState?: EditorState) => {
    const currentEditorState = editorState ?? editor.getEditorState();
    currentEditorState.read(() => {
      const ids = new Set<string>();
      const markNodeMap = $getMarkNodesInDocument();
      for (const [id] of markNodeMap) {
        ids.add(id);
      }
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- runs from a Lexical listener through useEffectEvent, not directly from an effect body
      setMarkIds([...ids]);
    });
  });

  useEffect(() => {
    updateMarkIds();

    return editor.registerUpdateListener(({ editorState }) => {
      updateMarkIds(editorState);
    });
  }, [editor]);

  return markIds;
}
