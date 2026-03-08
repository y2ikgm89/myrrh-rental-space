"use client";

import type { ReactNode } from "react";
import { SmoothScrollProvider } from "@/public/components/providers/SmoothScrollProvider";
import {
  PerformanceMonitor,
  ScrollOrchestratorProvider,
  VisualEffectsProvider,
} from "@/public/components/effects/core";

export function ExperienceShell({ children }: { children: ReactNode }) {
  return (
    <SmoothScrollProvider>
      <ScrollOrchestratorProvider>
        <VisualEffectsProvider>
          {children}
          <PerformanceMonitor />
        </VisualEffectsProvider>
      </ScrollOrchestratorProvider>
    </SmoothScrollProvider>
  );
}
