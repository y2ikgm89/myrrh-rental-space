import type { SectionDefinition, SectionCategory } from "./types";

const sectionRegistry = new Map<string, SectionDefinition>();

/** Register a section definition. Called by bootstrap files. */
export function registerSection(definition: SectionDefinition): void {
  sectionRegistry.set(definition.id, definition);
}

/** Get a section definition by componentId. Returns undefined if not registered. */
export function getSectionDefinition(
  componentId: string,
): SectionDefinition | undefined {
  return sectionRegistry.get(componentId);
}

/** Get all registered componentIds. */
export function getRegisteredComponentIds(): string[] {
  return [...sectionRegistry.keys()];
}

const CATEGORY_ORDER: readonly SectionCategory[] = [
  "hero",
  "content",
  "list",
  "interactive",
  "media",
  "utility",
];

/** Get sections grouped by category. */
export function getSectionsByCategory() {
  const groups = new Map<
    SectionCategory,
    { category: SectionCategory; sections: SectionDefinition[] }
  >();
  for (const cat of CATEGORY_ORDER) {
    groups.set(cat, { category: cat, sections: [] });
  }
  for (const def of sectionRegistry.values()) {
    const group = groups.get(def.meta.category);
    if (group) group.sections.push(def);
  }
  return [...groups.values()].filter((g) => g.sections.length > 0);
}
