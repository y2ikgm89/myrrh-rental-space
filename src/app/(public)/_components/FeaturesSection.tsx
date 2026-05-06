import type { ReactElement } from "react";
import { FeaturesGrid } from "./features/_features-grid";
import { FeaturesNumberedEditorial } from "./features/_features-numbered-editorial";
import { FeaturesNumberedSteps } from "./features/_features-numbered-steps";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

interface FeaturesSectionProps {
  readonly config: FeaturesConfig;
  readonly style: SectionStylePayload;
}

export function FeaturesSection({
  config,
  style,
}: FeaturesSectionProps): ReactElement | null {
  switch (config.displayLayout) {
    case "grid":
      return <FeaturesGrid config={config} style={style} />;
    case "numbered-steps":
      return <FeaturesNumberedSteps config={config} style={style} />;
    case "numbered-editorial":
    default:
      return <FeaturesNumberedEditorial config={config} style={style} />;
  }
}
