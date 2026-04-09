"use client";

import { createContext, use, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { fetchUnreadCount } from "@/admin/actions/notification-polling";

type NotificationPollingContextValue = {
  unreadCount: number;
  refresh: () => void;
};

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
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  // Sync initialCount prop changes (e.g. after router.refresh())
  useEffect(() => {
    setUnreadCount(initialCount);
  }, [initialCount]);

  const refresh = () => {
    void fetchUnreadCount().then(setUnreadCount);
  };

  // Polling
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchUnreadCount().then(setUnreadCount);
    }, POLLING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Tab title update
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title =
      unreadCount > 0 ? `(${String(unreadCount)}) ${baseTitle}` : baseTitle;
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
