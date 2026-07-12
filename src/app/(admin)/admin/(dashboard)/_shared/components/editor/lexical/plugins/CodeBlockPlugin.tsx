/**
 * IconCode Block Plugin
 *
 * @description コードブロック強化プラグイン（言語セレクタ + コピーボタン）
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { createPortal } from "react-dom";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

// =============================================================================
// Constants
// =============================================================================

const CODE_LANGUAGES: Record<string, string> = {
  "": "プレーン",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  sql: "SQL",
  bash: "Bash",
  go: "Go",
  rust: "Rust",
  java: "Java",
  php: "PHP",
  ruby: "Ruby",
  yaml: "YAML",
  markdown: "Markdown",
  xml: "XML",
};

// =============================================================================
// Floating Code Toolbar
// =============================================================================

function CodeToolbar({
  codeNode,
  anchorElem,
}: {
  codeNode: { key: string; language: string; element: HTMLElement };
  anchorElem: HTMLElement;
}) {
  const [editor] = useLexicalComposerContext();
  const [copied, setCopied] = useState(false);

  const handleLanguageChange = (lang: string) => {
    editor.update(() => {
      const node = $getNodeByKey(codeNode.key);
      if ($isCodeNode(node)) {
        node.setLanguage(lang);
      }
    });
  };

  const handleCopy = () => {
    editor.read(() => {
      const node = $getNodeByKey(codeNode.key);
      if ($isCodeNode(node)) {
        const text = node.getTextContent();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }
    });
  };

  const rect = codeNode.element.getBoundingClientRect();
  const anchorRect = anchorElem.getBoundingClientRect();

  return createPortal(
    <div
      className="absolute z-50 flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-0.5 shadow-sm backdrop-blur-sm"
      style={{
        top: `${rect.top - anchorRect.top}px`,
        right: `${anchorRect.right - rect.right}px`,
      }}
    >
      <select
        value={codeNode.language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        aria-label="コードブロックのプログラミング言語"
        className="h-6 rounded border-none bg-transparent px-1 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {Object.entries(CODE_LANGUAGES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title="コードをコピー"
        aria-label="コードをコピー"
      >
        {copied ? (
          <IconCheck className="h-3 w-3 text-success" />
        ) : (
          <IconCopy className="h-3 w-3" />
        )}
      </Button>
    </div>,
    anchorElem,
  );
}

// =============================================================================
// Plugin
// =============================================================================

export function CodeBlockPlugin({
  anchorElem,
}: {
  anchorElem: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const [selectedCode, setSelectedCode] = useState<{
    key: string;
    language: string;
    element: HTMLElement;
  } | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();
          const parent = anchorNode.getParent();
          if ($isCodeNode(parent)) {
            const element = editor.getElementByKey(parent.getKey());
            if (element) {
              setSelectedCode({
                key: parent.getKey(),
                language: parent.getLanguage() ?? "",
                element,
              });
              return;
            }
          }
          if ($isCodeNode(anchorNode)) {
            const element = editor.getElementByKey(anchorNode.getKey());
            if (element) {
              setSelectedCode({
                key: anchorNode.getKey(),
                language: anchorNode.getLanguage() ?? "",
                element,
              });
              return;
            }
          }
          setSelectedCode(null);
          return;
        }

        if (!$isNodeSelection(selection)) {
          setSelectedCode(null);
          return;
        }

        const nodes = selection.getNodes();
        const firstNode = nodes[0];
        if (firstNode && $isCodeNode(firstNode)) {
          const element = editor.getElementByKey(firstNode.getKey());
          if (element) {
            setSelectedCode({
              key: firstNode.getKey(),
              language: firstNode.getLanguage() ?? "",
              element,
            });
            return;
          }
        }
        setSelectedCode(null);
      });
    });
  }, [editor]);

  if (!selectedCode || !anchorElem) return null;

  return <CodeToolbar codeNode={selectedCode} anchorElem={anchorElem} />;
}
