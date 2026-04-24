"use client";

import { type ReactElement } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import type {
  PageBuilderPresetOption,
  PageBuilderPresetType,
} from "@/shared/lib/page-builder/presets";

export type PageBuilderInsertNodeType =
  | "text"
  | "image"
  | "button"
  | "frame"
  | "stack"
  | "grid"
  | "divider"
  | "spacer"
  | "embed"
  | "form";

type PageBuilderInsertCategory = "content" | "layout" | "utility";

export type PageBuilderInsertOption = {
  value: PageBuilderInsertNodeType;
  label: string;
  description: string;
  category: PageBuilderInsertCategory;
};

type PageBuilderInsertPanelProps = {
  options: readonly PageBuilderInsertOption[];
  presets: readonly PageBuilderPresetOption[];
  disabled: boolean;
  onAddNode: (type: PageBuilderInsertNodeType) => void;
  onAddPreset: (type: PageBuilderPresetType) => void;
};

const INSERT_CATEGORY_OPTIONS = [
  { value: "content", label: "Content" },
  { value: "layout", label: "Layout" },
  { value: "utility", label: "Utility" },
] satisfies ReadonlyArray<{
  value: PageBuilderInsertCategory;
  label: string;
}>;

export function PageBuilderInsertPanel({
  options,
  presets,
  disabled,
  onAddNode,
  onAddPreset,
}: PageBuilderInsertPanelProps): ReactElement {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sections
          </h3>
          <Badge variant="secondary">{presets.length}</Badge>
        </div>
        <div className="grid gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 px-3 py-2 text-left"
              onClick={() => onAddPreset(preset.value)}
              disabled={disabled}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconPlus className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {preset.label}
                </span>
                <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                  {preset.description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </section>

      {INSERT_CATEGORY_OPTIONS.map((category) => {
        const categoryOptions = options.filter(
          (option) => option.category === category.value,
        );

        if (categoryOptions.length === 0) {
          return null;
        }

        return (
          <section key={category.value} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category.label}
              </h3>
              <Badge variant="secondary">{categoryOptions.length}</Badge>
            </div>
            <div className="grid gap-2">
              {categoryOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 px-3 py-2 text-left"
                  onClick={() => onAddNode(option.value)}
                  disabled={disabled}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <IconPlus className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
