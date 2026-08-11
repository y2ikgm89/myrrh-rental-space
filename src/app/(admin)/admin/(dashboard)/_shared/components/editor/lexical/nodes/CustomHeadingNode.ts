/**
 * CustomHeadingNode
 *
 * HeadingNode（@lexical/rich-text）を継承し、NodeState API で `anchorId` を管理する。
 * Node Replacement パターンで登録することで `$createHeadingNode` や
 * MarkdownShortcutPlugin 経由で作成される heading も自動的に CustomHeadingNode となる。
 *
 * `anchorId` は公開記事ページの目次（ArticleTableOfContents）アンカー URL に使用する。
 * register-heading-anchor-transform プラグインが textContent から slug を生成して
 * 自動で populate する（重複は `-1`/`-2` 付番）。
 */

import {
  $getState,
  $getStateChange,
  $setState,
  createState,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { HeadingNode, type HeadingTagType } from "@lexical/rich-text";
import { parseString } from "../config/type-guards";

export const anchorIdState = createState("anchorId", {
  parse: parseString,
});

export class CustomHeadingNode extends HeadingNode {
  override $config() {
    return this.config("custom-heading", {
      extends: HeadingNode,
      stateConfigs: [{ flat: true, stateConfig: anchorIdState }],
    });
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    const anchorId = $getState(this, anchorIdState);
    if (anchorId) dom.id = anchorId;
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const change = $getStateChange(this, prevNode, anchorIdState);
    if (change !== null) {
      const [anchorId] = change;
      if (anchorId) {
        dom.id = anchorId;
      } else {
        dom.removeAttribute("id");
      }
    }
    return false;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const result = super.exportDOM(editor);
    if (result.element instanceof HTMLElement) {
      const anchorId = $getState(this, anchorIdState);
      if (anchorId) {
        result.element.id = anchorId;
      }
    }
    return result;
  }

  static override importDOM(): DOMConversionMap | null {
    // Lexical 0.49 で組み込みノードが $config() プロトコルへ移行し、静的 importDOM()
    // は「登録時に getStaticNodeConfig() がクラスへ生やす」遅延生成になった。
    // そのため `HeadingNode.importDOM` は生成が走るまで undefined で、参照は登録順に
    // 依存する（型も optional になる）。$config() 側は this.config() に literal を
    // 渡すだけの純粋な宣言なので、順序に依存しないこちらから converter を取る。
    // $config() の戻り型は converter を literal（0 引数）として推論するため、
    // DOMConversionMap（= 引数付きの契約型）で受け直す。
    const base: DOMConversionMap | undefined =
      HeadingNode.prototype.$config().heading?.importDOM;
    if (!base) return null;

    const result: DOMConversionMap = {};
    for (const [tag, converter] of Object.entries(base)) {
      if (!converter) continue;
      result[tag] = (node: HTMLElement) => {
        const output = converter(node);
        if (!output) return null;
        const originalConversion = output.conversion;
        return {
          ...output,
          // Node Replacement で登録される生 HeadingNode.importDOM() の重複エントリと
          // priority が同点だと tie-break で登録順が後の方が勝つため、常に上回るよう明示する
          priority: 1,
          conversion: (element: HTMLElement) => {
            const converted = originalConversion(element);
            if (!converted) return null;
            const { node: convertedNode } = converted;
            const id = element.getAttribute("id");
            if (id && convertedNode instanceof CustomHeadingNode) {
              $setState(convertedNode, anchorIdState, id);
            }
            return converted;
          },
        };
      };
    }
    return result;
  }
}

export function $createCustomHeadingNode(
  tag: HeadingTagType,
  anchorId = "",
): CustomHeadingNode {
  // HeadingNode constructor が tag を必要とするため new で直接生成する
  // （$create は引数を渡せない）。Lexical 公式 $createHeadingNode と同じパターン。
  const node = new CustomHeadingNode(tag);
  if (anchorId) {
    $setState(node, anchorIdState, anchorId);
  }
  return node;
}

export function $isCustomHeadingNode(
  node: LexicalNode | null | undefined,
): node is CustomHeadingNode {
  return node instanceof CustomHeadingNode;
}
