"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";

const STORAGE_KEY = "admin:integration-health-alert:dismissed";
const SERVER_SNAPSHOT: string | null = null;
const noopSubscribe = () => () => {};

export type IntegrationHealthAlertItem = {
  readonly key: string;
  readonly label: string;
  readonly href:
    | "/admin/settings/integrations?tab=resend"
    | "/admin/settings/integrations?tab=turnstile"
    | "/admin/settings/integrations?tab=calendar"
    | "/admin/settings/billing?tab=payment";
};

type Props = {
  readonly items: readonly IntegrationHealthAlertItem[];
};

function buildSignature(items: readonly IntegrationHealthAlertItem[]): string {
  return items
    .map((i) => i.key)
    .toSorted((a, b) => a.localeCompare(b))
    .join(",");
}

function readDismissedSignature(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function IntegrationHealthAlertClient({
  items,
}: Props): ReactElement | null {
  const signature = buildSignature(items);

  const snapshotRef = useRef<string | null>(null);
  const persistedSignature = useSyncExternalStore(
    noopSubscribe,
    () => {
      snapshotRef.current ??= readDismissedSignature();
      return snapshotRef.current;
    },
    () => SERVER_SNAPSHOT,
  );

  const [optimisticDismissed, setOptimisticDismissed] = useState(false);

  const isPersistedDismissed = persistedSignature === signature;
  if (isPersistedDismissed || optimisticDismissed) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, signature);
      snapshotRef.current = signature;
    } catch {
      // localStorage アクセス失敗は無視（Safari Private Mode 等）
    }
    setOptimisticDismissed(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"
    >
      <IconAlertTriangle
        className="h-5 w-5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="flex-1">
        <h2 className="font-medium text-foreground">
          未設定の外部連携が {items.length} 件あります
        </h2>
        <p className="mt-1 text-muted-foreground">
          以下の連携を設定すると関連機能が有効になります。
        </p>
        <ul className="mt-3 space-y-1.5">
          {items.map((integration) => (
            <li key={integration.key}>
              <Link
                href={integration.href}
                className="text-foreground underline underline-offset-4 hover:text-accent"
              >
                {integration.label}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">未設定</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="この通知を閉じる"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-warning/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <IconX className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
