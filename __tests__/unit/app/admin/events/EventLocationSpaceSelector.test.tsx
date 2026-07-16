import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useForm, type SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";
import { EventLocationSpaceSelector } from "@/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
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

function useEventFormFieldsForTest(lastResult?: SubmissionResult) {
  const [, fields] = useForm<EventFormValues>({
    id: "event-location-space-selector-test",
    lastResult,
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
 * EventLocationSpaceSelector (Task 13 以降) は format/meetingProvider/meetingUrl を
 * 自前で保持しない — 親 (実装では EventForm.tsx) がリフトした controlled state を
 * props で受け取る（locationId/spaceId と同じパターン）。このテストの Harness は
 * EventForm.tsx の役割を最小限で肩代わりし、`useState` で 3 値を保持して
 * value/onChange props として橋渡しする。
 */
function Harness({
  initialFormat = EVENT_FORMAT.OFFLINE,
  initialMeetingProvider = MEETING_PROVIDER.MANUAL,
  initialMeetingUrl = null,
}: HarnessProps): ReactElement {
  const fields = useEventFormFieldsForTest();
  const [format, setFormat] = useState<EventFormatValue>(initialFormat);
  const [meetingProvider, setMeetingProvider] = useState<MeetingProviderValue>(
    initialMeetingProvider,
  );
  const [meetingUrl, setMeetingUrl] = useState<string | null>(
    initialMeetingUrl,
  );

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
      format={format}
      onFormatChange={setFormat}
      meetingProvider={meetingProvider}
      onMeetingProviderChange={setMeetingProvider}
      meetingUrl={meetingUrl}
      onMeetingUrlChange={setMeetingUrl}
    />
  );
}

/** 有効な EventForm 送信データのベースライン (event.test.ts の validInput と同型)。 */
function buildValidFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("title", "テストイベント");
  formData.set("slug", "test-event");
  formData.set("descriptionJson", EMPTY_LEXICAL_EDITOR_STATE_JSON);
  formData.set("scheduleMode", EventScheduleMode.SINGLE_OCCURRENCE);
  formData.set(
    "slots",
    JSON.stringify([
      { startAt: "2026-05-01T10:00", endAt: "2026-05-01T12:00", capacity: 10 },
    ]),
  );
  formData.set("status", "DRAFT");
  formData.set(
    "tickets",
    JSON.stringify([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]),
  );
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
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

  // -------------------------------------------------------------------
  // refine エラー surfacing (Task 13 expanded scope)
  //
  // format/meetingUrl/meetingProvider は event-form-schema.ts の
  // eventFormSchema に定義済みのため、conform の lastResult 経由で渡された
  // 検証エラーが fields.meetingUrl.errors として実際にレンダリングされることを
  // end-to-end (schema → conform reply → fields metadata → DOM) で検証する。
  // -------------------------------------------------------------------
  describe("refine エラー surfacing (fields.meetingUrl.errors)", () => {
    function ErrorHarness({
      lastResult,
    }: {
      lastResult: SubmissionResult;
    }): ReactElement {
      const fields = useEventFormFieldsForTest(lastResult);
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
          format={EVENT_FORMAT.ONLINE}
          onFormatChange={() => {}}
          meetingProvider={MEETING_PROVIDER.MANUAL}
          onMeetingProviderChange={() => {}}
          meetingUrl={null}
          onMeetingUrlChange={() => {}}
        />
      );
    }

    test("ONLINE + MANUAL + meetingUrl 未入力の submit 結果が URL 欄に inline 表示される", async () => {
      // meetingUrl を意図的に省略した FormData で実際に parseWithZod → reply() を
      // 通し、EventForm.tsx が useActionState から受け取るのと同じ形の
      // SubmissionResult を作る。
      const formData = buildValidFormData({
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
      });
      const submission = parseWithZod(formData, { schema: eventFormSchema });
      expect(submission.status).toBe("error");
      const lastResult = submission.reply();

      await act(async () => {
        root?.render(<ErrorHarness lastResult={lastResult} />);
      });

      const urlInput = byId<HTMLInputElement>("event-meetingUrl");
      expect(urlInput).not.toBeNull();
      expect(urlInput?.getAttribute("aria-invalid")).toBe("true");

      const describedBy = urlInput?.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const errorEl = describedBy ? byId(describedBy) : null;
      expect(errorEl?.textContent).toBe(
        "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
      );
    });

    test("有効な https URL を含む submit 結果ではエラーが表示されない", async () => {
      const formData = buildValidFormData({
        format: EVENT_FORMAT.ONLINE,
        meetingProvider: MEETING_PROVIDER.MANUAL,
        meetingUrl: "https://meet.example.com/room",
      });
      const submission = parseWithZod(formData, { schema: eventFormSchema });
      expect(submission.status).toBe("success");
      const lastResult = submission.reply();

      await act(async () => {
        root?.render(<ErrorHarness lastResult={lastResult} />);
      });

      const urlInput = byId<HTMLInputElement>("event-meetingUrl");
      expect(urlInput?.getAttribute("aria-invalid")).toBeNull();
      expect(urlInput?.getAttribute("aria-describedby")).toBeNull();
    });
  });
});
