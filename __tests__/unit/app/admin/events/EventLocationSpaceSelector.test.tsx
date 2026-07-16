import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useForm } from "@conform-to/react";
import type { z } from "zod";
import { EventLocationSpaceSelector } from "@/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import {
  EVENT_FORMAT,
  MEETING_PROVIDER,
  EventScheduleMode,
  type EventFormatValue,
  type MeetingProviderValue,
} from "@/shared/lib/validations/enums/prisma-types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

/**
 * EventLocationSpaceSelector は EventForm (conform useForm) の fields を props で
 * 受け取る sub-component のため、テストでも実際の `useForm` を呼んで
 * `EventFormFields` と構造的に一致する値を用意する（unsafe cast を避けるため）。
 */
type EventFormValues = z.input<typeof eventFormSchema>;

function useEventFormFieldsForTest() {
  const [, fields] = useForm<EventFormValues>({
    id: "event-location-space-selector-test",
    defaultValue: {
      title: "",
      slug: "",
      scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
      registrationDeadline: "",
      addressDetail: "",
      ogpTitle: "",
      ogpDescription: "",
      metaDescription: "",
      metaKeywords: "",
      gallery: [],
    },
  });
  return fields;
}

type HarnessProps = {
  initialFormat?: EventFormatValue;
  initialMeetingProvider?: MeetingProviderValue;
  initialMeetingUrl?: string | null;
};

/**
 * EventLocationSpaceSelector は format/meetingProvider/meetingUrl を内部 useState
 * として自己完結で保持する（EventForm.tsx への配線・schema 追加は Task 13 の scope
 * のため、conform の fields からは取得できない）。このテストでは `fields` prop の
 * 用意にのみ最小限の harness を使う。
 */
function Harness({
  initialFormat,
  initialMeetingProvider,
  initialMeetingUrl,
}: HarnessProps): ReactElement {
  const fields = useEventFormFieldsForTest();

  // exactOptionalPropertyTypes: true のため、省略時は key 自体を渡さない
  // (`initialFormat={undefined}` は「明示的に undefined を代入」扱いで型エラーになる)。
  return (
    <EventLocationSpaceSelector
      fields={fields}
      isPending={false}
      locations={[]}
      spaces={[]}
      locationId={null}
      spaceId={null}
      onLocationChange={() => {}}
      onSpaceChange={() => {}}
      {...(initialFormat !== undefined ? { initialFormat } : {})}
      {...(initialMeetingProvider !== undefined
        ? { initialMeetingProvider }
        : {})}
      {...(initialMeetingUrl !== undefined ? { initialMeetingUrl } : {})}
    />
  );
}

describe("EventLocationSpaceSelector", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  function byId<T extends Element = Element>(id: string): T | null {
    return container?.querySelector<T>(`#${id}`) ?? null;
  }

  async function click(id: string): Promise<void> {
    const element = byId<HTMLElement>(id);
    if (!element) throw new Error(`element not found: #${id}`);
    await act(async () => {
      element.click();
    });
  }

  test("開催形態 ToggleGroup を表示、default = OFFLINE", async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    const offlineItem = byId<HTMLButtonElement>("event-format-offline");
    const onlineItem = byId<HTMLButtonElement>("event-format-online");
    const hybridItem = byId<HTMLButtonElement>("event-format-hybrid");

    expect(offlineItem).not.toBeNull();
    expect(onlineItem).not.toBeNull();
    expect(hybridItem).not.toBeNull();
    expect(offlineItem?.getAttribute("data-state")).toBe("on");
    expect(onlineItem?.getAttribute("data-state")).toBe("off");
    expect(hybridItem?.getAttribute("data-state")).toBe("off");

    // 開催形態 ToggleGroup 自体が a11y 名を持つ (aria-labelledby → 可視 Label 経由)
    const formatLabel = byId("event-format-label");
    expect(formatLabel?.textContent).toBe("開催形態");
    const toggleGroup = offlineItem?.closest('[role="radiogroup"]');
    expect(toggleGroup?.getAttribute("aria-labelledby")).toBe(
      "event-format-label",
    );

    // OFFLINE では物理会場フィールドのみ表示、オンライン会議フィールドは非表示
    expect(byId("event-locationId")).not.toBeNull();
    expect(byId("event-meetingUrl")).toBeNull();
    expect(byId("meeting-provider-manual")).toBeNull();
    expect(byId("meeting-provider-google-meet")).toBeNull();
  });

  test("ONLINE 選択で OnlineMeetingFields (provider RadioGroup + URL Input) 表示", async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    await click("event-format-online");

    // 物理会場フィールドは非表示化される
    expect(byId("event-locationId")).toBeNull();

    // オンライン会議フィールド: provider RadioGroup が見える
    // (開催形態 ToggleGroup も role="radiogroup" を持つため aria-labelledby で限定する)
    const providerRadioGroup = container?.querySelector(
      '[role="radiogroup"][aria-labelledby="event-meetingProvider-label"]',
    );
    expect(providerRadioGroup).not.toBeNull();
    expect(byId("meeting-provider-manual")).not.toBeNull();
    expect(byId("meeting-provider-google-meet")).not.toBeNull();

    // デフォルト provider は MANUAL なので URL Input が表示される
    const urlInput = byId<HTMLInputElement>("event-meetingUrl");
    expect(urlInput).not.toBeNull();
    expect(urlInput?.type).toBe("url");
  });

  test("HYBRID 選択で physical + online 両方の field 表示", async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    await click("event-format-hybrid");

    expect(byId("event-locationId")).not.toBeNull();
    expect(
      container?.querySelector(
        '[role="radiogroup"][aria-labelledby="event-meetingProvider-label"]',
      ),
    ).not.toBeNull();
    expect(byId("event-meetingUrl")).not.toBeNull();
  });

  test("MANUAL provider 選択時 URL Input が required かつ HTTPS pattern", async () => {
    await act(async () => {
      root?.render(<Harness initialFormat={EVENT_FORMAT.ONLINE} />);
    });

    const urlInput = byId<HTMLInputElement>("event-meetingUrl");
    expect(urlInput).not.toBeNull();
    expect(urlInput?.required).toBe(true);
    expect(urlInput?.getAttribute("pattern")).toBe("https://.*");
    expect(urlInput?.getAttribute("name")).toBe("meetingUrl");
  });

  test("GOOGLE_MEET provider 選択時 URL Input 非表示、alert 表示", async () => {
    await act(async () => {
      root?.render(<Harness initialFormat={EVENT_FORMAT.ONLINE} />);
    });

    // 切替前は MANUAL のため URL Input が見える
    expect(byId("event-meetingUrl")).not.toBeNull();

    await click("meeting-provider-google-meet");

    expect(byId("event-meetingUrl")).toBeNull();
    const alert = container?.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(
      "公開時に Google Meet URL が自動発行されます",
    );
  });

  test("initialFormat / initialMeetingProvider の seed prop から直接描画できる（編集時の初期値 hydration 用の seam）", async () => {
    await act(async () => {
      root?.render(
        <Harness
          initialFormat={EVENT_FORMAT.ONLINE}
          initialMeetingProvider={MEETING_PROVIDER.GOOGLE_MEET}
        />,
      );
    });

    // クリック操作なしで GOOGLE_MEET 状態が初期描画される
    expect(byId("event-meetingUrl")).toBeNull();
    expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  });
});
