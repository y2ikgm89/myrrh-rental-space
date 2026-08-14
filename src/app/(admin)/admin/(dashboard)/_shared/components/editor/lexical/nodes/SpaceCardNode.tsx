/**
 * Space Card Node
 *
 * @description スペースの実データ（写真・料金・定員・予約ボタン）を記事本文に埋め込む
 * DecoratorNode。`exportDOM` は空のプレースホルダー `<a data-space-card-embed>` を
 * 出力し、公開描画時に `resolveSpaceCardEmbeds`（`@/shared/domain/spaces/resolve-space-card-embeds`）
 * が DB から最新のスペースデータを解決してカード本体へ差し替える。参照先が削除/非公開なら
 * 自動で非表示になる（404 カードを防ぐ、`InternalLinkCardNode` と同じ方針）。
 *
 * `spaceName` state は挿入/差し替え時に検索結果から複製されるエディタ表示ヒントに
 * すぎない（公開 HTML には一切出力しない）。参照先の名前が変わっても自動更新はされない
 * — 純粋な編集補助であり、公開側の正しさは `spaceId` の解決結果のみが担保する。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { IconBuilding } from "@tabler/icons-react";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const spaceCardSpaceIdState = createState("spaceId", {
  parse: parseString,
});

export const spaceCardSpaceNameState = createState("spaceName", {
  parse: parseString,
});

// =============================================================================
// Editor preview component
// =============================================================================

function SpaceCardComponent({
  spaceName,
}: {
  spaceName: string;
}): ReactElement {
  return (
    <div
      data-space-card-embed
      className="my-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <IconBuilding
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          スペースカード（公開ページで最新情報に展開されます）
        </p>
        <p className="truncate text-sm font-medium">
          {spaceName || "（未設定）"}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertSpaceCardElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const spaceId = element.getAttribute("data-space-id") ?? "";
  const spaceName = element.getAttribute("data-space-name") ?? "";
  return { node: $createSpaceCardNode({ spaceId, spaceName }) };
}

// =============================================================================
// Node Class
// =============================================================================

export class SpaceCardNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("space-card-embed", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: spaceCardSpaceIdState },
        { flat: true, stateConfig: spaceCardSpaceNameState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      a: (element: HTMLElement) => {
        if (element.hasAttribute("data-space-card-embed")) {
          return { conversion: $convertSpaceCardElement, priority: 2 };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const spaceId = $getState(this, spaceCardSpaceIdState);
    const spaceName = $getState(this, spaceCardSpaceNameState);
    const link = document.createElement("a");
    link.setAttribute("data-space-card-embed", "true");
    link.setAttribute("data-space-id", spaceId);
    link.setAttribute("data-space-name", spaceName);
    link.setAttribute("href", "#");
    return { element: link };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-space-card-embed", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  /**
   * block DOM を出す DecoratorNode は block として扱わせる（監査 F-26）。
   *
   * Lexical の DecoratorNode 既定は `isInline() === true`。inline のままだと
   * `$insertNodes` が ParagraphNode の**子**として splice するので、exportDOM は
   * `<p>前半<div>…</div>後半</p>` を出す。保存パイプラインの enrich が DOMParser で
   * 再パースするため、HTML 仕様どおり `<div>` の直前で `<p>` が閉じられ、
   * **画像より後ろの本文が `<p>` の外へ出て段落スタイルを失い、末尾に空段落が残る**。
   * 編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、
   * 管理者には正常に見える。
   */
  override isInline(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <SpaceCardComponent
        spaceName={$getState(this, spaceCardSpaceNameState)}
      />
    );
  }
}

// =============================================================================
// Factory / Guard
// =============================================================================

export function $createSpaceCardNode({
  spaceId,
  spaceName,
}: {
  spaceId: string;
  spaceName: string;
}): SpaceCardNode {
  const node = $create(SpaceCardNode);
  $setState(node, spaceCardSpaceIdState, spaceId);
  $setState(node, spaceCardSpaceNameState, spaceName);
  return node;
}

export function $isSpaceCardNode(
  node: LexicalNode | null | undefined,
): node is SpaceCardNode {
  return node instanceof SpaceCardNode;
}
