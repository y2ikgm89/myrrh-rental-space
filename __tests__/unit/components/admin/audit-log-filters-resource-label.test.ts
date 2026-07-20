/**
 * AuditLogFilters のリソースラベル解決ロジック。
 *
 * RBAC の Resource（RESOURCE_LABELS）と AuditLog.resource（ドメイン層が
 * "customer.status" 等の自由文字列で書き込む実データ）は別の語彙集合であり、
 * フィルタの選択肢は後者（実データ）を主とし、前者でラベル化できるものだけ
 * 日本語化することを固定する。
 */
import { describe, expect, test } from "bun:test";
import {
  isKnownResource,
  resourceLabel,
} from "@/app/(admin)/admin/(dashboard)/audit-logs/_components/AuditLogFilters";

describe("isKnownResource", () => {
  test("RESOURCE_LABELS に存在する RBAC resource は true", () => {
    expect(isKnownResource("space")).toBe(true);
    expect(isKnownResource("customer")).toBe(true);
  });

  test("ドメイン層が書き込む自由文字列 resource は false", () => {
    expect(isKnownResource("customer.status")).toBe(false);
    expect(isKnownResource("customer.profile")).toBe(false);
    expect(isKnownResource("customer.anonymization")).toBe(false);
    expect(isKnownResource("settings.tax")).toBe(false);
    expect(isKnownResource("settings.discount")).toBe(false);
    expect(isKnownResource("settings.refundPolicy")).toBe(false);
    expect(isKnownResource("adminAuth")).toBe(false);
    expect(isKnownResource("reservation_series")).toBe(false);
  });
});

describe("resourceLabel", () => {
  test("既知の resource は日本語ラベルに変換する", () => {
    expect(resourceLabel("space")).toBe("スペース");
  });

  test("未知の resource（ドメイン層の自由文字列）はそのまま表示する", () => {
    expect(resourceLabel("customer.status")).toBe("customer.status");
    expect(resourceLabel("settings.tax")).toBe("settings.tax");
    expect(resourceLabel("adminAuth")).toBe("adminAuth");
  });
});
