"use client";

import Image from "next/image";
import {
  useEffect,
  useEffectEvent,
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconLoader2,
  IconPhoto,
  IconPhotoPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  publishPageBuilder,
  reloadPageBuilderState,
  restorePageBuilderRevision,
  savePageBuilderDraft,
  unpublishPageBuilder,
} from "@/admin/actions/page-builder";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { SelectedMedia } from "@/admin/types/media-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import type {
  PageBuilderForEdit,
  PageBuilderRevisionSummary,
} from "@/shared/domain/page-builder/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  clampPageBuilderCanvasZoom,
  PAGE_BUILDER_CANVAS_DEFAULT_ZOOM,
  stepPageBuilderCanvasZoom,
} from "@/shared/lib/page-builder/canvas-view";
import {
  alignPageBuilderNodeOnCanvas,
  clonePageBuilderDocument,
  distributePageBuilderNodesOnCanvas,
  duplicatePageBuilderNode,
  duplicatePageBuilderNodesWithOffset,
  duplicatePageBuilderNodeWithLayout,
  groupPageBuilderNodesOnCanvas,
  movePageBuilderNodesOnCanvas,
  movePageBuilderNodeWithinParent,
  nudgePageBuilderNodeOnCanvas,
  reorderPageBuilderNodeWithinParent,
  removePageBuilderNode,
  ungroupPageBuilderNodeOnCanvas,
  type PageBuilderCanvasAlignment,
  type PageBuilderCanvasDistribution,
} from "@/shared/lib/page-builder/document-operations";
import {
  canRedoPageBuilderHistory,
  canUndoPageBuilderHistory,
  createEmptyPageBuilderHistoryState,
  createPageBuilderHistoryEntry,
  pushPageBuilderHistory,
  redoPageBuilderHistory,
  undoPageBuilderHistory,
  type PageBuilderHistoryTransition,
} from "@/shared/lib/page-builder/history";
import {
  insertPageBuilderPreset,
  PAGE_BUILDER_PRESET_OPTIONS,
  type PageBuilderPresetType,
} from "@/shared/lib/page-builder/presets";
import {
  arePageBuilderLayoutBoxesEqual,
  clearPageBuilderNodeLayoutOverride,
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
  hasPageBuilderNodeLayoutOverride,
  mutatePageBuilderNodeLayoutBox,
  resolvePageBuilderNodeLayoutBox,
  setPageBuilderNodeLayoutBox,
} from "@/shared/lib/page-builder/layout";
import {
  clearPageBuilderNodeVisibilityOverride,
  createPageBuilderResponsiveVisibility,
  hasPageBuilderNodeVisibilityOverride,
  resolvePageBuilderNodeHidden,
  setPageBuilderNodeHidden,
  togglePageBuilderNodeHidden,
} from "@/shared/lib/page-builder/visibility";
import {
  getFirstPageBuilderValidationNodeId,
  getPageBuilderNodeFieldError,
  getPageBuilderNodeValidationIssues,
  validatePageBuilderDocument,
} from "@/shared/lib/page-builder/validation";
import { getPageBuilderEmbedInputHint } from "@/shared/lib/page-builder/urls";
import type {
  PageBuilderResolvedMedia,
  PageBuilderResolvedMediaMap,
} from "@/shared/lib/page-builder/media";
import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderLayoutBox,
  PageBuilderNode,
} from "@/shared/lib/page-builder/schema";
import {
  PageBuilderCanvasStage,
  PageBuilderEditorShell,
  PageBuilderInspectorPanel,
  PageBuilderSyncConflictBanner,
  PageBuilderTopbar,
  PageBuilderWorkspacePanel,
  type PageBuilderSaveStatusMeta,
  type PageBuilderSidebarTab,
} from "./PageBuilderEditorChrome";
import type { PageBuilderCanvasLayoutCommit } from "./PageBuilderCanvas";
import type {
  PageBuilderInsertNodeType,
  PageBuilderInsertOption,
} from "./PageBuilderInsertPanel";

type SizeMode = "fixed" | "hug" | "fill";
type ColorToken = NonNullable<PageBuilderNode["style"]["backgroundToken"]>;
type TextTag = Extract<PageBuilderNode, { type: "text" }>["content"]["tag"];
type PageBuilderImageNode = Extract<PageBuilderNode, { type: "image" }>;
type ButtonVariant = Extract<
  PageBuilderNode,
  { type: "button" }
>["content"]["variant"];
type ImageFit = Extract<
  PageBuilderNode,
  { type: "image" }
>["content"]["objectFit"];
type EmbedProvider = Extract<
  PageBuilderNode,
  { type: "embed" }
>["content"]["provider"];
type Direction = NonNullable<PageBuilderNode["style"]["direction"]>;
type AlignItems = NonNullable<PageBuilderNode["style"]["alignItems"]>;
type JustifyContent = NonNullable<PageBuilderNode["style"]["justifyContent"]>;
type LayoutMode = PageBuilderNode["layoutMode"];
type TextAlign = NonNullable<PageBuilderNode["style"]["textAlign"]>;
type FontWeight = NonNullable<PageBuilderNode["style"]["fontWeight"]>;
type SaveStatus =
  | "idle"
  | "dirty"
  | "autosaving"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

type CanvasLayoutPreview = {
  nodeId: string;
  breakpoint: PageBuilderBreakpoint;
  box: PageBuilderLayoutBox;
};

type UpdatePageBuilderNodeOptions = {
  allowLocked?: boolean;
};

const NONE_SELECT_VALUE = "__none__";

const ADDABLE_NODE_OPTIONS = [
  {
    value: "text",
    label: "Text",
    description: "見出し・本文を配置",
    category: "content",
  },
  {
    value: "image",
    label: "Image",
    description: "メディアライブラリ画像",
    category: "content",
  },
  {
    value: "button",
    label: "Button",
    description: "CTA リンクを配置",
    category: "content",
  },
  {
    value: "embed",
    label: "Embed",
    description: "YouTube / Maps / Instagram",
    category: "content",
  },
  {
    value: "form",
    label: "Form",
    description: "問い合わせ導線を配置",
    category: "content",
  },
  {
    value: "frame",
    label: "Frame",
    description: "絶対配置向けの親枠",
    category: "layout",
  },
  {
    value: "stack",
    label: "Stack",
    description: "縦横に並べるコンテナ",
    category: "layout",
  },
  {
    value: "grid",
    label: "Grid",
    description: "カードや画像を均等な列で配置",
    category: "layout",
  },
  {
    value: "divider",
    label: "Divider",
    description: "区切り線",
    category: "utility",
  },
  {
    value: "spacer",
    label: "Spacer",
    description: "余白調整用の空要素",
    category: "utility",
  },
] satisfies ReadonlyArray<PageBuilderInsertOption>;

const COLOR_TOKEN_OPTIONS = [
  { value: "background", label: "Background" },
  { value: "foreground", label: "Foreground" },
  { value: "muted", label: "Muted" },
  { value: "muted-foreground", label: "Muted Foreground" },
  { value: "card", label: "Card" },
  { value: "border", label: "Border" },
  { value: "primary", label: "Primary" },
  { value: "primary-foreground", label: "Primary Foreground" },
  { value: "accent", label: "Accent" },
] satisfies ReadonlyArray<{ value: ColorToken; label: string }>;

const TEXT_TAG_OPTIONS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
] satisfies ReadonlyArray<{ value: TextTag; label: string }>;

const BUTTON_VARIANT_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "ghost", label: "Ghost" },
] satisfies ReadonlyArray<{ value: ButtonVariant; label: string }>;

const IMAGE_FIT_OPTIONS = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
] satisfies ReadonlyArray<{ value: ImageFit; label: string }>;

const EMBED_PROVIDER_OPTIONS = [
  { value: "youtube", label: "YouTube" },
  { value: "google-maps", label: "Google Maps" },
  { value: "instagram", label: "Instagram" },
] satisfies ReadonlyArray<{ value: EmbedProvider; label: string }>;

const LAYOUT_MODE_OPTIONS = [
  { value: "stack", label: "Stack" },
  { value: "absolute", label: "Absolute" },
  { value: "grid", label: "Grid" },
] satisfies ReadonlyArray<{ value: LayoutMode; label: string }>;

const CANVAS_ALIGNMENT_OPTIONS = [
  { value: "left", label: "左" },
  { value: "center", label: "左右中央" },
  { value: "right", label: "右" },
  { value: "top", label: "上" },
  { value: "middle", label: "上下中央" },
  { value: "bottom", label: "下" },
] satisfies ReadonlyArray<{
  value: PageBuilderCanvasAlignment;
  label: string;
}>;

const DIRECTION_OPTIONS = [
  { value: "column", label: "Column" },
  { value: "row", label: "Row" },
] satisfies ReadonlyArray<{ value: Direction; label: string }>;

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
] satisfies ReadonlyArray<{ value: AlignItems; label: string }>;

const JUSTIFY_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space Between" },
] satisfies ReadonlyArray<{ value: JustifyContent; label: string }>;

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] satisfies ReadonlyArray<{ value: TextAlign; label: string }>;

const FONT_WEIGHT_OPTIONS = [
  { value: "400", label: "400" },
  { value: "500", label: "500" },
  { value: "600", label: "600" },
  { value: "700", label: "700" },
] satisfies ReadonlyArray<{ value: FontWeight; label: string }>;

const CANVAS_WIDTH_OPTIONS = [
  { value: "boxed", label: "Boxed" },
  { value: "full", label: "Full Width" },
] satisfies ReadonlyArray<{
  value: PageBuilderDocument["canvas"]["width"];
  label: string;
}>;

