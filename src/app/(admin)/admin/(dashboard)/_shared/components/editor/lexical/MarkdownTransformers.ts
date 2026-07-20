/**
 * Custom Markdown Transformers for Lexical Editor
 *
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/MarkdownTransformers/index.ts
 */

import {
  TRANSFORMERS,
  CHECK_LIST,
  HIGHLIGHT as LEXICAL_TEXT_FORMAT_HIGHLIGHT,
  isTableRowDivider,
  type ElementTransformer,
  type TextMatchTransformer,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from "@lexical/extension";
import {
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  $createTableRowNode,
  $isSimpleTable,
  TableRowNode,
  TableCellHeaderStates,
} from "@lexical/table";

import {
  $getState,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isTextNode,
  type LexicalNode,
} from "lexical";

import {
  $createImageNode,
  $isImageNode,
  altState,
  ImageNode,
  srcState,
} from "./nodes/ImageNode";
import {
  $createYouTubeNode,
  $isYouTubeNode,
  videoIdState,
  YouTubeNode,
} from "./nodes/YouTubeNode";
import {
  CustomTableNode,
  $createCustomTableNode,
} from "./nodes/CustomTableNode";
import {
  CustomTableCellNode,
  $createCustomTableCellNode,
} from "./nodes/CustomTableCellNode";
import {
  CalloutNode,
  $createCalloutNode,
  $isCalloutNode,
  calloutTypeState,
  isCalloutType,
} from "./nodes/CalloutNode";
import {
  PullQuoteNode,
  $createPullQuoteNode,
  $isPullQuoteNode,
} from "./nodes/PullQuoteNode";
import {
  PullQuoteTextNode,
  $createPullQuoteTextNode,
  $isPullQuoteTextNode,
} from "./nodes/PullQuoteTextNode";
import {
  PullQuoteCitationNode,
  $createPullQuoteCitationNode,
  $isPullQuoteCitationNode,
} from "./nodes/PullQuoteCitationNode";
import {
  RubyNode,
  $createRubyNode,
  $isRubyNode,
  rubyBaseTextState,
  rubyTextState,
} from "./nodes/RubyNode";

// =============================================================================
// Validation Helpers
// =============================================================================

// YouTube Video ID: 11文字、英数字と_-のみ
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

function isValidYouTubeId(id: string): boolean {
  return YOUTUBE_ID_REGEX.test(id);
}

// 危険なURLスキームをブロック
function isValidImageUrl(url: string): boolean {
  if (!url || url.trim() === "") return false;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:"))
    return false;
  return true;
}

// =============================================================================
// Transformers
// =============================================================================

// ![alt](url) -> ImageNode
const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) =>
    $isImageNode(node)
      ? `![${$getState(node, altState) || ""}](${$getState(node, srcState)})`
      : null,
  importRegExp: /!(?:\[([^\[\]]*)\])(?:\(([^()]+)\))/,
  regExp: /!(?:\[([^\[\]]*)\])(?:\(([^()]+)\))$/,
  replace: (textNode, match) => {
    const alt = match[1];
    const src = match[2];
    if (!src || !isValidImageUrl(src)) return;
    textNode.replace($createImageNode({ src: src.trim(), alt: alt ?? "" }));
  },
  trigger: ")",
  type: "text-match",
};

// @[youtube](videoId) -> YouTubeNode
const YOUTUBE: TextMatchTransformer = {
  dependencies: [YouTubeNode],
  export: (node) =>
    $isYouTubeNode(node)
      ? `@[youtube](${$getState(node, videoIdState)})`
      : null,
  importRegExp: /@\[youtube\]\(([A-Za-z0-9_-]{11})\)/,
  regExp: /@\[youtube\]\(([A-Za-z0-9_-]{11})\)$/,
  replace: (textNode, match) => {
    const videoId = match[1];
    if (!videoId || !isValidYouTubeId(videoId)) return;
    textNode.replace($createYouTubeNode({ videoId }));
  },
  trigger: ")",
  type: "text-match",
};

