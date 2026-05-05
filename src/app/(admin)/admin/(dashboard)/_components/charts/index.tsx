"use client";

/**
 * Charts barrel
 *
 * Recharts バンドルはダッシュボード初期表示時のみ必要なため dynamic import で遅延ロード。
 */

import dynamic from "next/dynamic";

export const ReservationChart = dynamic(
  () => import("./ReservationChart").then((mod) => mod.ReservationChart),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-[26rem] animate-pulse rounded-lg border border-border bg-card"
      />
    ),
  },
);