function formatDateTime(value: Date | string | null): string {
  if (!value) {
    return "未設定";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function canHaveChildren(node: PageBuilderNode): boolean {
  return (
    node.type === "root" ||
    node.type === "frame" ||
    node.type === "stack" ||
    node.type === "grid"
  );
}

function getValidSelectedPageBuilderNodeIds(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
): readonly string[] {
  const uniqueNodeIds = [...new Set(nodeIds)].filter(
    (nodeId) => document.nodes[nodeId] !== undefined,
  );
  return uniqueNodeIds.length > 0 ? uniqueNodeIds : [document.rootId];
}

function getPrimarySelectedPageBuilderNodeId(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
): string {
  const validNodeIds = getValidSelectedPageBuilderNodeIds(document, nodeIds);
  const lastIndex = validNodeIds.length - 1;
  return validNodeIds[lastIndex] ?? document.rootId;
}

function getEditableSelectedPageBuilderNodeIds(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
): readonly string[] {
  return getValidSelectedPageBuilderNodeIds(document, nodeIds).filter(
    (nodeId) => {
      const node = document.nodes[nodeId];
      return node !== undefined && node.parentId !== null && !node.locked;
    },
  );
}

function canUseMultiSelectionCanvasOperation(
  document: PageBuilderDocument,
  nodeIds: readonly string[],
  minimumCount: number,
  breakpoint: PageBuilderBreakpoint,
): boolean {
  const editableNodeIds = getEditableSelectedPageBuilderNodeIds(
    document,
    nodeIds,
  );
  if (editableNodeIds.length < minimumCount) {
    return false;
  }

  let parentId: string | null = null;
  for (const nodeId of editableNodeIds) {
    const node = document.nodes[nodeId];
    if (!node || node.parentId === null) {
      return false;
    }

    if (parentId === null) {
      parentId = node.parentId;
    } else if (node.parentId !== parentId) {
      return false;
    }

    const box = resolvePageBuilderNodeLayoutBox(node, breakpoint);
    if (typeof box.width !== "number" || typeof box.height !== "number") {
      return false;
    }
  }

  if (parentId === null) {
    return false;
  }

  const parent = document.nodes[parentId];
  return parent !== undefined && parent.layoutMode === "absolute";
}

function isPageBuilderImageNode(
  node: PageBuilderNode,
): node is PageBuilderImageNode {
  return node.type === "image";
}

function getSaveStatusMeta(status: SaveStatus): PageBuilderSaveStatusMeta {
  if (status === "dirty") {
    return {
      label: "自動保存待ち",
      variant: "secondary",
      icon: "dirty",
    };
  }

  if (status === "autosaving") {
    return {
      label: "自動保存中",
      variant: "secondary",
      icon: "loader",
    };
  }

  if (status === "saving") {
    return {
      label: "保存中",
      variant: "secondary",
      icon: "loader",
    };
  }

  if (status === "saved") {
    return {
      label: "保存済み",
      variant: "success",
      icon: null,
    };
  }

  if (status === "error") {
    return {
      label: "保存エラー",
      variant: "destructive",
      icon: null,
    };
  }

  if (status === "conflict") {
    return {
      label: "競合あり",
      variant: "destructive",
      icon: null,
    };
  }

  return {
    label: "同期済み",
    variant: "success",
    icon: null,
  };
}

function getNodeTypeLabel(node: PageBuilderNode): string {
  if (node.type === "root") return "Root";
  if (node.type === "frame") return "Frame";
  if (node.type === "stack") return "Stack";
  if (node.type === "grid") return "Grid";
  if (node.type === "text") return "Text";
  if (node.type === "image") return "Image";
  if (node.type === "button") return "Button";
  if (node.type === "divider") return "Divider";
  if (node.type === "spacer") return "Spacer";
  if (node.type === "embed") return "Embed";
  return "Form";
}

function parseInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[contenteditable="true"]') !== null ||
    target.getAttribute("role") === "textbox"
  );
}

function getSizeMode(value: number | "hug" | "fill"): SizeMode {
  return typeof value === "number" ? "fixed" : value;
}

function createResponsiveLayout(
  width: number | "hug" | "fill",
  height: number | "hug" | "fill",
): PageBuilderNode["layout"] {
  return createPageBuilderResponsiveLayout(
    createPageBuilderLayoutBox({
      width,
      height,
    }),
  );
}

function createResolvedMediaFromSelection(
  media: SelectedMedia,
): PageBuilderResolvedMedia | null {
  if (media.id === null) {
    return null;
  }

  return {
    id: media.id,
    url: media.url,
    alt: media.alt ?? null,
    filename: media.filename ?? "selected-image",
    width: null,
    height: null,
  };
}

function createInitialSelectedMedia(
  media: PageBuilderResolvedMedia | null,
): SelectedMedia[] {
  if (!media) {
    return [];
  }

  return [
    {
      id: media.id,
      url: media.url,
      ...(media.alt ? { alt: media.alt } : {}),
      filename: media.filename,
      source: "library",
    },
  ];
}

