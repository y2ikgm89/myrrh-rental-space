import type { ComponentType } from "react";

export type EffectComponentProps = {
  readonly config: Record<string, unknown>;
};

export type EffectDefinition = {
  readonly id: string;
  readonly label: string;
  readonly type: "background" | "overlay";
  readonly load: () => Promise<{ default: ComponentType<EffectComponentProps> }>;
};

const effectRegistry = new Map<string, EffectDefinition>();

export function registerEffect(definition: EffectDefinition): void {
  effectRegistry.set(definition.id, definition);
}

export function getEffectDefinition(id: string): EffectDefinition | undefined {
  return effectRegistry.get(id);
}

export function getRegisteredEffectIds(): string[] {
  return [...effectRegistry.keys()];
}
