/**
 * メールテンプレート レジストリ — 型のみ。
 *
 * 値（TEMPLATE_KEYS / EMAIL_TEMPLATE_INDEX / TEMPLATE_CATEGORY_LABELS）は
 * `./data.ts`、server-only な完全 registry は `./index.ts` を参照。
 */

import type { ReactElement } from "react";
import type { EmailFooterData } from "@/shared/emails/_shared/footer-data";
import type { EmailResult } from "@/shared/lib/email/types";

export type {
  TemplateKey,
  TemplateCategory,
  EmailTemplateIndexItem,
} from "./data";

export interface TemplateFixtureOverride {
  footer: EmailFooterData;
}

/** 送信時に sender に渡す共通入力（recipient と運用者 ID）。 */
export interface SendTestInput {
  to: string;
  staffId: string;
  triggeredByEmail: string;
  triggeredByName: string;
  /** 設定で取得した実 siteName。subject 構築用。 */
  siteName: string;
  /** `__infra_check` のみで意味を持つ Resend simulator フラグ（任意のタグ用）。 */
  simulatorAddress?: boolean;
  /**
   * fixture の浅マージ用 override。テスト送信時に fixture の `footer` を
   * `getEmailFooterData()` の実値に差し替える用途に限定する。
   */
  fixtureOverride?: TemplateFixtureOverride;
}

/**
 * Server-only な完全レジストリエントリ。
 *
 * - `component`: テンプレ本体（React 関数コンポーネント）
 * - `fixture`: フィクスチャ（`satisfies Props`）でデモプロップス
 * - `renderPreview`: fixture と任意 override から preview 用 ReactElement を生成
 * - `sendTest`: 実 sender ラッパーを呼ぶ「テスト送信用」関数
 *   - subject に必ず `[TEST]` を前置（呼び出し側ではなくエントリ側で強制）
 *   - idempotency key・tags は送信側の既存仕様を尊重
 */
export interface TemplateEntry<P = unknown> {
  key: import("./data").TemplateKey;
  label: string;
  description: string;
  category: import("./data").TemplateCategory;
  component: (props: P) => ReactElement;
  fixture: P;
  renderPreview: (fixtureOverride?: TemplateFixtureOverride) => ReactElement;
  sendTest: (input: SendTestInput) => Promise<EmailResult>;
}
