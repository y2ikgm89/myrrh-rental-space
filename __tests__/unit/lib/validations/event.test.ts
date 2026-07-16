import { describe, expect, it } from "bun:test";
import { eventFormSchema } from "@/app/(admin)/admin/(dashboard)/events/_components/event-form-schema";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

describe("eventFormSchema (conform)", () => {
  const validInput = {
    title: "テストイベント",
    slug: "test-event",
    descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    scheduleMode: "SINGLE_OCCURRENCE",
    slots: JSON.stringify([
      { startAt: "2026-05-01T10:00", endAt: "2026-05-01T12:00", capacity: 10 },
    ]),
    status: "DRAFT",
    registrationOpen: false,
    tickets: JSON.stringify([
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ]),
  };

  it("有効な入力を受け入れる", () => {
    const result = eventFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("チケット JSON の旧 sortOrder は拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      tickets: JSON.stringify([
        {
          name: "一般",
          description: null,
          price: 5000,
          capacity: null,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("タイトルが空の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, title: "" });
    expect(result.success).toBe(false);
  });

  it("スロットが空配列の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      slots: JSON.stringify([]),
    });
    expect(result.success).toBe(false);
  });

  it("単一開催はスロットを1件だけ受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      scheduleMode: "SINGLE_OCCURRENCE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleMode).toBe("SINGLE_OCCURRENCE");
      expect(result.data.slots).toHaveLength(1);
    }
  });

  it("単一開催で複数スロットを拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      scheduleMode: "SINGLE_OCCURRENCE",
      slots: JSON.stringify([
        {
          startAt: "2026-05-01T10:00",
          endAt: "2026-05-01T12:00",
          capacity: 10,
        },
        {
          startAt: "2026-05-02T10:00",
          endAt: "2026-05-02T12:00",
          capacity: 10,
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("日時選択制は2件以上のスロットを要求する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      scheduleMode: "TIMED_ENTRY",
    });
    expect(result.success).toBe(false);
  });

  it("日時選択制で複数スロットを受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      scheduleMode: "TIMED_ENTRY",
      slots: JSON.stringify([
        {
          startAt: "2026-05-01T10:00",
          endAt: "2026-05-01T12:00",
          capacity: 10,
        },
        {
          startAt: "2026-05-02T10:00",
          endAt: "2026-05-02T12:00",
          capacity: 8,
        },
      ]),
    });
    expect(result.success).toBe(true);
  });

  it("無効な開催方式を拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      scheduleMode: "EVENT_LEVEL",
    });
    expect(result.success).toBe(false);
  });

  it("スロットの定員が負数の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      slots: JSON.stringify([
        {
          startAt: "2026-05-01T10:00",
          endAt: "2026-05-01T12:00",
          capacity: -1,
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("スロットの定員が 0 の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      slots: JSON.stringify([
        { startAt: "2026-05-01T10:00", endAt: "2026-05-01T12:00", capacity: 0 },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("チケットの料金が負の値はエラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      tickets: JSON.stringify([
        {
          name: "一般",
          price: -100,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("チケット未登録 (空配列) はエラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      tickets: JSON.stringify([]),
    });
    expect(result.success).toBe(false);
  });

  it("無効なステータスを拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("registrationOpen が 'on' 文字列で true にコース (FormData transit)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationOpen: "on",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registrationOpen).toBe(true);
    }
  });

  it("registrationOpen が空文字で false にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationOpen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registrationOpen).toBe(false);
    }
  });

  it("locationId が __none__ sentinel で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      locationId: "__none__",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationId).toBeNull();
    }
  });

  it("spaceId が __none__ sentinel で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      spaceId: "__none__",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spaceId).toBeNull();
    }
  });

  it("申込締切がスロット開始時刻より後の場合エラー", () => {
    // validInput の slots[0].startAt = "2026-05-01T10:00"
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "2026-05-01T15:00", // スロット開始後 → エラー
    });
    expect(result.success).toBe(false);
  });

  it("申込締切がスロット開始時刻と同じ場合 OK (≤)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "2026-05-01T10:00", // スロット開始と同時刻 → OK
    });
    expect(result.success).toBe(true);
  });

  it("申込締切が空文字でも OK (任意)", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      registrationDeadline: "",
    });
    expect(result.success).toBe(true);
  });

  it("オプションフィールドを受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      addressDetail: "2F 会議室A",
      locationId: "11111111-1111-4111-8111-111111111111",
      spaceId: "22222222-2222-4222-8222-222222222222",
      registrationOpen: true,
      thumbnailUrl: "https://example.com/image.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("addressDetail が空文字で null にコース", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      addressDetail: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addressDetail).toBeNull();
    }
  });

  // ---------------------------------------------------------------------
  // format / meetingUrl / meetingProvider (Phase B.1 Task 13)
  //
  // ロジックは src/shared/domain/events/commands.ts の `eventInputSchema`
  // (L106-132) と完全一致させる: OFFLINE は対象外、GOOGLE_MEET は write-back
  // 待ちのため meetingUrl 未設定を許容、それ以外 (ONLINE/HYBRID + MANUAL) は
  // meetingUrl 必須。
  // ---------------------------------------------------------------------
  describe("format / meetingUrl / meetingProvider", () => {
    it("format/meetingProvider を省略すると OFFLINE/MANUAL がデフォルトになる", () => {
      const result = eventFormSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe("OFFLINE");
        expect(result.data.meetingProvider).toBe("MANUAL");
      }
    });

    it("ONLINE + MANUAL で meetingUrl 未指定はエラー (会議URL必須)", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "MANUAL",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "meetingUrl",
        );
        expect(issue?.message).toBe(
          "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
        );
      }
    });

    it("ONLINE + MANUAL で meetingUrl が空文字でもエラーは1件だけ（形式エラーと二重にならない）", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "MANUAL",
        meetingUrl: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const meetingUrlIssues = result.error.issues.filter(
          (i) => i.path.join(".") === "meetingUrl",
        );
        expect(meetingUrlIssues).toHaveLength(1);
        expect(meetingUrlIssues[0]?.message).toBe(
          "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
        );
      }
    });

    it("ONLINE + MANUAL + 有効な https URL は成功する", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "MANUAL",
        meetingUrl: "https://meet.example.com/room",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.meetingUrl).toBe("https://meet.example.com/room");
      }
    });

    it("ONLINE + GOOGLE_MEET は meetingUrl 未指定でも成功する (write-back 待ち)", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "GOOGLE_MEET",
      });
      expect(result.success).toBe(true);
    });

    it("HYBRID + MANUAL で meetingUrl 未指定はエラー", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "HYBRID",
        meetingProvider: "MANUAL",
      });
      expect(result.success).toBe(false);
    });

    it("HYBRID + GOOGLE_MEET は meetingUrl 未指定でも成功する", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "HYBRID",
        meetingProvider: "GOOGLE_MEET",
      });
      expect(result.success).toBe(true);
    });

    it("OFFLINE では meetingProvider に関わらず meetingUrl 未指定で成功する", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "OFFLINE",
        meetingProvider: "MANUAL",
      });
      expect(result.success).toBe(true);
    });

    it("meetingUrl が https:// で始まらない場合エラー", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "MANUAL",
        meetingUrl: "http://meet.example.com/room",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "meetingUrl",
        );
        expect(issue?.message).toBe(
          "会議 URL は https:// で始まる必要があります",
        );
      }
    });

    it("meetingUrl が500文字を超える場合エラー", () => {
      const longUrl = `https://example.com/${"a".repeat(500)}`;
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "MANUAL",
        meetingUrl: longUrl,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join(".") === "meetingUrl",
        );
        expect(issue?.message).toBe("会議 URL は500文字以内で入力してください");
      }
    });

    it("無効な format 値を拒否する", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "INVALID_FORMAT",
      });
      expect(result.success).toBe(false);
    });

    it("無効な meetingProvider 値を拒否する", () => {
      const result = eventFormSchema.safeParse({
        ...validInput,
        format: "ONLINE",
        meetingProvider: "INVALID_PROVIDER",
        meetingUrl: "https://example.com",
      });
      expect(result.success).toBe(false);
    });
  });
});
