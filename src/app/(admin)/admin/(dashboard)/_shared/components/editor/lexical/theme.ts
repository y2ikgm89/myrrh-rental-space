/**
 * Lexical Editor テーマ定義
 *
 * @description Tailwind CSSクラスをLexicalテーマにマッピング
 */

import type { EditorThemeClasses } from "lexical";

/**
 * Lexicalエディタのテーマ設定
 *
 * Tailwind CSSクラスを使用してスタイリング
 */
export const editorTheme: EditorThemeClasses = {
  // テキストフォーマット
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    underlineStrikethrough: "underline line-through",
    code: "font-mono bg-muted px-1 py-0.5 rounded text-sm",
  },

  // 見出し（上:下 = 2:1 以上 — USWDS / Pimp my Type 推奨比率）
  heading: {
    h1: "font-heading text-4xl font-bold mt-8 mb-4 leading-tight",
    h2: "font-heading text-3xl font-bold mt-8 mb-3 leading-tight",
    h3: "text-2xl font-bold mt-6 mb-2 leading-snug",
    h4: "text-xl font-bold mt-6 mb-2 leading-snug",
    h5: "text-lg font-bold mt-4 mb-1",
    h6: "text-base font-bold mt-4 mb-1",
  },

  // 段落
  paragraph: "mb-4 leading-relaxed",

  // リンク
  link: "text-primary underline hover:no-underline cursor-pointer",

  // 引用
  quote:
    "border-l-4 border-muted-foreground/30 pl-4 italic my-6 text-muted-foreground",

  // リスト
  list: {
    nested: {
      listitem: "list-none",
    },
    listitem: "mb-1",
    listitemChecked: "line-through text-muted-foreground",
    listitemUnchecked: "",
    ol: "list-decimal list-inside mb-4 space-y-1",
    ul: "list-disc list-inside mb-4 space-y-1",
  },

  // コードブロック
  code: "font-mono bg-muted p-4 rounded-lg block overflow-x-auto my-6 text-sm",
  codeHighlight: {
    atrule: "text-syntax-keyword",
    attr: "text-syntax-attr",
    boolean: "text-syntax-number",
    builtin: "text-syntax-builtin",
    cdata: "text-syntax-comment",
    char: "text-syntax-string",
    class: "text-syntax-class",
    "class-name": "text-syntax-class",
    comment: "text-syntax-comment italic",
    constant: "text-syntax-number",
    deleted: "text-syntax-tag",
    doctype: "text-syntax-comment",
    entity: "text-syntax-tag",
    function: "text-syntax-function",
    important: "text-syntax-number font-bold",
    inserted: "text-syntax-string",
    keyword: "text-syntax-keyword",
    namespace: "text-syntax-operator",
    number: "text-syntax-number",
    operator: "text-syntax-operator",
    prolog: "text-syntax-comment",
    property: "text-syntax-attr",
    punctuation: "text-syntax-operator",
    regex: "text-syntax-tag",
    selector: "text-syntax-string",
    string: "text-syntax-string",
    symbol: "text-syntax-number",
    tag: "text-syntax-tag",
    url: "text-syntax-builtin",
    variable: "text-syntax-number",
  },

  // テーブル
  // w-full は意図的に除去: 横幅はコンテンツに追従させる (fixedLayout state で明示的に設定)
  table: "border-collapse my-6 border border-border",
  tableRow: "",
  // py-1.5 (6px): 縦方向は最小限、px-3 (12px): 可読性確保
  tableCell: "border border-border px-3 py-1.5 min-w-[3rem] align-top",
  tableCellHeader: "bg-muted font-bold text-left",
  tableAddColumns:
    "absolute top-0 w-5 h-full bg-muted/50 cursor-pointer hover:bg-muted",
  tableAddRows:
    "absolute left-0 w-full h-5 bg-muted/50 cursor-pointer hover:bg-muted",
  tableCellSelected: "bg-primary/10",
  tableSelected: "outline outline-2 outline-primary",

  // 区切り線 (HorizontalRule)
  // 公式Lexical Playgroundパターン: 疑似要素で線を描画
  // pt-2 でドラッグハンドルアイコン（20px）の中心（10px）付近に線を配置
  hr: "pt-2 pb-0.5 border-none my-8 cursor-pointer after:content-[''] after:block after:h-0.5 after:bg-border",
  hrSelected: "outline outline-2 outline-primary select-none",

  // マーク（コメント用）
  // 公式推奨: @lexical/mark の MarkNode 用スタイル
  mark: "bg-warning/15 border-b-2 border-warning cursor-pointer",
  markOverlap: "bg-warning/25 border-b-2 border-warning/80",
};
