import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dismissed-announcement-bars";
const CHANGE_EVENT = "announcement-bar-dismissed";

/** Stable reference for SSR / hydration — `getServerSnapshot` must not return a new [] each call. */
const SERVER_DISMISSED_IDS: string[] = [];

let cachedIds: string[] = [];
let cachedJson = "";

function getSnapshot(): string[] {
  if (typeof window === "undefined") return cachedIds;
  try {
    const json = sessionStorage.getItem(STORAGE_KEY) ?? "";
    if (json !== cachedJson) {
      cachedJson = json;
      cachedIds = json ? JSON.parse(json) : [];
    }
    return cachedIds;
  } catch {
    return cachedIds;
  }
}

function getServerSnapshot(): string[] {
  return SERVER_DISMISSED_IDS;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function dismissBar(id: string): void {
  try {
    const current = getSnapshot();
    if (current.includes(id)) return;
    const next = [...current, id];
    const json = JSON.stringify(next);
    sessionStorage.setItem(STORAGE_KEY, json);
    cachedJson = json;
    cachedIds = next;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // sessionStorage unavailable
  }
}

export function useDismissedBars(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
