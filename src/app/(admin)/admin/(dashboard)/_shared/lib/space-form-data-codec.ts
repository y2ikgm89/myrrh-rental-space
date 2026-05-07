/**
 * スペース作成・更新フォームを `FormData` と `SpaceFormData` の間で変換する。
 *
 * React 19 `useActionState` + Server Action（`FormData`）の推奨フローに合わせ、
 * クライアントで組み立てた `FormData` をサーバーで `spaceFormSchema` に渡す。
 */

import {
  spaceFormSchema,
  type SpaceFormData,
} from "@/admin/lib/validations/space";
import { isRecord } from "@/shared/lib/serialize";

/** 作成 or 更新（Server Action が分岐に使用） */
export const SPACE_FORM_META_INTENT = "__intent" as const;

/** 更新時のスペース ID */
export const SPACE_FORM_META_SPACE_ID = "__spaceId" as const;

/**
 * クライアント送信世代（古い応答のトースト／setError を抑止する）
 */
export const SPACE_FORM_META_CLIENT_NONCE = "__clientNonce" as const;

export type SpaceFormSubmitIntent = "create" | "update";

function getTrimmedString(formData: FormData, key: string): string {
  const v = formData.get(key);
  if (v == null) return "";
  return String(v).trim();
}

function getOptionalUuid(formData: FormData, key: string): string | null {
  const s = getTrimmedString(formData, key);
  return s === "" ? null : s;
}

function getRequiredUuidString(formData: FormData, key: string): string {
  return getTrimmedString(formData, key);
}

function getOptionalNullableNumber(
  formData: FormData,
  key: string,
): number | null {
  const s = getTrimmedString(formData, key);
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return Number.NaN;
  return n;
}

function getRequiredInt(formData: FormData, key: string): number | undefined {
  const s = getTrimmedString(formData, key);
  if (s === "") return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

function getRequiredFiniteNumber(
  formData: FormData,
  key: string,
): number | undefined {
  const s = getTrimmedString(formData, key);
  if (s === "") return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function emptyToNull(s: string): string | null {
  return s === "" ? null : s;
}

function emptyOgpImageToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * `FormData` からメタ項目を除いた生オブジェクトを組み立て、`spaceFormSchema` で検証する。
 */
export function parseSpaceFormFromFormData(formData: FormData) {
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v).trim())
    .filter((u) => u.length > 0);

  // 設備配列は { name, iconName } の object として JSON 1 つずつ append される。
  // 失敗 / 空文字列は skip（防御的読み取り）。
  const facilities = formData
    .getAll("facilities")
    .map((v) => {
      const trimmed = String(v).trim();
      if (trimmed.length === 0) return null;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (
          isRecord(parsed) &&
          typeof parsed["name"] === "string" &&
          typeof parsed["iconName"] === "string"
        ) {
          return { name: parsed["name"], iconName: parsed["iconName"] };
        }
      } catch {
        // 旧形式の string 互換性: name のみ受け入れて iconName 空文字
        return { name: trimmed, iconName: "" };
      }
      return null;
    })
    .filter((f): f is { name: string; iconName: string } => f !== null);

  const raw = {
    slug: getTrimmedString(formData, "slug"),
    name: getTrimmedString(formData, "name"),
    descriptionJson: getTrimmedString(formData, "descriptionJson"),
    addressDetail: getTrimmedString(formData, "addressDetail"),
    capacity: getRequiredInt(formData, "capacity"),
    area: getOptionalNullableNumber(formData, "area"),
    hourlyPrice: getRequiredFiniteNumber(formData, "hourlyPrice"),
    dailyPrice: getOptionalNullableNumber(formData, "dailyPrice"),
    mainImageUrl: getTrimmedString(formData, "mainImageUrl"),
    imageUrls,
    facilities,
    isPublished: getTrimmedString(formData, "isPublished") === "true",
    reviewsEnabled: getTrimmedString(formData, "reviewsEnabled") === "true",
    locationId: getRequiredUuidString(formData, "locationId"),
    categoryId: getOptionalUuid(formData, "categoryId"),
    discountType: getTrimmedString(formData, "discountType"),
    discountValue: getOptionalNullableNumber(formData, "discountValue"),
    durationDiscountOverride: getTrimmedString(
      formData,
      "durationDiscountOverride",
    ),
    taxRateType: getTrimmedString(formData, "taxRateType"),
    metaDescription: emptyToNull(getTrimmedString(formData, "metaDescription")),
    metaKeywords: emptyToNull(getTrimmedString(formData, "metaKeywords")),
    ogpTitle: emptyToNull(getTrimmedString(formData, "ogpTitle")),
    ogpDescription: emptyToNull(getTrimmedString(formData, "ogpDescription")),
    ogpImageUrl: emptyOgpImageToNull(getTrimmedString(formData, "ogpImageUrl")),
  };

  return spaceFormSchema.safeParse(raw);
}

