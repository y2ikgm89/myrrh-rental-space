import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { formatJstDateString } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";
import { DomainError } from "@/shared/domain/domain-error";
import { ReceiptDocument, type ReceiptDocumentInput } from "./receipt-document";

/**
 * Receipt DB レコードから PDF を生成するサーバー関数。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#3。
 *
 * ## 呼出契約
 * - Route Handler (`/api/receipts/[serialNo]/pdf`、次 PR で追加) から呼ばれる想定
 * - Receipt レコードと issuerSnapshot (発行時に凍結された Settings snapshot) を渡す
 * - Buffer を返す。Route Handler 側で `new Response(buffer, { headers: ...})` で返却
 *
 * ## issuerSnapshot の narrowing
 * DB では `Json` 型で保存されているため、必要 field を型付きで narrow する。
 * snapshot に想定 field が欠けている場合は null にフォールバックし、PDF 側で
 * 該当行を省略表示する。
 *
 * ## cacheComponents との整合
 * 本関数は Route Handler / Server Action 経由で呼ばれる。Cache Components の
 * 対象外 (private / no-store 前提)。`'use cache'` を付けない。
 *
 * ## Bun runtime
 * `@react-pdf/renderer@4.5.1` は Bun 1.3.14 で動作確認済 (本 PR の spike)。
 * `renderToBuffer` は promise を返し、内部で React tree → PDF-lib へ変換 →
 * Buffer 化。Font.register は module load 時 (receipt-document.tsx の top-level) に
 * 1 回だけ実行される。
 */

export interface RenderReceiptInput {
  readonly serialNo: string;
  readonly issuedAt: Date;
  readonly recipientName: string;
  readonly subject: string;
  readonly amount: number;
  readonly taxAmount: number;
  readonly taxRate: number;
  readonly issuerSnapshot: unknown;
}

function narrowStringField(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function narrowAddressField(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null;
  return narrowStringField(source, key);
}

function narrowIssuerSnapshot(
  snapshot: unknown,
): ReceiptDocumentInput["issuer"] {
  if (!isRecord(snapshot)) {
    throw new DomainError(
      "issuerSnapshot が不正な形式です (領収書 PDF 生成に必要な発行事業者情報が欠けています)",
      "VALIDATION",
    );
  }
  const address = snapshot["address"];
  return {
    businessName: narrowStringField(snapshot, "businessName"),
    representativeName: narrowStringField(snapshot, "representativeName"),
    invoiceNumber: narrowStringField(snapshot, "invoiceNumber"),
    postalCode: narrowAddressField(address, "postalCode"),
    prefecture: narrowAddressField(address, "prefecture"),
    city: narrowAddressField(address, "city"),
    streetAddress: narrowAddressField(address, "streetAddress"),
    email: narrowStringField(snapshot, "email"),
    phoneNumber: narrowStringField(snapshot, "phoneNumber"),
  };
}

function formatIssuedAt(issuedAt: Date): string {
  const iso = formatJstDateString(issuedAt);
  const [year, month, day] = iso.split("-");
  return `${year}年${Number.parseInt(month ?? "0", 10)}月${Number.parseInt(day ?? "0", 10)}日`;
}

/**
 * Receipt レコードから PDF Buffer を生成する。
 *
 * @param input Receipt 情報 (DB レコード由来)
 * @returns application/pdf を Content-Type とする Response で返却可能な Buffer
 */
export async function renderReceiptPdf(
  input: RenderReceiptInput,
): Promise<Buffer> {
  const issuer = narrowIssuerSnapshot(input.issuerSnapshot);

  const documentInput: ReceiptDocumentInput = {
    serialNo: input.serialNo,
    issuedAt: formatIssuedAt(input.issuedAt),
    recipientName: input.recipientName,
    subject: input.subject,
    amount: input.amount,
    taxAmount: input.taxAmount,
    taxRate: input.taxRate,
    issuer,
  };

  return await renderToBuffer(<ReceiptDocument data={documentInput} />);
}