// @[ruby](baseText|rubyText) -> RubyNode（ふりがな）
const RUBY: TextMatchTransformer = {
  dependencies: [RubyNode],
  export: (node) =>
    $isRubyNode(node)
      ? `@[ruby](${$getState(node, rubyBaseTextState)}|${$getState(node, rubyTextState)})`
      : null,
  importRegExp: /@\[ruby\]\(([^|()]+)\|([^|()]+)\)/,
  regExp: /@\[ruby\]\(([^|()]+)\|([^|()]+)\)$/,
  replace: (textNode, match) => {
    const baseText = match[1];
    const rubyText = match[2];
    if (!baseText || !rubyText) return;
    textNode.replace($createRubyNode(baseText, rubyText));
  },
  trigger: ")",
  type: "text-match",
};

// --- or *** or ___ -> HorizontalRuleNode
const HR: ElementTransformer = {
  dependencies: [],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(?:---|\*\*\*|___)$/,
  replace: (parentNode, _children, _match, isImport) => {
    const hrNode = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(hrNode);
    } else {
      parentNode.insertBefore(hrNode);
    }
    hrNode.selectNext();
  },
  type: "element",
};

// =============================================================================
// Highlight（==text==）
//
// このエディタの「ハイライト」機能（HighlightPlugin.tsx）は Lexical の
// TextFormatType ではなく、$patchStyleText によるインライン style
// (background-color) で実装されている。そのため @lexical/markdown が提供する
// 既定の HIGHLIGHT（TextFormatTransformer, node.hasFormat('highlight') 判定）は
// このアプリでは常に false にしかならず実質無効。
// style ベースで動作する TextMatchTransformer を自前で用意し、既定の
// HIGHLIGHT は EDITOR_TRANSFORMERS から除外する（下記参照）。
// 色そのものは Markdown の `==...==` 記法では表現できないため、インポート時は
// 既定色（HighlightPlugin.tsx の HIGHLIGHT_COLORS.yellow と同値）を適用する。
// =============================================================================

const HIGHLIGHT_IMPORT_BACKGROUND_COLOR = "rgba(255, 235, 59, 0.4)";

function getBackgroundColorFromStyle(style: string): string | null {
  const match = /background-color:\s*([^;]+)/i.exec(style);
  if (!match) return null;
  const value = (match[1] ?? "").trim();
  if (
    !value ||
    value === "transparent" ||
    value === "inherit" ||
    value === "none"
  ) {
    return null;
  }
  return value;
}

const HIGHLIGHT: TextMatchTransformer = {
  dependencies: [],
  export: (node, _exportChildren, exportFormat) => {
    if (!$isTextNode(node)) return null;
    if (getBackgroundColorFromStyle(node.getStyle()) === null) return null;
    return `==${exportFormat(node, node.getTextContent())}==`;
  },
  importRegExp: /==([^=]+)==/,
  regExp: /==([^=]+)==$/,
  replace: (textNode, match) => {
    const content = match[1];
    if (!content) return;
    const highlighted = $createTextNode(content);
    highlighted.setStyle(
      `background-color: ${HIGHLIGHT_IMPORT_BACKGROUND_COLOR}`,
    );
    textNode.replace(highlighted);
    return highlighted;
  },
  trigger: "=",
  type: "text-match",
};

// =============================================================================
// Table（pipe-table 形式）
//
// rowspan/colspan（マージセル）を含む table は表現できないため export しない
// （$isSimpleTable で判定し、非対応時は null を返して素のテキスト書き出しに
// フォールバックする）。背景色・枠線などの装飾 state も Markdown では表現しない。
// =============================================================================

const TABLE_ROW_REGEX = /^\|(.*)\|[ \t]*$/;

