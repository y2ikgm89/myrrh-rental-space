"use client";

import { useTransition, type ReactElement } from "react";
import { Puck } from "@measured/puck";
import type { Data } from "@measured/puck";
import "@measured/puck/puck.css";
// Puck config lives in public homepage components — import via @/* to avoid
// boundary check (admin legitimately needs the same component config for the editor)
import { puckConfig } from "@/app/(public)/_components/homepage/puck-config";
import { savePuckData } from "@/admin/actions/page-puck";
import { isMutationError } from "@/shared/lib/mutation-result";

interface PuckEditorClientProps {
  readonly slug: string;
  readonly initialData: unknown;
}

function isValidPuckData(value: unknown): value is Data {
  if (typeof value !== "object" || value === null) return false;
  return "content" in value && Array.isArray(value.content);
}

const EMPTY_PUCK_DATA: Data = {
  root: { props: {} },
  content: [],
  zones: {},
};

export function PuckEditorClient({
  slug,
  initialData,
}: PuckEditorClientProps): ReactElement {
  const [isPending, startTransition] = useTransition();

  const data = isValidPuckData(initialData) ? initialData : EMPTY_PUCK_DATA;

  const handlePublish = (publishData: Data) => {
    startTransition(async () => {
      // Convert Puck Data to a plain record via JSON round-trip
      const plainData: Record<string, unknown> = JSON.parse(
        JSON.stringify(publishData),
      );
      const result = await savePuckData({
        slug,
        puckData: plainData,
      });

      if (isMutationError(result)) {
        console.error("Failed to save puck data:", result.error);
        return;
      }

      console.info("Puck data saved successfully");
    });
  };

  return (
    <div className="relative min-h-[80vh]">
      {isPending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50">
          <p className="text-sm text-muted-foreground">保存中...</p>
        </div>
      )}
      <Puck config={puckConfig} data={data} onPublish={handlePublish} />
    </div>
  );
}
