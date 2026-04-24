import { clonePageBuilderDocument } from "./document-operations";
import type { PageBuilderDocument } from "./schema";

const MAX_PAGE_BUILDER_HISTORY_ENTRIES = 100;

export type PageBuilderHistoryEntry = {
  document: PageBuilderDocument;
  snapshot: string;
};

export type PageBuilderHistoryState = {
  past: PageBuilderHistoryEntry[];
  future: PageBuilderHistoryEntry[];
};

export type PageBuilderHistoryTransition = {
  document: PageBuilderDocument;
  snapshot: string;
  history: PageBuilderHistoryState;
};

export function createEmptyPageBuilderHistoryState(): PageBuilderHistoryState {
  return {
    past: [],
    future: [],
  };
}

export function createPageBuilderHistoryEntry(
  document: PageBuilderDocument,
): PageBuilderHistoryEntry {
  return {
    document: clonePageBuilderDocument(document),
    snapshot: JSON.stringify(document),
  };
}

function trimPageBuilderHistoryEntries(
  entries: PageBuilderHistoryEntry[],
): PageBuilderHistoryEntry[] {
  if (entries.length <= MAX_PAGE_BUILDER_HISTORY_ENTRIES) {
    return entries;
  }

  return entries.slice(entries.length - MAX_PAGE_BUILDER_HISTORY_ENTRIES);
}

export function canUndoPageBuilderHistory(
  history: PageBuilderHistoryState,
): boolean {
  return history.past.length > 0;
}

export function canRedoPageBuilderHistory(
  history: PageBuilderHistoryState,
): boolean {
  return history.future.length > 0;
}

export function pushPageBuilderHistory(
  history: PageBuilderHistoryState,
  current: PageBuilderHistoryEntry,
  next: PageBuilderHistoryEntry,
): PageBuilderHistoryState {
  if (current.snapshot === next.snapshot) {
    return history;
  }

  return {
    past: trimPageBuilderHistoryEntries([...history.past, current]),
    future: [],
  };
}

export function undoPageBuilderHistory(
  history: PageBuilderHistoryState,
  current: PageBuilderHistoryEntry,
): PageBuilderHistoryTransition | null {
  const previous = history.past.at(-1);
  if (!previous) {
    return null;
  }

  return {
    document: clonePageBuilderDocument(previous.document),
    snapshot: previous.snapshot,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
  };
}

export function redoPageBuilderHistory(
  history: PageBuilderHistoryState,
  current: PageBuilderHistoryEntry,
): PageBuilderHistoryTransition | null {
  const next = history.future[0];
  if (!next) {
    return null;
  }

  return {
    document: clonePageBuilderDocument(next.document),
    snapshot: next.snapshot,
    history: {
      past: trimPageBuilderHistoryEntries([...history.past, current]),
      future: history.future.slice(1),
    },
  };
}
