"use client";

import { createContext, use, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";

type NotificationPollingContextValue = {
  unreadCount: number;
  refresh: () => void;
};

type UnreadCountResponse = {
  unreadCount: number;
};

async function readUnreadCount(): Promise<number> {
  const response = await fetchAdminJson<UnreadCountResponse>(
    "/admin/api/notifications/unread-count",
    { cache: "no-store" },
  );
  return response.unreadCount;
}

const NotificationPollingContext = createContext<
  NotificationPollingContextValue | undefined
>(undefined);

const POLLING_INTERVAL_MS = 30_000;

export function NotificationPollingProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(initialCount);

  const refresh = () => {
    void readUnreadCount()
      .then(setUnreadCount)
      .catch(() => {
        // Keep the last known count when polling fails.
      });
  };

  // Polling
  useEffect(() => {
    const intervalId = setInterval(() => {
      void readUnreadCount()
        .then(setUnreadCount)
        .catch(() => {
          // Keep the last known count when polling fails.
        });
    }, POLLING_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Tab title update
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title =
      unreadCount > 0 ? `(${String(unreadCount)}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [unreadCount]);

  return (
    <NotificationPollingContext value={{ unreadCount, refresh }}>
      {children}
    </NotificationPollingContext>
  );
}

export function useNotificationPolling(): NotificationPollingContextValue {
  const ctx = use(NotificationPollingContext);
  if (ctx === undefined) {
    throw new Error(
      "useNotificationPolling must be used within NotificationPollingProvider",
    );
  }
  return ctx;
}
