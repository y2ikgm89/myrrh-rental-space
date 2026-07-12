/**
 * Find & IconReplace Plugin
 *
 * @description 検索・置換機能を提供するプラグイン
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { cn } from "@/shared/lib/cn";
import {
  $getRoot,
  $isTextNode,
  $isElementNode,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
  type TextNode,
  type LexicalNode,
} from "lexical";
import { createPortal } from "react-dom";
import {
  IconSearch,
  IconReplace,
  IconChevronUp,
  IconChevronDown,
  IconX,
  IconLetterCase,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { Input } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type Match = {
  node: TextNode;
  startOffset: number;
  endOffset: number;
};

// =============================================================================
// Utilities
// =============================================================================

function getAllTextNodes(rootNode: LexicalNode): TextNode[] {
  const textNodes: TextNode[] = [];
  const queue: LexicalNode[] = [rootNode];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;

    if ($isTextNode(node)) {
      textNodes.push(node);
    }

    if ($isElementNode(node)) {
      queue.push(...node.getChildren());
    }
  }
  return textNodes;
}

function findMatches(
  textNodes: TextNode[],
  searchText: string,
  caseSensitive: boolean,
): Match[] {
  if (!searchText) return [];

  const matches: Match[] = [];
  const normalizedSearch = caseSensitive
    ? searchText
    : searchText.toLowerCase();

  for (const node of textNodes) {
    const text = node.getTextContent();
    const normalizedText = caseSensitive ? text : text.toLowerCase();

    let startIndex = 0;
    while (startIndex < normalizedText.length) {
      const index = normalizedText.indexOf(normalizedSearch, startIndex);
      if (index === -1) break;

      matches.push({
        node,
        startOffset: index,
        endOffset: index + searchText.length,
      });
      startIndex = index + 1;
    }
  }

  return matches;
}

// =============================================================================
// Find Replace Panel
// =============================================================================

function FindIconReplacePanel({
  onClose,
  anchorElem,
}: {
  onClose: () => void;
  anchorElem: HTMLElement;
}) {
  const [editor] = useLexicalComposerContext();
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showIconReplace, setShowIconReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 検索結果を更新
  useEffect(() => {
    if (!searchText) {
      return () => {
        setMatchCount(0);
        setCurrentMatchIndex(0);
      };
    }

    editor.read(() => {
      const root = $getRoot();
      const textNodes = getAllTextNodes(root);
      const matches = findMatches(textNodes, searchText, caseSensitive);
      setMatchCount(matches.length);
      if (matches.length > 0 && currentMatchIndex >= matches.length) {
        setCurrentMatchIndex(0);
      }
    });
  }, [editor, searchText, caseSensitive, currentMatchIndex]);

  // ESCで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // マウント時にフォーカス
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const goToNext = () => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
  };

  const goToPrevious = () => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  };

  const handleIconReplace = () => {
    if (matchCount === 0 || !searchText) return;

    editor.update(() => {
      const root = $getRoot();
      const textNodes = getAllTextNodes(root);
      const matches = findMatches(textNodes, searchText, caseSensitive);
      const match = matches[currentMatchIndex];
      if (!match) return;

      const targetNode = match.node;
      const text = targetNode.getTextContent();
      const before = text.slice(0, match.startOffset);
      const after = text.slice(match.endOffset);
      const newText = before + replaceText + after;

      // テキストノードの内容を更新
      targetNode.setTextContent(newText);
    });
  };

  const handleIconReplaceAll = () => {
    if (matchCount === 0 || !searchText) return;

    editor.update(() => {
      const root = $getRoot();
      const textNodes = getAllTextNodes(root);

      // 逆順で置換（オフセットがずれないように）
      for (const node of textNodes) {
        const text = node.getTextContent();
        const normalizedSearch = caseSensitive
          ? searchText
          : searchText.toLowerCase();
        const normalizedText = caseSensitive ? text : text.toLowerCase();

        if (normalizedText.includes(normalizedSearch)) {
          let result = "";
          let lastIndex = 0;

          let startIdx = 0;
          while (startIdx < normalizedText.length) {
            const index = normalizedText.indexOf(normalizedSearch, startIdx);
            if (index === -1) break;

            result += text.slice(lastIndex, index) + replaceText;
            lastIndex = index + searchText.length;
            startIdx = index + 1;
          }
          result += text.slice(lastIndex);

          node.setTextContent(result);
        }
      }
    });

    setCurrentMatchIndex(0);
  };

  return createPortal(
    <div className="absolute top-0 right-0 z-50 m-2 rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-center gap-1.5 p-2">
        <div className="relative flex-1">
          <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void (e.shiftKey ? goToPrevious() : goToNext());
                e.preventDefault();
              }
            }}
            placeholder="検索..."
            className="h-11 pl-7 pr-2 text-xs w-48"
          />
        </div>

        {searchText && (
          <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[3.5rem] text-center">
            {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : "0件"}
          </span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="大文字小文字を区別"
          aria-label="大文字小文字を区別"
          aria-pressed={caseSensitive}
        >
          <IconLetterCase
            className={cn(
              "h-3.5 w-3.5",
              caseSensitive ? "text-primary" : "text-muted-foreground",
            )}
          />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={goToPrevious}
          disabled={matchCount === 0}
          title="前の一致"
          aria-label="前の一致"
        >
          <IconChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={goToNext}
          disabled={matchCount === 0}
          title="次の一致"
          aria-label="次の一致"
        >
          <IconChevronDown className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setShowIconReplace(!showIconReplace)}
          title="置換"
          aria-label="置換"
          aria-pressed={showIconReplace}
          aria-expanded={showIconReplace}
        >
          <IconReplace className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={onClose}
          title="検索を閉じる"
          aria-label="検索を閉じる"
        >
          <IconX className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showIconReplace && (
        <div className="flex items-center gap-1.5 px-2 pb-2">
          <Input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="置換..."
            className="h-11 text-xs flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs px-2"
            onClick={handleIconReplace}
            disabled={matchCount === 0}
          >
            置換
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs px-2"
            onClick={handleIconReplaceAll}
            disabled={matchCount === 0}
          >
            全置換
          </Button>
        </div>
      )}
    </div>,
    anchorElem,
  );
}

// =============================================================================
// Plugin
// =============================================================================

export function FindReplacePlugin({
  anchorElem,
}: {
  anchorElem: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        // Ctrl+F: 検索
        if ((event.ctrlKey || event.metaKey) && event.key === "f") {
          event.preventDefault();
          setIsOpen(true);
          return true;
        }
        // Ctrl+H: 置換
        if ((event.ctrlKey || event.metaKey) && event.key === "h") {
          event.preventDefault();
          setIsOpen(true);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  if (!isOpen || !anchorElem) return null;

  return (
    <FindIconReplacePanel
      onClose={() => setIsOpen(false)}
      anchorElem={anchorElem}
    />
  );
}
