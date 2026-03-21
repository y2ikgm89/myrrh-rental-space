/**
 * Lexical エディタのレイアウト定数（ContentEditable の padding と一致させること）。
 *
 * `DraggableBlockPlugin` のドロップライン・ドラッグハンドル位置計算の単一の正本。
 */

/** `pl-10`（2.5rem）— ドラッグハンドル用左ガター */
export const EDITOR_PADDING_LEFT = 40;

/** `pr-6`（1.5rem） */
export const EDITOR_PADDING_RIGHT = 24;

/** `maxWidth` 計算用（テキスト列幅 + 左右パディング） */
export const EDITOR_PADDING_HORIZONTAL = EDITOR_PADDING_LEFT + EDITOR_PADDING_RIGHT;