function splitTableRowCells(rowContent: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < rowContent.length; i++) {
    const ch = rowContent[i];
    if (ch === "\\" && rowContent[i + 1] === "|") {
      current += "|";
      i++;
    } else if (ch === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

const TABLE: ElementTransformer = {
  dependencies: [CustomTableNode, TableRowNode, CustomTableCellNode],
  export: (node, exportChildren) => {
    if (!$isTableNode(node) || !$isSimpleTable(node)) return null;
    const rows = node.getChildren().filter($isTableRowNode);
    if (rows.length === 0) return null;

    const lines: string[] = [];
    rows.forEach((row, rowIndex) => {
      const cells = row.getChildren().filter($isTableCellNode);
      const cellTexts = cells.map((cell) =>
        exportChildren(cell)
          .replace(/\|/g, "\\|")
          .replace(/\r?\n/g, " ")
          .trim(),
      );
      lines.push(`| ${cellTexts.join(" | ")} |`);
      if (rowIndex === 0) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    });
    return lines.join("\n");
  },
  regExp: TABLE_ROW_REGEX,
  replace: (parentNode, _children, match, isImport) => {
    // ライブタイピングでの誤爆（"| a | b |" と打っただけでテーブル化される事故）を
    // 避けるため、Markdown インポート経由のみで有効化する
    if (!isImport) return false;

    // regExp は行全体 (^...$) にマッチするため match[0] がそのまま元の行になる
    const fullLine = match[0] ?? "";

    if (isTableRowDivider(fullLine)) {
      const previousNode = parentNode.getPreviousSibling();
      if ($isTableNode(previousNode)) {
        const lastRow = previousNode.getLastChild();
        if ($isTableRowNode(lastRow)) {
          for (const cell of lastRow.getChildren()) {
            if ($isTableCellNode(cell)) {
              cell.setHeaderStyles(
                TableCellHeaderStates.ROW,
                TableCellHeaderStates.ROW,
              );
            }
          }
        }
        parentNode.remove();
        return;
      }
      // divider 行の前にテーブル行がない = テーブルではない
      return false;
    }

    const cellTexts = splitTableRowCells(match[1] ?? "");
    const previousNode = parentNode.getPreviousSibling();

    const buildRow = () => {
      const row = $createTableRowNode();
      for (const text of cellTexts) {
        const cell = $createCustomTableCellNode(
          TableCellHeaderStates.NO_STATUS,
        );
        const paragraph = $createParagraphNode();
        if (text) paragraph.append($createTextNode(text));
        cell.append(paragraph);
        row.append(cell);
      }
      return row;
    };

    if ($isTableNode(previousNode)) {
      previousNode.append(buildRow());
      parentNode.remove();
      return;
    }

    const table = $createCustomTableNode();
    table.append(buildRow());
    parentNode.replace(table);
  },
  type: "element",
};

// =============================================================================
// Callout（> [!info] 形式の admonition）
// =============================================================================

// 公式 QUOTE_REGEX (`/^>\s/`) と同じ prefix 判定。CALLOUT / PULL_QUOTE を
// QUOTE より前に置くことで、それぞれのマーカー行・継続行を優先的に処理し、
// 該当しない場合のみ通常の blockquote (QUOTE) にフォールスルーする
const BLOCKQUOTE_LINE_REGEX = /^>\s/;
const CALLOUT_MARKER_REGEX = /^>\s\[!(info|warning|error|success)\]\s*$/i;

/**
 * ElementTransformer.replace の match は `string[]`（RegExpMatchArray ではない）
 * 型のため `.input` が使えない。BLOCKQUOTE_LINE_REGEX は行の prefix のみに
 * マッチする（regExp が `$` で終端していない）ため、マッチした prefix
 * (match[0]) と、既に prefix を除去済みの children のテキストを連結して
 * 元の行全体を復元する
 */
function reconstructFullLine(
  matchedPrefix: string,
  children: readonly LexicalNode[],
): string {
  return (
    matchedPrefix + children.map((child) => child.getTextContent()).join("")
  );
}

const CALLOUT: ElementTransformer = {
  dependencies: [CalloutNode],
  export: (node, exportChildren) => {
    if (!$isCalloutNode(node)) return null;
    const calloutType = $getState(node, calloutTypeState);
    const paragraphs = node
      .getChildren()
      .map((child) => ($isElementNode(child) ? exportChildren(child) : ""));
    const bodyLines = paragraphs.length > 0 ? paragraphs : [""];
    return [`[!${calloutType}]`, ...bodyLines]
      .map((line) => (line.length > 0 ? `> ${line}` : ">"))
      .join("\n");
  },
  regExp: BLOCKQUOTE_LINE_REGEX,
  replace: (parentNode, children, match, isImport) => {
    if (!isImport) return false;

    const fullLine = reconstructFullLine(match[0] ?? "", children);
    const markerMatch = CALLOUT_MARKER_REGEX.exec(fullLine);

    if (markerMatch) {
      const calloutTypeCandidate = (markerMatch[1] ?? "").toLowerCase();
      if (!isCalloutType(calloutTypeCandidate)) return false;
      const callout = $createCalloutNode(calloutTypeCandidate);
      callout.append($createParagraphNode());
      parentNode.replace(callout);
      return;
    }

    const previousNode = parentNode.getPreviousSibling();
    if (!$isCalloutNode(previousNode)) return false;

    const lastChild = previousNode.getLastChild();
    if ($isElementNode(lastChild) && lastChild.getChildrenSize() === 0) {
      lastChild.append(...children);
    } else {
      const paragraph = $createParagraphNode();
      paragraph.append(...children);
      previousNode.append(paragraph);
    }
    parentNode.remove();
  },
  type: "element",
};

// =============================================================================
// PullQuote（> [!pull-quote] / > [!pull-quote-citation] の blockquote 変種）
//
// quoteStyle / pullQuoteColor / showMark などの装飾 state は Markdown では
// 表現しない（Inspector パネルで再設定する想定）。引用テキストと出典の
// テキスト内容のみを保持する
// =============================================================================

const PULL_QUOTE_TEXT_MARKER_REGEX = /^>\s\[!pull-quote\]\s*$/i;
const PULL_QUOTE_CITATION_MARKER_REGEX = /^>\s\[!pull-quote-citation\]\s*$/i;

const PULL_QUOTE: ElementTransformer = {
  dependencies: [PullQuoteNode, PullQuoteTextNode, PullQuoteCitationNode],
  export: (node, exportChildren) => {
    if (!$isPullQuoteNode(node)) return null;
    const textNode = node.getChildren().find($isPullQuoteTextNode);
    const citationNode = node.getChildren().find($isPullQuoteCitationNode);
    if (!textNode) return null;

    const textLines = textNode
      .getChildren()
      .map((child) => ($isElementNode(child) ? exportChildren(child) : ""));
    const lines = [
      "[!pull-quote]",
      ...(textLines.length > 0 ? textLines : [""]),
    ];

    if (citationNode) {
      const citationLines = citationNode
        .getChildren()
        .map((child) => ($isElementNode(child) ? exportChildren(child) : ""));
      lines.push(
        "[!pull-quote-citation]",
        ...(citationLines.length > 0 ? citationLines : [""]),
      );
    }

    return lines
      .map((line) => (line.length > 0 ? `> ${line}` : ">"))
      .join("\n");
  },
  regExp: BLOCKQUOTE_LINE_REGEX,
  replace: (parentNode, children, match, isImport) => {
    if (!isImport) return false;

    const fullLine = reconstructFullLine(match[0] ?? "", children);

    if (PULL_QUOTE_TEXT_MARKER_REGEX.test(fullLine)) {
      const pullQuote = $createPullQuoteNode();
      const textNode = $createPullQuoteTextNode();
      textNode.append($createParagraphNode());
      pullQuote.append(textNode);
      parentNode.replace(pullQuote);
      return;
    }

    const previousNode = parentNode.getPreviousSibling();
    if (!$isPullQuoteNode(previousNode)) return false;

    if (PULL_QUOTE_CITATION_MARKER_REGEX.test(fullLine)) {
      const citation = $createPullQuoteCitationNode();
      citation.append($createParagraphNode());
      previousNode.append(citation);
      parentNode.remove();
      return;
    }

    const target = previousNode.getLastChild();
    if (!$isPullQuoteTextNode(target) && !$isPullQuoteCitationNode(target)) {
      return false;
    }

    const lastChild = target.getLastChild();
    if ($isElementNode(lastChild) && lastChild.getChildrenSize() === 0) {
      lastChild.append(...children);
    } else {
      const paragraph = $createParagraphNode();
      paragraph.append(...children);
      target.append(paragraph);
    }
    parentNode.remove();
  },
  type: "element",
};

export const EDITOR_TRANSFORMERS = [
  IMAGE,
  YOUTUBE,
  RUBY,
  HIGHLIGHT,
  TABLE,
  CALLOUT,
  PULL_QUOTE,
  HR,
  // CHECK_LIST は UNORDERED_LIST（TRANSFORMERS 内）より前に置く必要がある。
  // "- [ ] foo" は両方の regExp にマッチするため、後者が先に来ると
  // チェック状態を失った素の bullet list として吸収されてしまう
  CHECK_LIST,
  // 既定の HIGHLIGHT（TextFormatType 版、このアプリでは無効）は自前の
  // style ベース HIGHLIGHT と重複するため除外する
  ...TRANSFORMERS.filter(
    (transformer) => transformer !== LEXICAL_TEXT_FORMAT_HIGHLIGHT,
  ),
];
