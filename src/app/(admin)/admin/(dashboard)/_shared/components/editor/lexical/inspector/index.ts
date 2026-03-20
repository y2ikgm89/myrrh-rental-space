/**
 * Inspector エクスポート
 *
 * @description
 * Lexical エディタの右サイドバー（ブロック設定 / インスペクター）。
 * WordPress Gutenberg 風のプロパティ編集 UI。開閉は InspectorSidebarProvider +
 * useInspectorSidebar（localStorage 永続化・ツールバー・Ctrl+Shift+0）。詳細は lexical-patterns.md。
 */

// Components
export { InspectorSidebar } from "./InspectorSidebar";
export {
  InspectorSidebarProvider,
  useInspectorSidebar,
} from "./inspector-sidebar-context";
export type { InspectorSidebarContextValue } from "./inspector-sidebar-context";
export { InspectorHeader } from "./InspectorHeader";
export { InspectorSection } from "./InspectorSection";

// Hooks
export { useSelectedNode } from "./hooks/use-selected-node";
export { useNodeUpdater } from "./hooks/use-node-updater";

// Types & Utilities
export type {
  SelectedNodeInfo,
  InspectableNodeType,
} from "./hooks/use-selected-node";
export type { NodeUpdater } from "./hooks/use-node-updater";
export {
  getInspectableInfo,
  INSPECTABLE_NODE_TYPES,
  type InspectableResult,
} from "./hooks/inspectable-nodes";

// Panels
export * from "./panels";
