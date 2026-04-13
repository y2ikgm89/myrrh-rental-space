/**
 * 規約ヘルパー関数（React 非依存）
 *
 * API 呼び出し・表示ラベル・バッジバリアント等の純粋関数を集約
 */

import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { TermsStatus } from "@generated/prisma/enums";
import type { TermsType } from "@generated/prisma/enums";
import type { TermsVersionDetail } from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

export interface TermsFormData {
  title: string;
  slug: string;
  type: string;
  contentJson: string;
  requiredAtReservation: boolean;
  showInFooter: boolean;
}

export interface TermsVersionSummary {
  id: string;
  version: number;
  status: TermsStatus;
  isCurrentVersion: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface TermsData {
  id: string;
  title: string;
  slug: string;
  type: TermsType;
  isActive: boolean;
  requiredAtReservation: boolean;
  showInFooter: boolean;
  versions: TermsVersionSummary[];
}

// =============================================================================
// API Helpers
// =============================================================================

export async function fetchTermsDefaultsForType(type: string): Promise<{
  title: string;
  slug: string;
} | null> {
  return fetchAdminJson(
    `/admin/api/terms/defaults/${encodeURIComponent(type)}`,
  );
}

export async function fetchTermsVersionById(
  versionId: string,
): Promise<Serialized<TermsVersionDetail>> {
  return fetchAdminJson(`/admin/api/terms/versions/${versionId}`);
}

// =============================================================================
// Display Helpers
// =============================================================================

export function versionLabel(v: TermsVersionSummary): string {
  return `v${v.version} ${
    v.status === TermsStatus.DRAFT
      ? "（下書き）"
      : v.status === TermsStatus.PUBLISHED
        ? v.isCurrentVersion
          ? "（公開中・現行）"
          : "（公開済み）"
        : "（アーカイブ）"
  }`;
}

export function statusBadgeVariant(
  status: TermsStatus,
): "default" | "secondary" | "outline" {
  if (status === TermsStatus.PUBLISHED) return "default";
  if (status === TermsStatus.DRAFT) return "secondary";
  return "outline";
}

export function statusLabel(status: TermsStatus): string {
  if (status === TermsStatus.PUBLISHED) return "公開中";
  if (status === TermsStatus.DRAFT) return "下書き";
  return "アーカイブ";
}
