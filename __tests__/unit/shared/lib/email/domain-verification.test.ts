/**
 * validateSenderDomain() — 送信元ドメインの Resend 検証チェック
 *
 * verified / partially_verified を送信可能とみなし、未登録・未検証は ng。
 * APIキー未設定・Resend エラー・例外時は ok（インフラ起因で保存をブロックしない）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type DomainEntry = { name: string; status: string };
type ListResult = {
  data: { data: DomainEntry[]; object: "list"; has_more: boolean } | null;
  error: { message: string } | null;
};

const mockDomainsList = mock<() => Promise<ListResult>>();
const mockGetResendClient =
  mock<() => { domains: { list: typeof mockDomainsList } } | null>();

mock.module("@/shared/lib/email/client", () => ({
  getResendClient: mockGetResendClient,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";

function listOf(domains: DomainEntry[]): ListResult {
  return {
    data: { data: domains, object: "list", has_more: false },
    error: null,
  };
}

beforeEach(() => {
  mockDomainsList.mockReset();
  mockGetResendClient.mockReset();
  mockGetResendClient.mockReturnValue({ domains: { list: mockDomainsList } });
});

describe("validateSenderDomain()", () => {
  test("検証済みドメインなら ok", async () => {
    mockDomainsList.mockResolvedValue(
      listOf([{ name: "mail.example.com", status: "verified" }]),
    );
    expect(await validateSenderDomain("noreply@mail.example.com")).toEqual({
      ok: true,
    });
  });

  test("大文字小文字を無視して照合する", async () => {
    mockDomainsList.mockResolvedValue(
      listOf([{ name: "Mail.Example.com", status: "verified" }]),
    );
    expect(await validateSenderDomain("noreply@mail.EXAMPLE.com")).toEqual({
      ok: true,
    });
  });

  test("partially_verified も送信可能として ok", async () => {
    mockDomainsList.mockResolvedValue(
      listOf([{ name: "example.com", status: "partially_verified" }]),
    );
    expect(await validateSenderDomain("info@example.com")).toEqual({
      ok: true,
    });
  });

  test("未登録ドメインは ng で検証済み一覧を返す", async () => {
    mockDomainsList.mockResolvedValue(
      listOf([{ name: "verified.com", status: "verified" }]),
    );
    expect(await validateSenderDomain("noreply@unknown.com")).toEqual({
      ok: false,
      verifiedDomains: ["verified.com"],
    });
  });

  test("pending ステータスは送信不可で ng（一覧は空）", async () => {
    mockDomainsList.mockResolvedValue(
      listOf([{ name: "pending.com", status: "pending" }]),
    );
    expect(await validateSenderDomain("noreply@pending.com")).toEqual({
      ok: false,
      verifiedDomains: [],
    });
  });

  test("APIキー未設定（client が null）は ok（ブロックしない）", async () => {
    mockGetResendClient.mockReturnValue(null);
    expect(await validateSenderDomain("noreply@example.com")).toEqual({
      ok: true,
    });
  });

  test("Resend API エラー時は ok（ブロックしない）", async () => {
    mockDomainsList.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    expect(await validateSenderDomain("noreply@example.com")).toEqual({
      ok: true,
    });
  });

  test("list が throw しても ok（ブロックしない）", async () => {
    mockDomainsList.mockImplementation(() => {
      throw new Error("network");
    });
    expect(await validateSenderDomain("noreply@example.com")).toEqual({
      ok: true,
    });
  });
});
