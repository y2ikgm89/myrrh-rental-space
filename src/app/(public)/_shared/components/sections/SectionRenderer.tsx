/**
 * SectionRenderer — レジストリベースの動的セクション出し分け
 *
 * Server Component。PublicSection を受け取り、registry から定義を取得して
 * コンポーネントを動的にディスパッチする。全ページ共通で使用。
 */

import "@/public/lib/sections/register-standard-sections";

import type { ReactElement, ComponentType } from "react";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import type { PublicSection } from "@/shared/domain/sections/queries";
import {
  getSectionDefinition,
  getRegisteredComponentIds,
} from "@/shared/lib/sections/registry";
import { parseSectionDesign } from "@/shared/lib/validations/section-design";
import { sectionEffectConfigSchema } from "@/shared/lib/sections/effects/schemas";
import type { SectionComponentProps } from "@/shared/lib/sections/types";

// ---------------------------------------------------------------------------
// Client component map — built once at module scope (NOT in render)
// ---------------------------------------------------------------------------

type DynamicComponent = ReturnType<typeof dynamic<SectionComponentProps>>;

function buildClientComponentMap(): Record<string, DynamicComponent> {
  const map: Record<string, DynamicComponent> = {};
  for (const id of getRegisteredComponentIds()) {
    const definition = getSectionDefinition(id);
    if (!definition) continue;
    if (
      definition.component.type === "client" ||
      definition.component.type === "client-only"
    ) {
      map[id] = dynamic(
        () =>
          definition.component
            .load()
            .then((mod) => ({ default: mod.default as ComponentType<SectionComponentProps> })),
        { ssr: definition.component.type !== "client-only" },
      );
    }
  }
  return map;
}

// Note: register-standard-sections is imported at the top, so definitions are
// registered before this module-scope call executes at runtime.
const clientComponentMap = buildClientComponentMap();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type predicate: narrows unknown → Record<string, unknown> without `as`. */
function isConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SectionRendererProps {
  readonly section: PublicSection;
}

export async function SectionRenderer({
  section,
}: SectionRendererProps): Promise<ReactElement | null> {
  const definition = getSectionDefinition(section.componentId);

  if (!definition) {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn(
        `[SectionRenderer] Unknown componentId: "${section.componentId}". ` +
          `Registered: ${getRegisteredComponentIds().join(", ")}`,
      );
    }
    return null;
  }

  // Parse section-level config, design, and effect config.
  // definition.configSchema is z.ZodType (erased generic), parse() returns unknown.
  // We narrow to Record<string, unknown> via type predicate (no type assertion).
  const parsedConfig: unknown = definition.configSchema.parse(section.config);
  if (!isConfigObject(parsedConfig)) return null;
  const config = parsedConfig;
  const design = parseSectionDesign(section.design);
  // Validated for data integrity; will be passed to ExperienceShell in Task 11
  const _effectConfig = sectionEffectConfigSchema.parse(
    section.effectConfig ?? {},
  );
  void _effectConfig;

  // Load extra data from dataLoader if defined
  const extraData = definition.dataLoader
    ? await definition.dataLoader(config)
    : undefined;

  const sectionFields = {
    title: section.title,
    contentHtml: section.contentHtml,
  };

  const props: SectionComponentProps = {
    config,
    design,
    ...(extraData !== undefined && { extraData }),
    section: sectionFields,
  };

  // Server component: await load() then render default export directly
  if (definition.component.type === "server") {
    const mod = await definition.component.load();
    const Component = mod.default;
    return <Component {...props} />;
  }

  // Client component: use pre-built dynamic() from module-scope map
  const DynamicComponent = clientComponentMap[section.componentId];
  if (!DynamicComponent) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DynamicComponent {...props} />
    </Suspense>
  );
}
