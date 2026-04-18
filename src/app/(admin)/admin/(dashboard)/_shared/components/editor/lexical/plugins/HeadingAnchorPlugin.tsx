"use client";

/**
 * HeadingAnchorPlugin
 *
 * CustomHeadingNode の `anchorId` を textContent から自動生成する Node Transform。
 *
 * Lexical 公式 Node Transforms パターン（updateListener 内 editor.update の
 * 非推奨回避）。dirty heading が検出されるたびに **ドキュメント全体の heading を
 * 走査**して slug を再計算する（重複見出しの `-1`/`-2` 付番を整合させるため）。
 *
 * `generateUniqueSlug` は deterministic（ランダム値なし）なので、
 * anchor がすでに正しい場合は $setState を呼ばず、Transform の無限ループを防ぐ。
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $getState, $setState, $isElementNode } from "lexical";
import type { LexicalNode } from "lexical";
import {
  CustomHeadingNode,
  $isCustomHeadingNode,
  anchorIdState,
} from "../nodes/CustomHeadingNode";
import { generateUniqueSlug } from "@/shared/lib/slug";

function collectHeadings(root: LexicalNode): CustomHeadingNode[] {
  const out: CustomHeadingNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isCustomHeadingNode(node)) out.push(node);
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) walk(child);
    }
  };
  walk(root);
  return out;
}

export function HeadingAnchorPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(CustomHeadingNode, (_node) => {
      // Lexical 公式型 `(node: T) => void` に準拠。_node は dirty heading で
      // あるが、重複解決のためドキュメント全体を走査する必要があるので未使用。
      const headings = collectHeadings($getRoot());
      const used = new Set<string>();

      for (const heading of headings) {
        const text = heading.getTextContent().trim();
        if (!text) {
          // 空見出しは anchorId をクリア（DOM 要素が増えたときの残骸を除去）
          const current = $getState(heading, anchorIdState);
          if (current !== "") $setState(heading, anchorIdState, "");
          continue;
        }

        const desired = generateUniqueSlug(text, used, "heading");
        used.add(desired);

        const current = $getState(heading, anchorIdState);
        if (current !== desired) {
          $setState(heading, anchorIdState, desired);
        }
      }
    });
  }, [editor]);

  return null;
}
