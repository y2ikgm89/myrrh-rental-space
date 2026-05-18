/**
 * PortableText editor で `/icon` slash command を検出するヘルパー。
 *
 * inline / block 両 editor から共有利用する純粋関数。
 *
 * 仕様:
 * - cursor 直前のテキストが `/icon`（case-insensitive）で終わる時のみ検出
 * - selection が collapsed（範囲選択なし、cursor のみ）でかつ root 配下のとき
 * - 検出したら trigger range（text node + start/end offset）を返す
 */

const SLASH_ICON_TRIGGER = /\/icon$/i;

export interface SlashTrigger {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

export function detectSlashIconTrigger(root: HTMLElement): SlashTrigger | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  if (!root.contains(range.startContainer)) return null;
  const textNode = range.startContainer;
  if (!(textNode instanceof Text)) return null;
  const beforeCursor = textNode.data.slice(0, range.startOffset);
  const match = beforeCursor.match(SLASH_ICON_TRIGGER);
  if (!match) return null;
  return {
    node: textNode,
    start: range.startOffset - match[0].length,
    end: range.startOffset,
  };
}

/**
 * 検出済み trigger range を element で置換し、cursor を element 直後に移動する。
 *
 * 呼び出し側で element の生成（icon chip span 等）を行ってから渡す。
 */
export function replaceTriggerWithElement(
  trigger: SlashTrigger,
  element: HTMLElement,
): void {
  const range = document.createRange();
  range.setStart(trigger.node, trigger.start);
  range.setEnd(trigger.node, trigger.end);
  range.deleteContents();
  range.insertNode(element);
  range.setStartAfter(element);
  range.setEndAfter(element);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
