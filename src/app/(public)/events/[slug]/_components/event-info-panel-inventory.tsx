import type { ReactElement } from "react";
import { EventInfoPanel, type EventInfoPanelProps } from "./event-info-panel";
import {
  buildDynamicEventInfoPanelProps,
  buildStaticEventInfoPanelProps,
} from "./event-static-panel-props";
import {
  loadEventRegistrationContext,
  type PublishedEventDetail,
} from "./event-registration-context";

interface EventInfoPanelInventoryProps {
  readonly variant: EventInfoPanelProps["variant"];
  readonly event: PublishedEventDetail;
  readonly registerAnchorId: string;
}

export async function EventInfoPanelInventory({
  variant,
  event,
  registerAnchorId,
}: EventInfoPanelInventoryProps): Promise<ReactElement> {
  const context = await loadEventRegistrationContext(event);
  const panelProps = buildDynamicEventInfoPanelProps(event, registerAnchorId, {
    slotOptions: context.slotOptions,
    registration: context.registration,
  });

  return <EventInfoPanel variant={variant} {...panelProps} />;
}

export function EventInfoPanelInventoryFallback({
  variant,
  event,
  registerAnchorId,
}: EventInfoPanelInventoryProps): ReactElement {
  const panelProps = buildStaticEventInfoPanelProps(event, registerAnchorId);
  return <EventInfoPanel variant={variant} {...panelProps} />;
}
