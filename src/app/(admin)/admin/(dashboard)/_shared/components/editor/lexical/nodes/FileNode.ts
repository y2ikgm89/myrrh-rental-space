/**
 * File Node
 *
 * @description ファイル添付ダウンロードリンクを埋め込むDecoratorNode
 * server / headless でも import 可能。編集 UI は FileNode.decorator.client。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
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
import { parseString } from "../config/type-guards";
import { renderLexicalDecorator } from "./decorator-registry";

export const fileUrlState = createState("url", {
  parse: parseString,
});

export const fileNameState = createState("filename", {
  parse: parseString,
});

export const fileSizeState = createState("filesize", {
  parse: (v: unknown): number => (typeof v === "number" && v >= 0 ? v : 0),
});

export const fileMimeState = createState("mime", {
  parse: parseString,
});

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "不明";
  const units = ["B", "KB", "MB", "GB"] as const;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const unit = units[i] ?? "B";
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${unit}`;
}

export class FileNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("file", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: fileUrlState },
        { flat: true, stateConfig: fileNameState },
        { flat: true, stateConfig: fileSizeState },
        { flat: true, stateConfig: fileMimeState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      a: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-file")
        )
          return null;
        return {
          conversion: (element) => {
            const node = $createFileNode({
              url: element.getAttribute("href") ?? "",
              fileName: element.getAttribute("data-file-name") ?? "",
              fileSize: Number(element.getAttribute("data-file-size") ?? 0),
              mime: element.getAttribute("data-file-mime") ?? "",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-lexical-file", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM(): DOMExportOutput {
    const a = document.createElement("a");
    a.setAttribute("data-file", "true");
    a.setAttribute("href", $getState(this, fileUrlState));
    a.setAttribute("download", "");
    a.setAttribute("data-file-name", $getState(this, fileNameState));
    a.setAttribute("data-file-size", String($getState(this, fileSizeState)));
    a.setAttribute("data-file-mime", $getState(this, fileMimeState));
    const name = $getState(this, fileNameState);
    const size = formatFileSize($getState(this, fileSizeState));
    a.textContent = `ダウンロード: ${name} (${size})`;
    return { element: a };
  }

  override decorate(): ReactElement | null {
    return renderLexicalDecorator("file", {
      url: $getState(this, fileUrlState),
      fileName: $getState(this, fileNameState),
      fileSize: $getState(this, fileSizeState),
      mime: $getState(this, fileMimeState),
      nodeKey: this.getKey(),
    });
  }
}

/**
 * FileNodeを作成する
 *
 * @param params - ファイルのパラメータ
 * @returns FileNode インスタンス
 */
export function $createFileNode(params: {
  url: string;
  fileName: string;
  fileSize?: number;
  mime?: string;
}): FileNode {
  const node = $create(FileNode);
  $setState(node, fileUrlState, params.url);
  $setState(node, fileNameState, params.fileName);
  $setState(node, fileSizeState, params.fileSize ?? 0);
  $setState(node, fileMimeState, params.mime ?? "");
  return node;
}

/**
 * ノードがFileNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns FileNodeの場合true
 */
export function $isFileNode(
  node: LexicalNode | null | undefined,
): node is FileNode {
  return node instanceof FileNode;
}
