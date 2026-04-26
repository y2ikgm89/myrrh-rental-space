"use client";

export function openExternalTab(url: string | URL): Window | null {
  return window.open(url.toString(), "_blank", "noopener,noreferrer");
}
