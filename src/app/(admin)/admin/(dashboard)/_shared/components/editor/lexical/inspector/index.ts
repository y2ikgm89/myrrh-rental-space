/**
 * Inspector エクスポート
 *
 * @description
 * Lexicalエディタのサイドバーインスペクター機能を提供するモジュール。
 * WordPress Gutenberg方式のプロパティ編集UIを実現する。
 */

// Components
export { InspectorSidebar } from "./InspectorSidebar";
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
