"use client";

/**
 * 公開 chrome の auth kind を hydrate 後に取得する。
 *
 * 初期 HTML（CDN キャッシュ対象）には kind を埋め込まず、neutral skeleton を
 * 出し続けてから `/api/customer/auth-kind`（private, no-store）で解決する。
 */

import { useEffect, useState } from "react";
import {
  isPublicAuthKind,
  type PublicAuthKind,
} from "@/shared/lib/public-auth-kind";
import { isRecord } from "@/shared/lib/serialize";

export type PublicAuthKindStatus = "loading" | "ready";

export type PublicAuthKindState = {
  readonly status: PublicAuthKindStatus;
  readonly kind: PublicAuthKind;
};

const AUTH_KIND_ENDPOINT = "/api/customer/auth-kind";

function parseAuthKindPayload(data: unknown): PublicAuthKind | null {
  if (!isRecord(data)) return null;
  const kind = data["kind"];
  return isPublicAuthKind(kind) ? kind : null;
}

export function usePublicAuthKind(): PublicAuthKindState {
  const [state, setState] = useState<PublicAuthKindState>({
    status: "loading",
    kind: null,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(AUTH_KIND_ENDPOINT, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          if (!cancelled) {
            // Fail closed to guest CTA — public info, never another user's mypage.
            setState({ status: "ready", kind: "login" });
          }
          return;
        }
        const payload: unknown = await response.json();
        const kind = parseAuthKindPayload(payload) ?? "login";
        if (!cancelled) {
          setState({ status: "ready", kind });
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setState({ status: "ready", kind: "login" });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}
