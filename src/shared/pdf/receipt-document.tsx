import "server-only";

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * 適格請求書 (Receipt) PDF レンダリング用の React PDF ドキュメント。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#3。
 * インボイス制度 (令和 5 年 10 月〜) の適格請求書 6 要件を満たす形式で領収書を出力する:
 * 1. 発行事業者氏名 + 登録番号 (T + 13桁)
 * 2. 取引年月日
 * 3. 取引内容
 * 4. 税率区分ごとの対価額 + 適用税率
 * 5. 税率区分ごとの消費税額
 * 6. 宛名 (書類の交付を受ける者の氏名または名称)
 *
 * ## フォント (Noto Sans JP)
 * 日本語グリフを含むフォントを Font.register で登録する。CDN (jsdelivr) 経由で
 * googlefonts/noto-cjk リポジトリの OTF を fetch する。
 * - CDN URL は @react-pdf/renderer の内部 fetch (server-side、CSP 非関与) で一度だけ取得され、
 *   同一ランタイム内で in-memory cache される
 * - production の cold start 影響 (~1s 初回 fetch) は許容範囲。subset 化して repo に
 *   含める最適化は receipt-full-wiring PR#7 で対応予定
 *
 * ## Hyphenation の無効化
 * デフォルトの hyphenation は英語の単語区切り前提で、日本語テキスト (Text ノードの各文字)
 * を強制的に単文字ハイフン分割してしまう。日本語では単語境界を空白で区切らないため、
 * `Font.registerHyphenationCallback((word) => [word])` で無効化する。
 */

const NOTO_SANS_JP_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";

// 副作用は module load 時に 1 回だけ実行される。@react-pdf/renderer の Font store は
// process-global シングルトンのため多重 register は最新値で上書きされる (害はない)。
Font.register({
  family: "Noto Sans JP",
  src: NOTO_SANS_JP_URL,
});

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Noto Sans JP",
    fontSize: 10,
    color: "#111827",
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#111827",
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    textAlign: "center",
    marginBottom: 12,
  },
  serialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recipientBlock: {
    marginBottom: 20,
  },
  recipientName: {
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    paddingBottom: 4,
    marginBottom: 8,
  },
  amountBlock: {
    marginBottom: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#f9fafb",
  },
  amountLabel: {
    fontSize: 10,
    color: "#4b5563",
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 24,
  },
  subjectRow: {
    marginBottom: 16,
    flexDirection: "row",
  },
  subjectLabel: {
    width: 60,
    color: "#4b5563",
  },
  subjectValue: {
    flex: 1,
  },
  taxBreakdown: {
    marginTop: 12,
    marginBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingTop: 8,
  },
  taxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  taxLabel: {
    color: "#4b5563",
  },
  issuerBlock: {
    marginTop: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  issuerName: {
    fontSize: 12,
    marginBottom: 4,
  },
  issuerLine: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 2,
  },
  invoiceRegistrationNumber: {
    fontSize: 10,
    marginTop: 6,
  },
});

export interface ReceiptDocumentInput {
  readonly serialNo: string;
  readonly issuedAt: string; // YYYY年M月D日 (JST 形式済み)
  readonly recipientName: string;
  readonly subject: string;
  /** 税込合計額 (円、整数) */
  readonly amount: number;
  /** 消費税額 (円、整数、内税分) */
  readonly taxAmount: number;
  /** 適用税率 (%) — 10 / 8 等 */
  readonly taxRate: number;
  /** 発行事業者情報 (Settings.snapshot 由来) */
  readonly issuer: {
    readonly businessName: string | null;
    readonly representativeName: string | null;
    readonly invoiceNumber: string | null;
    readonly postalCode: string | null;
    readonly prefecture: string | null;
    readonly city: string | null;
    readonly streetAddress: string | null;
    readonly email: string | null;
    readonly phoneNumber: string | null;
  };
}

function formatJpy(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function joinAddress(issuer: ReceiptDocumentInput["issuer"]): string {
  const parts = [
    issuer.postalCode ? `〒${issuer.postalCode}` : null,
    issuer.prefecture,
    issuer.city,
    issuer.streetAddress,
  ].filter((part): part is string => Boolean(part && part.length > 0));
  return parts.join(" ");
}

export function ReceiptDocument({
  data,
}: {
  readonly data: ReceiptDocumentInput;
}): ReactElement {
  const taxExcludedAmount = data.amount - data.taxAmount;
  const address = joinAddress(data.issuer);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>領収書</Text>
          <View style={styles.serialRow}>
            <Text>No. {data.serialNo}</Text>
            <Text>発行日: {data.issuedAt}</Text>
          </View>
        </View>

        <View style={styles.recipientBlock}>
          <Text style={styles.recipientName}>{data.recipientName} 様</Text>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>金額 (税込)</Text>
          <Text style={styles.amountValue}>{formatJpy(data.amount)}</Text>
        </View>

        <View style={styles.subjectRow}>
          <Text style={styles.subjectLabel}>但し</Text>
          <Text style={styles.subjectValue}>
            {data.subject} として上記金額を正に領収いたしました
          </Text>
        </View>

        <View style={styles.taxBreakdown}>
          <Text style={{ marginBottom: 6 }}>内訳 (税率区分ごと)</Text>
          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>
              対象額 ({data.taxRate}% 適用、税抜)
            </Text>
            <Text>{formatJpy(taxExcludedAmount)}</Text>
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>消費税額 ({data.taxRate}%)</Text>
            <Text>{formatJpy(data.taxAmount)}</Text>
          </View>
        </View>

        <View style={styles.issuerBlock}>
          <Text style={styles.issuerName}>
            {data.issuer.businessName ?? ""}
          </Text>
          {data.issuer.representativeName ? (
            <Text style={styles.issuerLine}>
              代表: {data.issuer.representativeName}
            </Text>
          ) : null}
          {address.length > 0 ? (
            <Text style={styles.issuerLine}>{address}</Text>
          ) : null}
          {data.issuer.phoneNumber ? (
            <Text style={styles.issuerLine}>
              TEL: {data.issuer.phoneNumber}
            </Text>
          ) : null}
          {data.issuer.email ? (
            <Text style={styles.issuerLine}>Email: {data.issuer.email}</Text>
          ) : null}
          {data.issuer.invoiceNumber ? (
            <Text style={styles.invoiceRegistrationNumber}>
              適格請求書発行事業者登録番号: {data.issuer.invoiceNumber}
            </Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
