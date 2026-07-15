import "server-only";

import path from "node:path";
import { fileURLToPath } from "node:url";

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
 * ## フォント (Noto Sans JP、Japanese subset を repo 同梱、PR#7)
 * Fontsource の `@fontsource/noto-sans-jp` から Japanese subset (JIS 90 相当、~500KB) の
 * WOFF ファイルを npm 経由で取得し、@react-pdf/renderer の Font.register に **absolute path**
 * で渡す (Buffer 直渡しは非対応、WOFF2 も非対応 — TTF と WOFF のみ)。
 * - 旧実装は CDN (jsdelivr) から NotoSansCJKjp-Regular.otf (~5MB fullset) を毎 cold start で
 *   fetch していた (~1s 初回遅延)。npm 同梱に切替え、cold start ~1s → ~0ms へ短縮。
 * - Next.js standalone build は `outputFileTracing` で node_modules 内の参照ファイルを自動追跡
 *   するが、runtime `require.resolve` の path はビルド時に静的解決できないため、
 *   `next.config.ts` の `outputFileTracingIncludes` で明示 include している。
 * - フォントは Open Font License (OFL 1.1)、商用配布可、subset 派生も OFL 継承で問題なし。
 *
 * ## Hyphenation の無効化
 * デフォルトの hyphenation は英語の単語区切り前提で、日本語テキスト (Text ノードの各文字)
 * を強制的に単文字ハイフン分割してしまう。日本語では単語境界を空白で区切らないため、
 * `Font.registerHyphenationCallback((word) => [word])` で無効化する。
 */

// Noto Sans JP Japanese subset (~500KB compressed WOFF、OFL 1.1 派生) を repo に直接
// 同梱し、module 相対 path で参照する。
//
// **方針**: 旧実装は Fontsource npm package (`@fontsource/noto-sans-jp`) を `require.resolve`
// で参照していたが、Turbopack が (1) `.woff` を直接 require すると "Unknown module type"、
// (2) `package.json` を require.resolve すると bundle module id (integer) に変換される
// 2 段の bundling 問題を起こしていた。`serverExternalPackages` に追加しても後者は解消しない。
// repo 内 relative path なら Turbopack の bundling 対象外で確実に動く。
//
// **outputFileTracing との統合**: font file は `src/shared/pdf/fonts/` に置いてあり、
// Next.js の nft (node file tracer) が module import graph から font-tracer 用の meta hint
// なしに追跡できるよう `next.config.ts` の `outputFileTracingIncludes` で明示 include している。
const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NOTO_SANS_JP_PATH = path.join(
  CURRENT_FILE_DIR,
  "fonts",
  "noto-sans-jp-japanese-400-normal.woff",
);

// 副作用は module load 時に 1 回だけ実行される。@react-pdf/renderer の Font store は
// process-global シングルトンのため多重 register は最新値で上書きされる (害はない)。
Font.register({
  family: "Noto Sans JP",
  src: NOTO_SANS_JP_PATH,
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
