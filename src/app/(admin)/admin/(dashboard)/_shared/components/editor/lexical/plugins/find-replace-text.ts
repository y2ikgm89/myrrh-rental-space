/**
 * Pure string match / replace-all for the Lexical find-replace plugin.
 * Resume after the full search length so overlapping text is not counted twice.
 */

export type TextMatch = {
  startOffset: number;
  endOffset: number;
};

export function findMatches(
  text: string,
  searchText: string,
  caseSensitive = false,
): TextMatch[] {
  if (!searchText) return [];

  const matches: TextMatch[] = [];
  const normalizedSearch = caseSensitive
    ? searchText
    : searchText.toLowerCase();
  const normalizedText = caseSensitive ? text : text.toLowerCase();

  let startIndex = 0;
  while (startIndex < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedSearch, startIndex);
    if (index === -1) break;

    matches.push({
      startOffset: index,
      endOffset: index + searchText.length,
    });
    startIndex = index + searchText.length;
  }

  return matches;
}

export function replaceAll(
  text: string,
  searchText: string,
  replaceText: string,
  caseSensitive = false,
): string {
  if (!searchText) return text;

  const normalizedSearch = caseSensitive
    ? searchText
    : searchText.toLowerCase();
  const normalizedText = caseSensitive ? text : text.toLowerCase();

  let result = "";
  let lastIndex = 0;
  let startIdx = 0;
  while (startIdx < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedSearch, startIdx);
    if (index === -1) break;

    result += text.slice(lastIndex, index) + replaceText;
    lastIndex = index + searchText.length;
    startIdx = index + searchText.length;
  }
  result += text.slice(lastIndex);
  return result;
}
