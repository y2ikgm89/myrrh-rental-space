/**
 * Admin-safe section metadata registry.
 *
 * This is a lightweight alternative to the full registry (registry.ts)
 * that stores only metadata (meta, configSchema, defaultConfig) WITHOUT
 * component loaders or data loaders. This allows admin client components
 * to access section metadata without pulling in server-only dependencies.
 *
 * Usage:
 *   import "@/admin/lib/sections/register-admin-sections";
 *   import { getAdminSectionMeta } from "@/shared/lib/sections/admin-registry";
 */
import type { z } from "zod";
import type { SectionCategory } from "./types";

/** Admin-safe section metadata (no component/dataLoader) */
export type SectionMeta<TSchema extends z.ZodType = z.ZodType> = {
  readonly id: string;
  readonly meta: {
    readonly label: string;
    readonly description: string;
    readonly icon: string;
    readonly category: SectionCategory;
  };
  readonly configSchema: TSchema;
  readonly defaultConfig: z.output<TSchema>;
};

const adminSectionRegistry = new Map<string, SectionMeta>();

/** Register section metadata for admin use. */
export function registerSectionMeta(meta: SectionMeta): void {
  adminSectionRegistry.set(meta.id, meta);
}

/** Get section metadata by componentId. */
export function getAdminSectionMeta(
  componentId: string,
): SectionMeta | undefined {
  return adminSectionRegistry.get(componentId);
}

/** Get all registered admin componentIds. */
export function getAdminRegisteredComponentIds(): string[] {
  return [...adminSectionRegistry.keys()];
}

const CATEGORY_ORDER: readonly SectionCategory[] = [
  "hero",
  "content",
  "list",
  "interactive",
  "media",
  "utility",
];

/** Get admin sections grouped by category. */
export function getAdminSectionsByCategory() {
  const groups = new Map<
    SectionCategory,
    { category: SectionCategory; sections: SectionMeta[] }
  >();
  for (const cat of CATEGORY_ORDER) {
    groups.set(cat, { category: cat, sections: [] });
  }
  for (const def of adminSectionRegistry.values()) {
    const group = groups.get(def.meta.category);
    if (group) group.sections.push(def);
  }
  return [...groups.values()].filter((g) => g.sections.length > 0);
}