export type SpaceFormActionMeta = {
  intent: SpaceFormSubmitIntent;
  spaceId?: string;
  clientNonce: number;
};

/**
 * 検証済み `SpaceFormData` とメタ情報から `FormData` を構築する（クライアント送信用）。
 */
export function spaceFormDataToFormData(
  payload: SpaceFormData,
  meta: SpaceFormActionMeta,
): FormData {
  const fd = new FormData();
  fd.set(SPACE_FORM_META_INTENT, meta.intent);
  fd.set(SPACE_FORM_META_CLIENT_NONCE, String(meta.clientNonce));
  if (meta.spaceId !== undefined && meta.spaceId !== "") {
    fd.set(SPACE_FORM_META_SPACE_ID, meta.spaceId);
  }

  fd.set("slug", payload.slug);
  fd.set("name", payload.name);
  fd.set("descriptionJson", payload.descriptionJson);
  fd.set("addressDetail", payload.addressDetail ?? "");
  fd.set("capacity", String(payload.capacity));
  fd.set("hourlyPrice", String(payload.hourlyPrice));
  fd.set("mainImageUrl", payload.mainImageUrl);
  fd.set("isPublished", payload.isPublished ? "true" : "false");
  fd.set("reviewsEnabled", payload.reviewsEnabled ? "true" : "false");

  if (payload.area != null) {
    fd.set("area", String(payload.area));
  } else {
    fd.set("area", "");
  }

  if (payload.dailyPrice != null) {
    fd.set("dailyPrice", String(payload.dailyPrice));
  } else {
    fd.set("dailyPrice", "");
  }

  if (payload.discountValue != null) {
    fd.set("discountValue", String(payload.discountValue));
  } else {
    fd.set("discountValue", "");
  }

  fd.set("discountType", payload.discountType);
  fd.set("durationDiscountOverride", payload.durationDiscountOverride);
  fd.set("taxRateType", payload.taxRateType);

  fd.set("locationId", payload.locationId);
  fd.set("categoryId", payload.categoryId ?? "");

  fd.set("metaDescription", payload.metaDescription ?? "");
  fd.set("metaKeywords", payload.metaKeywords ?? "");
  fd.set("ogpTitle", payload.ogpTitle ?? "");
  fd.set("ogpDescription", payload.ogpDescription ?? "");
  fd.set("ogpImageUrl", payload.ogpImageUrl ?? "");

  for (const url of payload.imageUrls) {
    fd.append("imageUrls", url);
  }

  for (const facility of payload.facilities) {
    fd.append("facilities", JSON.stringify(facility));
  }

  return fd;
}

/**
 * `FormData` から送信メタを読み取る（検証失敗時も nonce を返す）
 */
export function readSpaceFormActionMeta(formData: FormData): {
  intent: SpaceFormSubmitIntent | null;
  spaceId: string | null;
  clientNonce: number;
} {
  const intentRaw = getTrimmedString(formData, SPACE_FORM_META_INTENT);
  const intent: SpaceFormSubmitIntent | null =
    intentRaw === "create" || intentRaw === "update" ? intentRaw : null;

  const spaceIdRaw = getTrimmedString(formData, SPACE_FORM_META_SPACE_ID);
  const spaceId = spaceIdRaw === "" ? null : spaceIdRaw;

  const nonceRaw = getTrimmedString(formData, SPACE_FORM_META_CLIENT_NONCE);
  const parsedNonce = Number(nonceRaw);
  const clientNonce = Number.isFinite(parsedNonce) ? parsedNonce : 0;

  return { intent, spaceId, clientNonce };
}