function createNewNode(
  type: PageBuilderInsertNodeType,
  parentId: string,
): PageBuilderNode {
  const id = `${type}-${crypto.randomUUID()}`;

  if (type === "text") {
    return {
      id,
      type: "text",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Text",
      layoutMode: "stack",
      style: {
        textToken: "foreground",
        fontSize: 18,
        fontWeight: "400",
        textAlign: "left",
      },
      layout: createResponsiveLayout("fill", "hug"),
      content: {
        text: "新しいテキスト",
        tag: "p",
      },
    };
  }

  if (type === "image") {
    return {
      id,
      type: "image",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Image",
      layoutMode: "stack",
      style: {
        borderRadius: 16,
      },
      layout: createResponsiveLayout("fill", 320),
      content: {
        mediaId: null,
        alt: "",
        objectFit: "cover",
      },
    };
  }

  if (type === "button") {
    return {
      id,
      type: "button",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Button",
      layoutMode: "stack",
      style: {},
      layout: createResponsiveLayout(220, 48),
      content: {
        label: "ボタン",
        url: "/contact",
        variant: "primary",
      },
    };
  }

  if (type === "frame") {
    return {
      id,
      type: "frame",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Frame",
      layoutMode: "stack",
      style: {
        direction: "column",
        gap: 16,
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderToken: "border",
        backgroundToken: "card",
      },
      layout: createResponsiveLayout("fill", "hug"),
      content: {},
    };
  }

  if (type === "stack") {
    return {
      id,
      type: "stack",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Stack",
      layoutMode: "stack",
      style: {
        direction: "column",
        gap: 16,
      },
      layout: createResponsiveLayout("fill", "hug"),
      content: {},
    };
  }

  if (type === "grid") {
    return {
      id,
      type: "grid",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Grid",
      layoutMode: "grid",
      style: {
        gap: 16,
        gridMinColumnWidth: 240,
      },
      layout: createResponsiveLayout("fill", "hug"),
      content: {},
    };
  }

  if (type === "divider") {
    return {
      id,
      type: "divider",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Divider",
      layoutMode: "stack",
      style: {
        borderToken: "border",
      },
      layout: createResponsiveLayout("fill", 1),
      content: {},
    };
  }

  if (type === "spacer") {
    return {
      id,
      type: "spacer",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Spacer",
      layoutMode: "stack",
      style: {},
      layout: createResponsiveLayout("fill", 32),
      content: {},
    };
  }

  if (type === "embed") {
    return {
      id,
      type: "embed",
      parentId,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Embed",
      layoutMode: "stack",
      style: {},
      layout: createResponsiveLayout("fill", 220),
      content: {
        provider: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    };
  }

  return {
    id,
    type: "form",
    parentId,
    children: [],
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name: "Contact Form",
    layoutMode: "stack",
    style: {},
    layout: createResponsiveLayout("fill", "hug"),
    content: {
      kind: "contact",
      title: "お問い合わせ",
      description: "既存の問い合わせ導線をここに接続します。",
    },
  };
}

function InspectorField({
  label,
  children,
  description,
  error,
}: {
  label: string;
  children: ReactNode;
  description?: string;
  error?: string | null;
}): ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type PageBuilderEditorProps = {
  page: PageBuilderForEdit;
};

export function PageBuilderEditor({
  page,
}: PageBuilderEditorProps): ReactElement {
  const { enterFullscreen, exitFullscreen } = useAdminLayout();
  const [document, setDocument] = useState<PageBuilderDocument>(() =>
    clonePageBuilderDocument(page.draftDocument),
  );
  const [mediaById, setMediaById] = useState<PageBuilderResolvedMediaMap>(
    () => page.media,
  );
  const [revisions, setRevisions] = useState<
    readonly PageBuilderRevisionSummary[]
  >(() => page.revisions);
  const deferredDocument = useDeferredValue(document);
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([
    page.draftDocument.rootId,
  ]);
  const [sidebarTab, setSidebarTab] = useState<PageBuilderSidebarTab>("layers");
  const [breakpoint, setBreakpoint] =
    useState<PageBuilderBreakpoint>("desktop");
  const [canvasZoom, setCanvasZoom] = useState(
    PAGE_BUILDER_CANVAS_DEFAULT_ZOOM,
  );
  const [isCanvasGridVisible, setIsCanvasGridVisible] = useState(true);
  const [canvasLayoutPreviews, setCanvasLayoutPreviews] = useState<
    readonly CanvasLayoutPreview[]
  >([]);
  const [historyState, setHistoryState] = useState(() =>
    createEmptyPageBuilderHistoryState(),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [draftVersion, setDraftVersion] = useState(page.draftVersion);
  const [publishedVersion, setPublishedVersion] = useState(
    page.publishedVersion,
  );
  const [isPublished, setIsPublished] = useState(page.isPublished);
  const [publishedAt, setPublishedAt] = useState<Date | string | null>(
    page.publishedAt,
  );
  const [lastPublishedAt, setLastPublishedAt] = useState<Date | string | null>(
    page.lastPublishedAt,
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | string>(page.updatedAt);
  const [isSaving, startSaveTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const [isUnpublishing, startUnpublishTransition] = useTransition();
  const [isReloading, startReloadTransition] = useTransition();
  const [isRestoring, startRestoreTransition] = useTransition();
  const [pendingRestoreRevisionId, setPendingRestoreRevisionId] = useState<
    string | null
  >(null);
  const [syncConflictMessage, setSyncConflictMessage] = useState<string | null>(
    null,
  );
  const documentRef = useRef(document);
  const historyRef = useRef(historyState);
  const lastSavedSnapshotRef = useRef(JSON.stringify(page.draftDocument));
  const pendingImagePickerNodeIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    enterFullscreen();
    return () => exitFullscreen();
  }, [enterFullscreen, exitFullscreen]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    historyRef.current = historyState;
  }, [historyState]);

  const rootNode = document.nodes[document.rootId];
  if (!rootNode) {
    throw new Error("page builder root node is missing");
  }

  const activeSelectedNodeIds = getValidSelectedPageBuilderNodeIds(
    document,
    selectedNodeIds,
  );
  const selectedNodeId = getPrimarySelectedPageBuilderNodeId(
    document,
    activeSelectedNodeIds,
  );
  const selectedNode = document.nodes[selectedNodeId] ?? rootNode;
  const editableSelectedNodeIds = getEditableSelectedPageBuilderNodeIds(
    document,
    activeSelectedNodeIds,
  );
  const isMultiSelection = editableSelectedNodeIds.length > 1;
  const imageNodes = Object.values(document.nodes).filter(
    isPageBuilderImageNode,
  );
  const selectedImageAsset =
    selectedNode.type === "image" && selectedNode.content.mediaId !== null
      ? (mediaById[selectedNode.content.mediaId] ?? null)
      : null;
  const activeCanvasLayoutPreview =
    canvasLayoutPreviews.find(
      (preview) =>
        preview.nodeId === selectedNode.id && preview.breakpoint === breakpoint,
    ) ?? null;
  const activeBox =
    activeCanvasLayoutPreview?.box ??
    resolvePageBuilderNodeLayoutBox(selectedNode, breakpoint);
  const hasBreakpointOverride = hasPageBuilderNodeLayoutOverride(
    selectedNode,
    breakpoint,
  );
  const isSelectedNodeHidden = resolvePageBuilderNodeHidden(
    selectedNode,
    breakpoint,
  );
  const hasVisibilityOverride = hasPageBuilderNodeVisibilityOverride(
    selectedNode,
    breakpoint,
  );
  const breakpointWidth = document.breakpoints[breakpoint].width;
  const hasPendingMutation =
    isSaving || isPublishing || isUnpublishing || isReloading || isRestoring;
  const saveStatusMeta = getSaveStatusMeta(saveStatus);
  const canUndo = canUndoPageBuilderHistory(historyState);
  const canRedo = canRedoPageBuilderHistory(historyState);
  const hasSyncConflict = syncConflictMessage !== null;
  const isConflictLocked = hasSyncConflict;
  const isMutationBlocked = hasPendingMutation || hasSyncConflict;
  const isSelectedNodeLocked =
    selectedNode.id !== document.rootId && selectedNode.locked;
  const isSelectedNodeEditingDisabled =
    isMutationBlocked || isSelectedNodeLocked;
  const pendingRestoreRevision =
    pendingRestoreRevisionId === null
      ? null
      : (revisions.find(
          (revision) => revision.id === pendingRestoreRevisionId,
        ) ?? null);
  const documentValidation = validatePageBuilderDocument(document);
  const hasValidationErrors = !documentValidation.isValid;
  const selectedNodeValidationIssues = getPageBuilderNodeValidationIssues(
    documentValidation,
    selectedNode.id,
  );
  const selectedNodeNameError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["name"],
  );
  const selectedNodeTextContentError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "text"],
  );
  const selectedNodeImageMediaError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "mediaId"],
  );
  const selectedNodeImageAltError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "alt"],
  );
  const selectedNodeButtonLabelError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "label"],
  );
  const selectedNodeButtonUrlError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "url"],
  );
  const selectedNodeEmbedUrlError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "url"],
  );
  const selectedNodeFormTitleError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "title"],
  );
  const selectedNodeFormDescriptionError = getPageBuilderNodeFieldError(
    documentValidation,
    selectedNode.id,
    ["content", "description"],
  );
  const canvasDocument =
    canvasLayoutPreviews.length === 0 &&
    deferredDocument.nodes[selectedNode.id] !== undefined
      ? deferredDocument
      : document;

  function syncSaveStateForSnapshot(snapshot: string): void {
    const isCurrentSaved = snapshot === lastSavedSnapshotRef.current;
    setIsDirty(!isCurrentSaved);

    if (hasSyncConflict) {
      setSaveStatus("conflict");
      return;
    }

    setSaveStatus(isCurrentSaved ? "saved" : "dirty");
  }

  function replaceDocumentFromServer(nextDocument: PageBuilderDocument): void {
    const normalizedDocument = clonePageBuilderDocument(nextDocument);
    const snapshot = JSON.stringify(normalizedDocument);
    const nextHistoryState = createEmptyPageBuilderHistoryState();

    documentRef.current = normalizedDocument;
    historyRef.current = nextHistoryState;
    lastSavedSnapshotRef.current = snapshot;

    setDocument(normalizedDocument);
    setHistoryState(nextHistoryState);
    setCanvasLayoutPreviews([]);
    setSyncConflictMessage(null);
    setIsDirty(false);
    setSaveStatus("saved");

    setSelectedNodeIds((currentSelectedNodeIds) =>
      getValidSelectedPageBuilderNodeIds(
        normalizedDocument,
        currentSelectedNodeIds,
      ),
    );
  }

  function handleSyncConflict(message: string, showToast = true): void {
    setSyncConflictMessage(message);
    setSaveStatus("conflict");
    if (showToast) {
      toast.error(message);
    }
  }

  function blockForSyncConflict(): boolean {
    if (!hasSyncConflict) {
      return false;
    }

    toast.error(
      syncConflictMessage ?? "最新の状態を読み込んでから続行してください。",
    );
    return true;
  }

  function applyReloadedPageBuilderState(result: {
    draftVersion: number;
    publishedVersion: number | null;
    isPublished: boolean;
    publishedAt: Date | string | null;
    lastPublishedAt: Date | string | null;
    updatedAt: Date | string;
    document: PageBuilderDocument;
    media: PageBuilderResolvedMediaMap;
    revisions: readonly PageBuilderRevisionSummary[];
  }): void {
    replaceDocumentFromServer(result.document);
    setMediaById(result.media);
    setRevisions(result.revisions);
    setDraftVersion(result.draftVersion);
    setPublishedVersion(result.publishedVersion);
    setIsPublished(result.isPublished);
    setPublishedAt(result.publishedAt);
    setLastPublishedAt(result.lastPublishedAt);
    setLastSavedAt(result.updatedAt);
  }

  function commitDocument(
    nextDocument: PageBuilderDocument,
    options?: {
      trackHistory?: boolean;
    },
  ): void {
    const currentEntry = createPageBuilderHistoryEntry(documentRef.current);
    const nextEntry = createPageBuilderHistoryEntry(nextDocument);

    if (currentEntry.snapshot === nextEntry.snapshot) {
      return;
    }

    if (options?.trackHistory !== false) {
      setHistoryState((currentHistory) => {
        const nextHistory = pushPageBuilderHistory(
          currentHistory,
          currentEntry,
          nextEntry,
        );
        historyRef.current = nextHistory;
        return nextHistory;
      });
    }

    documentRef.current = nextEntry.document;
    setDocument(nextEntry.document);
    setCanvasLayoutPreviews([]);
    syncSaveStateForSnapshot(nextEntry.snapshot);
  }

  function restoreHistoryTransition(
    transition: PageBuilderHistoryTransition,
  ): void {
    if (isConflictLocked) {
      return;
    }

    documentRef.current = transition.document;
    historyRef.current = transition.history;
    setDocument(transition.document);
    setHistoryState(transition.history);
    setCanvasLayoutPreviews([]);
    syncSaveStateForSnapshot(transition.snapshot);

    setSelectedNodeIds((currentSelectedNodeIds) =>
      getValidSelectedPageBuilderNodeIds(
        transition.document,
        currentSelectedNodeIds,
      ),
    );
  }

  function applyDocumentMutation(
    mutate: (draft: PageBuilderDocument) => void,
  ): void {
    if (isConflictLocked) {
      return;
    }

    const nextDocument = clonePageBuilderDocument(documentRef.current);
    mutate(nextDocument);
    commitDocument(nextDocument);
  }

  function updateSelectedNode(
    mutate: (node: PageBuilderNode) => void,
    options?: UpdatePageBuilderNodeOptions,
  ): void {
    applyDocumentMutation((draft) => {
      const node = draft.nodes[selectedNodeId];
      if (!node) {
        return;
      }

      if (node.parentId !== null && node.locked && !options?.allowLocked) {
        return;
      }

      mutate(node);
    });
  }

  function updateNodeById(
    nodeId: string,
    mutate: (node: PageBuilderNode) => void,
    options?: UpdatePageBuilderNodeOptions,
  ): void {
    applyDocumentMutation((draft) => {
      const node = draft.nodes[nodeId];
      if (!node) {
        return;
      }

      if (node.parentId !== null && node.locked && !options?.allowLocked) {
        return;
      }

      mutate(node);
    });
  }

  function updateSelectedBox(
    mutate: (box: PageBuilderLayoutBox) => void,
  ): void {
    updateSelectedNode((node) => {
      mutatePageBuilderNodeLayoutBox(node, breakpoint, mutate);
    });
  }

  function updateCanvasZoom(nextZoom: number): void {
    setCanvasZoom(clampPageBuilderCanvasZoom(nextZoom));
  }

  function stepCanvasZoom(direction: -1 | 1): void {
    setCanvasZoom((currentZoom) =>
      stepPageBuilderCanvasZoom(currentZoom, direction),
    );
  }

  function selectSingleNode(nodeId: string): void {
    const currentDocument = documentRef.current;
    setSelectedNodeIds([
      currentDocument.nodes[nodeId] ? nodeId : currentDocument.rootId,
    ]);
  }

  function selectNodes(nodeIds: readonly string[]): void {
    const currentDocument = documentRef.current;
    const validNodeIds = getValidSelectedPageBuilderNodeIds(
      currentDocument,
      nodeIds,
    );
    setSelectedNodeIds(
      validNodeIds.length > 0 ? validNodeIds : [currentDocument.rootId],
    );
  }

  function selectNode(
    nodeId: string,
    options?: {
      additive: boolean;
    },
  ): void {
    const currentDocument = documentRef.current;
    if (!currentDocument.nodes[nodeId]) {
      return;
    }

    if (!options?.additive || nodeId === currentDocument.rootId) {
      setSelectedNodeIds([nodeId]);
      return;
    }

    setSelectedNodeIds((currentSelectedNodeIds) => {
      const validNodeIds = getValidSelectedPageBuilderNodeIds(
        currentDocument,
        currentSelectedNodeIds,
      ).filter((currentNodeId) => currentNodeId !== currentDocument.rootId);

      if (validNodeIds.includes(nodeId)) {
        const nextNodeIds = validNodeIds.filter(
          (currentNodeId) => currentNodeId !== nodeId,
        );
        return nextNodeIds.length > 0 ? nextNodeIds : [currentDocument.rootId];
      }

      return [...validNodeIds, nodeId];
    });
  }

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    showUrlTab: false,
    onSelect: (media) => {
      const targetNodeId = pendingImagePickerNodeIdRef.current;
      const selectedMedia = media[0];
      if (!targetNodeId || !selectedMedia || selectedMedia.id === null) {
        return;
      }

      const resolvedMedia = createResolvedMediaFromSelection(selectedMedia);
      if (resolvedMedia) {
        setMediaById((currentMedia) => ({
          ...currentMedia,
          [resolvedMedia.id]: resolvedMedia,
        }));
      }

      updateNodeById(targetNodeId, (node) => {
        if (node.type !== "image") {
          return;
        }

        node.content.mediaId = selectedMedia.id;
        if (node.content.alt.length === 0 && selectedMedia.alt) {
          node.content.alt = selectedMedia.alt;
        }
      });
      pendingImagePickerNodeIdRef.current = null;
    },
  });

  function setOptionalStyleToken(
    field: "backgroundToken" | "textToken" | "borderToken",
    value: string,
  ): void {
    updateSelectedNode((node) => {
      if (value === NONE_SELECT_VALUE) {
        delete node.style[field];
        return;
      }

      if (
        value === "background" ||
        value === "foreground" ||
        value === "muted" ||
        value === "muted-foreground" ||
        value === "card" ||
        value === "border" ||
        value === "primary" ||
        value === "primary-foreground" ||
        value === "accent"
      ) {
        node.style[field] = value;
      }
    });
  }

  function updateSizeMode(field: "width" | "height", value: string): void {
    updateSelectedBox((box) => {
      if (value === "hug" || value === "fill") {
        box[field] = value;
        return;
      }

      const current = box[field];
      box[field] = typeof current === "number" ? current : 320;
    });
  }

  function updateFixedSize(field: "width" | "height", value: string): void {
    const parsed = parseInteger(value);
    if (parsed === null) {
      return;
    }

    updateSelectedBox((box) => {
      box[field] = parsed;
    });
  }

  function canMoveNode(nodeId: string, offset: -1 | 1): boolean {
    const node = document.nodes[nodeId];
    if (!node || node.parentId === null || node.locked) {
      return false;
    }

    const parent = document.nodes[node.parentId];
    if (!parent) {
      return false;
    }

    const currentIndex = parent.children.indexOf(nodeId);
    const nextIndex = currentIndex + offset;
    return (
      currentIndex >= 0 && nextIndex >= 0 && nextIndex < parent.children.length
    );
  }

  function getInsertParentId(): string {
    const parentCandidate = document.nodes[selectedNodeId];
    return parentCandidate &&
      canHaveChildren(parentCandidate) &&
      !parentCandidate.locked
      ? parentCandidate.id
      : (parentCandidate?.parentId ?? document.rootId);
  }

  function addNode(type: PageBuilderInsertNodeType): void {
    const parentId = getInsertParentId();

    const nextNode = createNewNode(type, parentId);

    applyDocumentMutation((draft) => {
      draft.nodes[nextNode.id] = nextNode;
      const parent = draft.nodes[parentId];
      if (parent) {
        parent.children.push(nextNode.id);
      }
    });

    selectSingleNode(nextNode.id);
  }

  function addPreset(type: PageBuilderPresetType): void {
    const parentId = getInsertParentId();
    let insertedNodeId: string | null = null;

    applyDocumentMutation((draft) => {
      insertedNodeId = insertPageBuilderPreset(draft, type, parentId);
    });

    if (insertedNodeId) {
      selectSingleNode(insertedNodeId);
      setSidebarTab("layers");
    }
  }

  function duplicateSelectedNode(): void {
    if (isMultiSelection) {
      let duplicatedNodeIds: readonly string[] = [];
      applyDocumentMutation((draft) => {
        duplicatedNodeIds = duplicatePageBuilderNodesWithOffset(
          draft,
          activeSelectedNodeIds,
          breakpoint,
          24,
          24,
        );
      });

      if (duplicatedNodeIds.length === 0) {
        toast.error("選択中のノードをまとめて複製できませんでした");
        return;
      }

      setSelectedNodeIds(duplicatedNodeIds);
      return;
    }

    if (selectedNode.id === document.rootId || selectedNode.locked) {
      return;
    }

    let duplicatedId: string | null = null;

    applyDocumentMutation((draft) => {
      duplicatedId = duplicatePageBuilderNode(draft, selectedNode.id);
    });

    if (duplicatedId) {
      selectSingleNode(duplicatedId);
    }
  }

  function moveSelectedNode(offset: -1 | 1): void {
    if (!canMoveNode(selectedNode.id, offset)) {
      return;
    }

    applyDocumentMutation((draft) => {
      movePageBuilderNodeWithinParent(draft, selectedNode.id, offset);
    });
  }

  function removeSelectedNode(): void {
    const removableNodeIds = editableSelectedNodeIds.filter(
      (nodeId) => nodeId !== document.rootId,
    );
    if (removableNodeIds.length === 0) {
      return;
    }

    let parentId = selectedNode.parentId ?? document.rootId;

    applyDocumentMutation((draft) => {
      for (const nodeId of removableNodeIds) {
        parentId = removePageBuilderNode(draft, nodeId) ?? parentId;
      }
    });

    selectSingleNode(parentId ?? document.rootId);
  }

  function groupSelectedNodes(): void {
    if (
      !canUseMultiSelectionCanvasOperation(
        document,
        activeSelectedNodeIds,
        2,
        breakpoint,
      )
    ) {
      toast.error(
        "グループ化は同じ absolute 親枠内の固定サイズ要素を2つ以上選択してください",
      );
      return;
    }

    let groupId: string | null = null;
    applyDocumentMutation((draft) => {
      groupId = groupPageBuilderNodesOnCanvas(
        draft,
        activeSelectedNodeIds,
        breakpoint,
      );
    });

    if (groupId === null) {
      toast.error("選択中のノードをグループ化できませんでした");
      return;
    }

    selectSingleNode(groupId);
  }

  function ungroupSelectedNode(): void {
    if (selectedNode.id === document.rootId || selectedNode.locked) {
      return;
    }

    let ungroupedNodeIds: readonly string[] = [];
    applyDocumentMutation((draft) => {
      ungroupedNodeIds = ungroupPageBuilderNodeOnCanvas(draft, selectedNode.id);
    });

    if (ungroupedNodeIds.length === 0) {
      toast.error("このノードは現在の親枠へ解除できません");
      return;
    }

    setSelectedNodeIds(ungroupedNodeIds);
  }

  function distributeSelectedNodes(
    distribution: PageBuilderCanvasDistribution,
  ): void {
    if (
      !canUseMultiSelectionCanvasOperation(
        document,
        activeSelectedNodeIds,
        3,
        breakpoint,
      )
    ) {
      toast.error(
        "等間隔分布は同じ absolute 親枠内の固定サイズ要素を3つ以上選択してください",
      );
      return;
    }

    let distributed = false;
    applyDocumentMutation((draft) => {
      distributed = distributePageBuilderNodesOnCanvas(
        draft,
        activeSelectedNodeIds,
        breakpoint,
        distribution,
      );
    });

    if (!distributed) {
      toast.error("選択中のノードを等間隔に配置できませんでした");
    }
  }

  function toggleNodeHidden(nodeId: string): void {
    applyDocumentMutation((draft) => {
      const node = draft.nodes[nodeId];
      if (!node || node.parentId === null || node.locked) {
        return;
      }

      togglePageBuilderNodeHidden(node, breakpoint);
    });
  }

  function toggleNodeLocked(nodeId: string): void {
    applyDocumentMutation((draft) => {
      const node = draft.nodes[nodeId];
      if (!node || node.parentId === null) {
        return;
      }

      node.locked = !node.locked;
    });
  }

  function openImagePickerForNode(nodeId: string): void {
    if (isConflictLocked) {
      return;
    }

    const node = document.nodes[nodeId];
    if (!node || node.type !== "image" || node.locked) {
      return;
    }

    const imageAsset =
      node.content.mediaId === null
        ? null
        : (mediaById[node.content.mediaId] ?? null);

    selectSingleNode(node.id);
    pendingImagePickerNodeIdRef.current = node.id;
    imagePicker.openPicker(createInitialSelectedMedia(imageAsset));
  }

  function clearImageNode(nodeId: string): void {
    const targetNode = document.nodes[nodeId];
    if (!targetNode || targetNode.type !== "image" || targetNode.locked) {
      return;
    }

    selectSingleNode(targetNode.id);
    updateNodeById(nodeId, (draftNode) => {
      if (draftNode.type !== "image") {
        return;
      }

      draftNode.content.mediaId = null;
      draftNode.content.alt = "";
    });
  }

  function openSelectedImagePicker(): void {
    openImagePickerForNode(selectedNode.id);
  }

  function clearSelectedImage(): void {
    clearImageNode(selectedNode.id);
  }

  function canReorderNodeWithinParent(
    activeNodeId: string,
    overNodeId: string,
  ): boolean {
    const activeNode = document.nodes[activeNodeId];
    const overNode = document.nodes[overNodeId];

    if (
      !activeNode ||
      !overNode ||
      activeNode.parentId === null ||
      activeNode.locked ||
      activeNode.parentId !== overNode.parentId
    ) {
      return false;
    }

    const parent = document.nodes[activeNode.parentId];
    if (!parent) {
      return false;
    }

    const currentIndex = parent.children.indexOf(activeNodeId);
    const nextIndex = parent.children.indexOf(overNodeId);

    return currentIndex >= 0 && nextIndex >= 0 && currentIndex !== nextIndex;
  }

  function reorderNodeWithinParent(
    activeNodeId: string,
    overNodeId: string,
  ): void {
    if (!canReorderNodeWithinParent(activeNodeId, overNodeId)) {
      return;
    }

    applyDocumentMutation((draft) => {
      reorderPageBuilderNodeWithinParent(draft, activeNodeId, overNodeId);
    });
  }

  function commitSelectedNodeCanvasLayout(
    commit: PageBuilderCanvasLayoutCommit,
  ): void {
    if (commit.mode === "multi-move" || commit.mode === "multi-duplicate") {
      const deltaX = commit.deltaX ?? 0;
      const deltaY = commit.deltaY ?? 0;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      let nextSelectedNodeIds: readonly string[] = activeSelectedNodeIds;
      applyDocumentMutation((draft) => {
        if (commit.mode === "multi-duplicate") {
          nextSelectedNodeIds = duplicatePageBuilderNodesWithOffset(
            draft,
            activeSelectedNodeIds,
            breakpoint,
            deltaX,
            deltaY,
          );
          return;
        }

        const movedNodeIds = movePageBuilderNodesOnCanvas(
          draft,
          activeSelectedNodeIds,
          breakpoint,
          deltaX,
          deltaY,
        );
        if (movedNodeIds.length > 0) {
          nextSelectedNodeIds = movedNodeIds;
        }
      });

      if (nextSelectedNodeIds.length > 0) {
        setSelectedNodeIds(nextSelectedNodeIds);
      }
      return;
    }

    if (selectedNode.locked) {
      return;
    }

    const committedBox = resolvePageBuilderNodeLayoutBox(
      selectedNode,
      breakpoint,
    );
    if (
      commit.mode !== "duplicate" &&
      arePageBuilderLayoutBoxesEqual(committedBox, commit.box)
    ) {
      return;
    }

    let nextSelectedNodeId: string | null = null;

    applyDocumentMutation((draft) => {
      if (commit.mode === "duplicate") {
        nextSelectedNodeId = duplicatePageBuilderNodeWithLayout(
          draft,
          selectedNode.id,
          breakpoint,
          commit.box,
        );
        return;
      }

      const node = draft.nodes[selectedNode.id];
      if (!node) {
        return;
      }

      setPageBuilderNodeLayoutBox(node, breakpoint, commit.box);
    });

    if (nextSelectedNodeId !== null) {
      selectSingleNode(nextSelectedNodeId);
    }
  }

  function canAlignSelectedNodeOnCanvas(
    alignment: PageBuilderCanvasAlignment,
  ): boolean {
    return (
      alignPageBuilderNodeOnCanvas(
        document,
        selectedNode.id,
        breakpoint,
        alignment,
      ) !== null
    );
  }

  function alignSelectedNodeOnCanvas(
    alignment: PageBuilderCanvasAlignment,
  ): void {
    const nextBox = alignPageBuilderNodeOnCanvas(
      document,
      selectedNode.id,
      breakpoint,
      alignment,
    );

    if (!nextBox) {
      toast.error("このノードは現在の親枠内で整列できません");
      return;
    }

    commitSelectedNodeCanvasLayout({
      box: nextBox,
      mode: "move",
    });
  }

  function handleValidationFailure(actionLabel: "保存" | "公開"): void {
    const invalidNodeId =
      getFirstPageBuilderValidationNodeId(documentValidation);

    if (invalidNodeId !== null) {
      selectSingleNode(invalidNodeId);
    }

    toast.error(
      `${actionLabel}前に ${documentValidation.issueCount} 件の入力エラーを修正してください`,
    );
  }

  function undoDocumentChange(): void {
    const transition = undoPageBuilderHistory(
      historyRef.current,
      createPageBuilderHistoryEntry(documentRef.current),
    );
    if (!transition) {
      return;
    }

    restoreHistoryTransition(transition);
  }

  function redoDocumentChange(): void {
    const transition = redoPageBuilderHistory(
      historyRef.current,
      createPageBuilderHistoryEntry(documentRef.current),
    );
    if (!transition) {
      return;
    }

    restoreHistoryTransition(transition);
  }

  async function persistDraft(mode: "manual" | "autosave"): Promise<void> {
    if (hasSyncConflict) {
      if (mode === "manual") {
        blockForSyncConflict();
      }
      return;
    }

    if (hasValidationErrors) {
      if (mode === "manual") {
        handleValidationFailure("保存");
      }
      return;
    }

    const snapshot = JSON.stringify(documentRef.current);
    if (snapshot === lastSavedSnapshotRef.current) {
      setIsDirty(false);
      setSaveStatus("saved");
      return;
    }

    setSaveStatus(mode === "autosave" ? "autosaving" : "saving");

    const result = await savePageBuilderDraft(
      page.id,
      page.slug,
      draftVersion,
      documentRef.current,
    );
    if (isMutationError(result)) {
      if (result.code === "CONFLICT") {
        handleSyncConflict(result.error, mode === "manual");
        return;
      }

      setSaveStatus("error");
      if (mode === "manual") {
        toast.error(result.error);
      }
      return;
    }

    lastSavedSnapshotRef.current = snapshot;
    setDraftVersion(result.draftVersion);
    setLastSavedAt(result.updatedAt);
    setRevisions(result.revisions);

    const currentSnapshot = JSON.stringify(documentRef.current);
    if (currentSnapshot === snapshot) {
      setIsDirty(false);
      setSaveStatus("saved");
    } else {
      setIsDirty(true);
      setSaveStatus("dirty");
    }

    if (mode === "manual") {
      toast.success(`下書きを保存しました（draft v${result.draftVersion}）`);
    }
  }

  const triggerAutosave = useEffectEvent(() => {
    startSaveTransition(() => {
      void persistDraft("autosave");
    });
  });

  const triggerShortcutSave = useEffectEvent(() => {
    if (hasPendingMutation) {
      return;
    }

    if (blockForSyncConflict()) {
      return;
    }

    if (hasValidationErrors) {
      handleValidationFailure("保存");
      return;
    }

    startSaveTransition(() => {
      void persistDraft("manual");
    });
  });

  const triggerKeyboardShortcut = useEffectEvent((event: KeyboardEvent) => {
    const pressedKey = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && pressedKey === "s") {
      event.preventDefault();
      triggerShortcutSave();
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      (pressedKey === "=" || pressedKey === "+")
    ) {
      event.preventDefault();
      stepCanvasZoom(1);
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      (pressedKey === "-" || pressedKey === "_")
    ) {
      event.preventDefault();
      stepCanvasZoom(-1);
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      pressedKey === "0"
    ) {
      event.preventDefault();
      updateCanvasZoom(PAGE_BUILDER_CANVAS_DEFAULT_ZOOM);
      return;
    }

    if (hasPendingMutation) {
      return;
    }

    if (hasSyncConflict) {
      return;
    }

    if (isEditableShortcutTarget(event.target)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && pressedKey === "d") {
      event.preventDefault();
      duplicateSelectedNode();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && pressedKey === "g") {
      event.preventDefault();
      if (event.shiftKey) {
        ungroupSelectedNode();
      } else {
        groupSelectedNodes();
      }
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      pressedKey === "g"
    ) {
      event.preventDefault();
      setIsCanvasGridVisible((isVisible) => !isVisible);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && pressedKey === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoDocumentChange();
      } else {
        undoDocumentChange();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && pressedKey === "y") {
      event.preventDefault();
      redoDocumentChange();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelectedNode();
      return;
    }

    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight"
    ) {
      return;
    }

    const deltaX =
      event.key === "ArrowLeft"
        ? -(event.shiftKey ? 10 : 1)
        : event.key === "ArrowRight"
          ? event.shiftKey
            ? 10
            : 1
          : 0;
    const deltaY =
      event.key === "ArrowUp"
        ? -(event.shiftKey ? 10 : 1)
        : event.key === "ArrowDown"
          ? event.shiftKey
            ? 10
            : 1
          : 0;

    if (isMultiSelection) {
      let movedNodeIds: readonly string[] = [];
      applyDocumentMutation((draft) => {
        movedNodeIds = movePageBuilderNodesOnCanvas(
          draft,
          activeSelectedNodeIds,
          breakpoint,
          deltaX,
          deltaY,
        );
      });

      if (movedNodeIds.length === 0) {
        return;
      }

      event.preventDefault();
      setSelectedNodeIds(movedNodeIds);
      return;
    }

    const nextBox = nudgePageBuilderNodeOnCanvas(
      document,
      selectedNode.id,
      breakpoint,
      deltaX,
      deltaY,
    );

    if (!nextBox) {
      return;
    }

    event.preventDefault();
    commitSelectedNodeCanvasLayout({
      box: nextBox,
      mode: "move",
    });
  });

  useEffect(() => {
    if (
      !isDirty ||
      hasPendingMutation ||
      hasSyncConflict ||
      hasValidationErrors ||
      saveStatus === "error"
    ) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      triggerAutosave();
    }, 1500);

    return () => {
      window.clearTimeout(autosaveTimer);
    };
  }, [
    document,
    hasPendingMutation,
    hasSyncConflict,
    hasValidationErrors,
    isDirty,
    saveStatus,
  ]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      triggerKeyboardShortcut(event);
    };

    window.document.addEventListener("keydown", handleShortcut);
    return () => {
      window.document.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  function handleSave(): void {
    if (blockForSyncConflict()) {
      return;
    }

    if (hasValidationErrors) {
      handleValidationFailure("保存");
      return;
    }

    startSaveTransition(() => {
      void persistDraft("manual");
    });
  }

  function handlePublish(): void {
    if (blockForSyncConflict()) {
      return;
    }

    if (hasValidationErrors) {
      handleValidationFailure("公開");
      return;
    }

    startPublishTransition(async () => {
      const snapshot = JSON.stringify(documentRef.current);
      const result = await publishPageBuilder(
        page.id,
        page.slug,
        draftVersion,
        documentRef.current,
      );
      if (isMutationError(result)) {
        if (result.code === "CONFLICT") {
          handleSyncConflict(result.error);
          return;
        }

        toast.error(result.error);
        return;
      }

      lastSavedSnapshotRef.current = snapshot;
      setDraftVersion(result.draftVersion);
      setPublishedVersion(result.publishedVersion);
      setRevisions(result.revisions);
      setIsPublished(true);
      setPublishedAt(result.publishedAt);
      setLastPublishedAt(result.lastPublishedAt);
      setLastSavedAt(result.publishedAt);
      const currentSnapshot = JSON.stringify(documentRef.current);
      setIsDirty(currentSnapshot !== snapshot);
      setSaveStatus(currentSnapshot === snapshot ? "saved" : "dirty");
      toast.success(
        `ページを公開しました（published v${result.publishedVersion}）`,
      );
    });
  }

  function handleUnpublish(): void {
    if (blockForSyncConflict()) {
      return;
    }

    startUnpublishTransition(async () => {
      const result = await unpublishPageBuilder(page.id, page.slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      setIsPublished(false);
      setPublishedAt(null);
      toast.success("ページを非公開にしました");
    });
  }

  function requestRevisionRestore(revisionId: string): void {
    setPendingRestoreRevisionId(revisionId);
  }

  function handleRestoreRevision(): void {
    if (pendingRestoreRevision === null) {
      setPendingRestoreRevisionId(null);
      return;
    }

    if (blockForSyncConflict()) {
      setPendingRestoreRevisionId(null);
      return;
    }

    startRestoreTransition(async () => {
      const result = await restorePageBuilderRevision(
        page.id,
        page.slug,
        pendingRestoreRevision.id,
        draftVersion,
      );
      if (isMutationError(result)) {
        setPendingRestoreRevisionId(null);
        if (result.code === "CONFLICT") {
          handleSyncConflict(result.error);
          return;
        }

        toast.error(result.error);
        return;
      }

      applyReloadedPageBuilderState({
        draftVersion: result.draftVersion,
        publishedVersion,
        isPublished,
        publishedAt,
        lastPublishedAt,
        updatedAt: result.updatedAt,
        document: result.document,
        media: {
          ...mediaById,
          ...result.media,
        },
        revisions: result.revisions,
      });
      setPendingRestoreRevisionId(null);
      toast.success(
        `${result.restoredFrom.kind === "published" ? "公開版" : "下書き"} v${result.restoredFrom.version} を復元しました`,
      );
    });
  }

  function handleReloadLatest(): void {
    startReloadTransition(async () => {
      const result = await reloadPageBuilderState(page.id, page.slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      applyReloadedPageBuilderState(result);
      toast.success("最新の下書きを読み込みました");
    });
  }

  const canAlignSelectedNode =
    canAlignSelectedNodeOnCanvas("left") || canAlignSelectedNodeOnCanvas("top");
  const canGroupSelectedNodes = canUseMultiSelectionCanvasOperation(
    document,
    activeSelectedNodeIds,
    2,
    breakpoint,
  );
  const canDistributeSelectedNodes = canUseMultiSelectionCanvasOperation(
    document,
    activeSelectedNodeIds,
    3,
    breakpoint,
  );
  const canUngroupSelectedNode =
    selectedNode.id !== document.rootId &&
    !selectedNode.locked &&
    selectedNode.layoutMode === "absolute" &&
    selectedNode.children.length > 0 &&
    selectedNode.parentId !== null &&
    document.nodes[selectedNode.parentId]?.layoutMode === "absolute";

  return (
    <PageBuilderEditorShell>
      <PageBuilderTopbar
        pageTitle={page.title}
        pageSlug={page.slug}
        isPublished={isPublished}
        saveStatusMeta={saveStatusMeta}
        hasValidationErrors={hasValidationErrors}
        validationIssueCount={documentValidation.issueCount}
        breakpoint={breakpoint}
        canvasZoom={canvasZoom}
        canUndo={canUndo}
        canRedo={canRedo}
        undoDisabled={isMutationBlocked}
        redoDisabled={isMutationBlocked}
        saveDisabled={
          !isDirty ||
          hasPendingMutation ||
          hasSyncConflict ||
          hasValidationErrors
        }
        publishDisabled={
          hasPendingMutation || hasSyncConflict || hasValidationErrors
        }
        unpublishDisabled={hasPendingMutation || hasSyncConflict}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isUnpublishing={isUnpublishing}
        onBreakpointChange={setBreakpoint}
        onZoomStep={stepCanvasZoom}
        onZoomChange={updateCanvasZoom}
        onUndo={undoDocumentChange}
        onRedo={redoDocumentChange}
        onSave={handleSave}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
      />

      {hasSyncConflict ? (
        <PageBuilderSyncConflictBanner
          message={syncConflictMessage}
          isReloading={isReloading}
          disabled={hasPendingMutation}
          onReloadLatest={handleReloadLatest}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PageBuilderWorkspacePanel
          tab={sidebarTab}
          nodeCount={Object.keys(document.nodes).length}
          hasSyncConflict={hasSyncConflict}
          insertOptions={ADDABLE_NODE_OPTIONS}
          presets={PAGE_BUILDER_PRESET_OPTIONS}
          disabled={isMutationBlocked}
          document={document}
          breakpoint={breakpoint}
          selectedNodeId={selectedNode.id}
          selectedNodeIds={activeSelectedNodeIds}
          imageNodes={imageNodes}
          mediaById={mediaById}
          revisions={revisions}
          draftVersion={draftVersion}
          publishedVersion={publishedVersion}
          isDirty={isDirty}
          onTabChange={setSidebarTab}
          onAddNode={addNode}
          onAddPreset={addPreset}
          onSelectNode={selectNode}
          onReorderNode={reorderNodeWithinParent}
          onToggleNodeHidden={toggleNodeHidden}
          onToggleNodeLocked={toggleNodeLocked}
          onOpenImagePicker={openImagePickerForNode}
          onClearImage={clearImageNode}
          onRequestRestore={requestRevisionRestore}
        />

        <PageBuilderCanvasStage
          document={canvasDocument}
          media={mediaById}
          breakpoint={breakpoint}
          breakpointWidth={breakpointWidth}
          selectedNodeId={selectedNode.id}
          selectedNodeIds={activeSelectedNodeIds}
          interactionDisabled={isMutationBlocked}
          layoutPreviews={canvasLayoutPreviews
            .filter((preview) => preview.breakpoint === breakpoint)
            .map((preview) => ({
              nodeId: preview.nodeId,
              box: preview.box,
            }))}
          zoom={canvasZoom}
          showGrid={isCanvasGridVisible}
          hasSyncConflict={hasSyncConflict}
          onGridVisibilityChange={setIsCanvasGridVisible}
          onNodeSelect={selectNode}
          onNodesSelect={selectNodes}
          onLayoutPreviewChange={(previews) => {
            setCanvasLayoutPreviews(
              previews.map((preview) => ({
                ...preview,
                breakpoint,
              })),
            );
          }}
          onCommitLayout={commitSelectedNodeCanvasLayout}
        />

        <PageBuilderInspectorPanel
          nodeName={selectedNode.name}
          nodeTypeLabel={getNodeTypeLabel(selectedNode)}
          breakpoint={breakpoint}
          hasSyncConflict={hasSyncConflict}
        >
          {selectedNodeValidationIssues.length > 0 ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <IconAlertCircle className="h-4 w-4" />
                このノードに {selectedNodeValidationIssues.length}{" "}
                件の入力エラーがあります
              </div>
              <div className="mt-2 space-y-1 text-xs text-destructive">
                {selectedNodeValidationIssues.slice(0, 3).map((issue) => (
                  <p key={`${issue.path.join(".")}:${issue.message}`}>
                    {issue.message}
                  </p>
                ))}
                {selectedNodeValidationIssues.length > 3 ? (
                  <p>
                    他 {selectedNodeValidationIssues.length - 3}{" "}
                    件のエラーがあります
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {isMultiSelection ? (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {editableSelectedNodeIds.length} nodes selected
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Ctrl/Cmd/Shift
                    クリックで複数選択します。グループ化と等間隔分布は同じ
                    absolute 親枠内の固定サイズ要素だけに適用されます。
                  </p>
                </div>
                <Badge variant="secondary">Multi</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={groupSelectedNodes}
                  disabled={isMutationBlocked || !canGroupSelectedNodes}
                >
                  Group
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={removeSelectedNode}
                  disabled={isMutationBlocked}
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => distributeSelectedNodes("horizontal")}
                  disabled={isMutationBlocked || !canDistributeSelectedNodes}
                >
                  横に分布
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => distributeSelectedNodes("vertical")}
                  disabled={isMutationBlocked || !canDistributeSelectedNodes}
                >
                  縦に分布
                </Button>
              </div>
            </div>
          ) : null}

          {!isMultiSelection && canUngroupSelectedNode ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Group</p>
                  <p className="text-xs text-muted-foreground">
                    この frame の子要素を親の absolute 枠へ戻します。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={ungroupSelectedNode}
                  disabled={isMutationBlocked}
                >
                  Ungroup
                </Button>
              </div>
            </div>
          ) : null}

          <InspectorField label="Node Name" error={selectedNodeNameError}>
            <Input
              value={selectedNode.name}
              disabled={isSelectedNodeEditingDisabled}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  node.name = event.target.value;
                })
              }
            />
          </InspectorField>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={duplicateSelectedNode}
              disabled={
                selectedNode.id === document.rootId ||
                isSelectedNodeEditingDisabled ||
                isMultiSelection
              }
            >
              <IconCopy className="mr-2 h-4 w-4" />
              複製
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => moveSelectedNode(-1)}
              disabled={
                !canMoveNode(selectedNode.id, -1) ||
                isSelectedNodeEditingDisabled ||
                isMultiSelection
              }
            >
              <IconArrowUp className="mr-2 h-4 w-4" />
              上へ
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => moveSelectedNode(1)}
              disabled={
                !canMoveNode(selectedNode.id, 1) ||
                isSelectedNodeEditingDisabled ||
                isMultiSelection
              }
            >
              <IconArrowDown className="mr-2 h-4 w-4" />
              下へ
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={removeSelectedNode}
              disabled={
                selectedNode.id === document.rootId ||
                isSelectedNodeEditingDisabled
              }
            >
              <IconTrash className="mr-2 h-4 w-4" />
              削除
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InspectorField
              label="Hidden"
              description={
                breakpoint === "desktop"
                  ? "Desktop の表示状態が base になります。"
                  : hasVisibilityOverride
                    ? `${breakpoint} の非表示 override を編集中です。`
                    : `${breakpoint} は上位 breakpoint の表示状態を継承しています。`
              }
            >
              <div className="flex min-h-9 items-center gap-2">
                <Switch
                  checked={isSelectedNodeHidden}
                  disabled={
                    selectedNode.id === document.rootId ||
                    isSelectedNodeEditingDisabled
                  }
                  onCheckedChange={(checked) =>
                    updateSelectedNode((node) => {
                      setPageBuilderNodeHidden(node, breakpoint, checked);
                    })
                  }
                />
                {breakpoint !== "desktop" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      selectedNode.id === document.rootId ||
                      isSelectedNodeEditingDisabled ||
                      !hasVisibilityOverride
                    }
                    onClick={() =>
                      updateSelectedNode((node) => {
                        clearPageBuilderNodeVisibilityOverride(
                          node,
                          breakpoint,
                        );
                      })
                    }
                  >
                    Override をリセット
                  </Button>
                ) : null}
              </div>
            </InspectorField>

            <InspectorField label="Locked">
              <div className="flex h-9 items-center">
                <Switch
                  checked={selectedNode.locked}
                  disabled={
                    selectedNode.id === document.rootId || isMutationBlocked
                  }
                  onCheckedChange={(checked) =>
                    updateSelectedNode(
                      (node) => {
                        node.locked = checked;
                      },
                      { allowLocked: true },
                    )
                  }
                />
              </div>
            </InspectorField>
          </div>

          {isSelectedNodeLocked ? (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              このノードはロック中です。ロック解除まで Inspector
              編集、削除、移動は無効です。
            </div>
          ) : null}

          <fieldset
            disabled={isSelectedNodeLocked}
            className={
              isSelectedNodeLocked
                ? "min-w-0 pointer-events-none space-y-5 opacity-60"
                : "min-w-0 space-y-5"
            }
          >
            {selectedNode.type === "root" ? (
              <>
                <Separator />
                <InspectorField label="Canvas Width">
                  <Select
                    value={document.canvas.width}
                    onValueChange={(value) =>
                      applyDocumentMutation((draft) => {
                        if (value === "boxed" || value === "full") {
                          draft.canvas.width = value;
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANVAS_WIDTH_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InspectorField>

                <InspectorField label="Canvas Background">
                  <Select
                    value={document.canvas.backgroundToken}
                    onValueChange={(value) =>
                      applyDocumentMutation((draft) => {
                        if (
                          value === "background" ||
                          value === "foreground" ||
                          value === "muted" ||
                          value === "muted-foreground" ||
                          value === "card" ||
                          value === "border" ||
                          value === "primary" ||
                          value === "primary-foreground" ||
                          value === "accent"
                        ) {
                          draft.canvas.backgroundToken = value;
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_TOKEN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InspectorField>
              </>
            ) : null}

            <Separator />

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Responsive Layout</p>
                  <p className="text-xs text-muted-foreground">
                    {breakpoint === "desktop"
                      ? "Desktop は base layout です。tablet / mobile はここを継承します。"
                      : hasBreakpointOverride
                        ? `${breakpoint} は override を保持しています。`
                        : `${breakpoint} は上位 breakpoint の layout を継承しています。`}
                  </p>
                </div>

                {breakpoint !== "desktop" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasBreakpointOverride}
                    onClick={() =>
                      updateSelectedNode((node) => {
                        clearPageBuilderNodeLayoutOverride(node, breakpoint);
                      })
                    }
                  >
                    Override をリセット
                  </Button>
                ) : (
                  <Badge variant="secondary">Base</Badge>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Canvas Align</p>
                  <p className="text-xs text-muted-foreground">
                    Absolute 親枠の中で選択ノードを端・中央へ揃えます。
                  </p>
                </div>
                <Badge variant={canAlignSelectedNode ? "secondary" : "outline"}>
                  {canAlignSelectedNode ? "Available" : "Absolute only"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {CANVAS_ALIGNMENT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={
                      isMutationBlocked ||
                      !canAlignSelectedNodeOnCanvas(option.value)
                    }
                    onClick={() => alignSelectedNodeOnCanvas(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <InspectorField label="Width Mode">
                <Select
                  value={getSizeMode(activeBox.width)}
                  onValueChange={(value) => updateSizeMode("width", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="hug">Hug</SelectItem>
                    <SelectItem value="fill">Fill</SelectItem>
                  </SelectContent>
                </Select>
              </InspectorField>

              <InspectorField label="Height Mode">
                <Select
                  value={getSizeMode(activeBox.height)}
                  onValueChange={(value) => updateSizeMode("height", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="hug">Hug</SelectItem>
                    <SelectItem value="fill">Fill</SelectItem>
                  </SelectContent>
                </Select>
              </InspectorField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InspectorField label="Width">
                <Input
                  type="number"
                  value={
                    typeof activeBox.width === "number" ? activeBox.width : ""
                  }
                  disabled={typeof activeBox.width !== "number"}
                  onChange={(event) =>
                    updateFixedSize("width", event.target.value)
                  }
                />
              </InspectorField>

              <InspectorField label="Height">
                <Input
                  type="number"
                  value={
                    typeof activeBox.height === "number" ? activeBox.height : ""
                  }
                  disabled={typeof activeBox.height !== "number"}
                  onChange={(event) =>
                    updateFixedSize("height", event.target.value)
                  }
                />
              </InspectorField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <InspectorField label="X">
                <Input
                  type="number"
                  value={activeBox.x}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedBox((box) => {
                      box.x = parsed;
                    });
                  }}
                />
              </InspectorField>

              <InspectorField label="Y">
                <Input
                  type="number"
                  value={activeBox.y}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedBox((box) => {
                      box.y = parsed;
                    });
                  }}
                />
              </InspectorField>

              <InspectorField label="Z Index">
                <Input
                  type="number"
                  value={activeBox.zIndex ?? 0}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedBox((box) => {
                      box.zIndex = parsed;
                    });
                  }}
                />
              </InspectorField>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <InspectorField label="Background Token">
                <Select
                  value={
                    selectedNode.style.backgroundToken ?? NONE_SELECT_VALUE
                  }
                  onValueChange={(value) =>
                    setOptionalStyleToken("backgroundToken", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SELECT_VALUE}>なし</SelectItem>
                    {COLOR_TOKEN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InspectorField>

              <InspectorField label="Border Token">
                <Select
                  value={selectedNode.style.borderToken ?? NONE_SELECT_VALUE}
                  onValueChange={(value) =>
                    setOptionalStyleToken("borderToken", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SELECT_VALUE}>なし</SelectItem>
                    {COLOR_TOKEN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InspectorField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <InspectorField label="Padding">
                <Input
                  type="number"
                  value={selectedNode.style.padding ?? 0}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedNode((node) => {
                      node.style.padding = parsed;
                    });
                  }}
                />
              </InspectorField>

              <InspectorField label="Gap">
                <Input
                  type="number"
                  value={selectedNode.style.gap ?? 0}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedNode((node) => {
                      node.style.gap = parsed;
                    });
                  }}
                />
              </InspectorField>

              <InspectorField label="Radius">
                <Input
                  type="number"
                  value={selectedNode.style.borderRadius ?? 0}
                  onChange={(event) => {
                    const parsed = parseInteger(event.target.value);
                    if (parsed === null) {
                      return;
                    }
                    updateSelectedNode((node) => {
                      node.style.borderRadius = parsed;
                    });
                  }}
                />
              </InspectorField>
            </div>

            {canHaveChildren(selectedNode) ? (
              <>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <InspectorField label="Layout Mode">
                    <Select
                      value={selectedNode.layoutMode}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            value === "stack" ||
                            value === "absolute" ||
                            value === "grid"
                          ) {
                            node.layoutMode = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LAYOUT_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>

                  {selectedNode.layoutMode === "grid" ? (
                    <InspectorField
                      label="Min Column"
                      description="列幅の最小値です。狭い画面では自動で折り返します。"
                    >
                      <Input
                        type="number"
                        min={120}
                        max={640}
                        value={selectedNode.style.gridMinColumnWidth ?? 240}
                        onChange={(event) => {
                          const parsed = parseInteger(event.target.value);
                          if (parsed === null) {
                            return;
                          }
                          updateSelectedNode((node) => {
                            node.style.gridMinColumnWidth = Math.min(
                              640,
                              Math.max(120, parsed),
                            );
                          });
                        }}
                      />
                    </InspectorField>
                  ) : (
                    <InspectorField label="Direction">
                      <Select
                        value={selectedNode.style.direction ?? "column"}
                        onValueChange={(value) =>
                          updateSelectedNode((node) => {
                            if (value === "column" || value === "row") {
                              node.style.direction = value;
                            }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIRECTION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </InspectorField>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <InspectorField label="Align Items">
                    <Select
                      value={selectedNode.style.alignItems ?? "start"}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            value === "start" ||
                            value === "center" ||
                            value === "end" ||
                            value === "stretch"
                          ) {
                            node.style.alignItems = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALIGN_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>

                  <InspectorField label="Justify Content">
                    <Select
                      value={selectedNode.style.justifyContent ?? "start"}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            value === "start" ||
                            value === "center" ||
                            value === "end" ||
                            value === "space-between"
                          ) {
                            node.style.justifyContent = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JUSTIFY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>
                </div>
              </>
            ) : null}

            {selectedNode.type === "text" ? (
              <>
                <Separator />
                <InspectorField
                  label="Text Content"
                  error={selectedNodeTextContentError}
                >
                  <Textarea
                    rows={6}
                    value={selectedNode.content.text}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "text") {
                          node.content.text = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <InspectorField label="Text Tag">
                    <Select
                      value={selectedNode.content.tag}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            node.type === "text" &&
                            (value === "p" ||
                              value === "h1" ||
                              value === "h2" ||
                              value === "h3")
                          ) {
                            node.content.tag = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXT_TAG_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>

                  <InspectorField label="Text Token">
                    <Select
                      value={selectedNode.style.textToken ?? NONE_SELECT_VALUE}
                      onValueChange={(value) =>
                        setOptionalStyleToken("textToken", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_SELECT_VALUE}>なし</SelectItem>
                        {COLOR_TOKEN_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <InspectorField label="Font Size">
                    <Input
                      type="number"
                      value={selectedNode.style.fontSize ?? 16}
                      onChange={(event) => {
                        const parsed = parseInteger(event.target.value);
                        if (parsed === null) {
                          return;
                        }
                        updateSelectedNode((node) => {
                          if (node.type === "text") {
                            node.style.fontSize = parsed;
                          }
                        });
                      }}
                    />
                  </InspectorField>

                  <InspectorField label="Font Weight">
                    <Select
                      value={selectedNode.style.fontWeight ?? "400"}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            node.type === "text" &&
                            (value === "400" ||
                              value === "500" ||
                              value === "600" ||
                              value === "700")
                          ) {
                            node.style.fontWeight = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_WEIGHT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>

                  <InspectorField label="Text Align">
                    <Select
                      value={selectedNode.style.textAlign ?? "left"}
                      onValueChange={(value) =>
                        updateSelectedNode((node) => {
                          if (
                            node.type === "text" &&
                            (value === "left" ||
                              value === "center" ||
                              value === "right")
                          ) {
                            node.style.textAlign = value;
                          }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXT_ALIGN_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InspectorField>
                </div>
              </>
            ) : null}

            {selectedNode.type === "image" ? (
              <>
                <Separator />
                <InspectorField
                  label="Image Asset"
                  description="Media Library かアップロードから画像を選択します。URL 直接入力は許可しません。"
                  error={selectedNodeImageMediaError}
                >
                  <div className="space-y-3">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-dashed border-border bg-muted/20">
                      {selectedImageAsset ? (
                        <Image
                          src={selectedImageAsset.url}
                          alt={
                            selectedNode.content.alt ||
                            selectedImageAsset.alt ||
                            ""
                          }
                          fill
                          sizes="320px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          画像を選択してください
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openSelectedImagePicker}
                        disabled={isMutationBlocked}
                      >
                        {selectedImageAsset ? (
                          <IconPhoto className="mr-2 h-4 w-4" />
                        ) : (
                          <IconPhotoPlus className="mr-2 h-4 w-4" />
                        )}
                        {selectedImageAsset ? "画像を変更" : "画像を選択"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={clearSelectedImage}
                        disabled={
                          selectedImageAsset === null || isMutationBlocked
                        }
                      >
                        <IconTrash className="mr-2 h-4 w-4" />
                        画像を削除
                      </Button>
                    </div>

                    {selectedImageAsset ? (
                      <p className="text-xs text-muted-foreground">
                        asset: {selectedImageAsset.filename}
                      </p>
                    ) : null}
                  </div>
                </InspectorField>

                <InspectorField
                  label="Alt Text"
                  error={selectedNodeImageAltError}
                >
                  <Input
                    value={selectedNode.content.alt}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "image") {
                          node.content.alt = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>

                <InspectorField label="Object Fit">
                  <Select
                    value={selectedNode.content.objectFit}
                    onValueChange={(value) =>
                      updateSelectedNode((node) => {
                        if (
                          node.type === "image" &&
                          (value === "cover" || value === "contain")
                        ) {
                          node.content.objectFit = value;
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_FIT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InspectorField>
              </>
            ) : null}

            {selectedNode.type === "button" ? (
              <>
                <Separator />
                <InspectorField
                  label="Button Label"
                  error={selectedNodeButtonLabelError}
                >
                  <Input
                    value={selectedNode.content.label}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "button") {
                          node.content.label = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>

                <InspectorField
                  label="Button URL"
                  description="内部パス(`/contact`) または `https://...` のURLを指定します。"
                  error={selectedNodeButtonUrlError}
                >
                  <Input
                    value={selectedNode.content.url}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "button") {
                          node.content.url = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>

                <InspectorField label="Button Variant">
                  <Select
                    value={selectedNode.content.variant}
                    onValueChange={(value) =>
                      updateSelectedNode((node) => {
                        if (
                          node.type === "button" &&
                          (value === "primary" ||
                            value === "secondary" ||
                            value === "ghost")
                        ) {
                          node.content.variant = value;
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUTTON_VARIANT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InspectorField>
              </>
            ) : null}

            {selectedNode.type === "embed" ? (
              <>
                <Separator />
                <InspectorField label="Provider">
                  <Select
                    value={selectedNode.content.provider}
                    onValueChange={(value) =>
                      updateSelectedNode((node) => {
                        if (
                          node.type === "embed" &&
                          (value === "youtube" ||
                            value === "google-maps" ||
                            value === "instagram")
                        ) {
                          node.content.provider = value;
                        }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMBED_PROVIDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </InspectorField>

                <InspectorField
                  label="Embed URL"
                  description={getPageBuilderEmbedInputHint(
                    selectedNode.content.provider,
                  )}
                  error={selectedNodeEmbedUrlError}
                >
                  <Input
                    value={selectedNode.content.url}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "embed") {
                          node.content.url = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>
              </>
            ) : null}

            {selectedNode.type === "form" ? (
              <>
                <Separator />
                <InspectorField
                  label="Title"
                  error={selectedNodeFormTitleError}
                >
                  <Input
                    value={selectedNode.content.title ?? ""}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "form") {
                          node.content.title = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>

                <InspectorField
                  label="Description"
                  error={selectedNodeFormDescriptionError}
                >
                  <Textarea
                    rows={4}
                    value={selectedNode.content.description ?? ""}
                    onChange={(event) =>
                      updateSelectedNode((node) => {
                        if (node.type === "form") {
                          node.content.description = event.target.value;
                        }
                      })
                    }
                  />
                </InspectorField>
              </>
            ) : null}
          </fieldset>

          <Separator />

          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            slug: /{page.slug}
            <br />
            last draft save: {formatDateTime(lastSavedAt)}
            <br />
            autosave status: {saveStatusMeta.label}
            <br />
            selected node id: {selectedNode.id}
          </div>
        </PageBuilderInspectorPanel>
      </div>
      <AlertDialog
        open={pendingRestoreRevision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRestoreRevisionId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>revision を復元しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRestoreRevision
                ? `${pendingRestoreRevision.kind === "published" ? "公開版" : "下書き"} v${pendingRestoreRevision.version} を現在の draft に復元します。`
                : "復元対象の revision を確認しています。"}
              {isDirty
                ? " 未保存の変更は破棄されます。"
                : " 現在の保存済み draft は新しい revision として残ります。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleRestoreRevision();
              }}
              disabled={pendingRestoreRevision === null || isRestoring}
            >
              {isRestoring ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              復元する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {imagePicker.mediaPickerDialog}
    </PageBuilderEditorShell>
  );
}
