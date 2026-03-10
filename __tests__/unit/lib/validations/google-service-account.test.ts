import { describe, expect, test } from "bun:test";
import {
  googleServiceAccountCredentialsSchema,
  parseGoogleServiceAccountCredentials,
} from "@/shared/lib/validations/google-service-account";

const validServiceAccountJson = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  client_email: "service-account@test-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

describe("googleServiceAccountCredentialsSchema", () => {
  test("有効なサービスアカウントJSONを通す", () => {
    const result = googleServiceAccountCredentialsSchema.safeParse({
      type: "service_account",
      client_email: "service-account@test-project.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });

    expect(result.success).toBe(true);
  });

  test("type が service_account でない場合は落とす", () => {
    const result = googleServiceAccountCredentialsSchema.safeParse({
      type: "oauth_client",
      client_email: "service-account@test-project.iam.gserviceaccount.com",
      private_key: "secret",
    });

    expect(result.success).toBe(false);
  });

  test("client_email または private_key が欠けている場合は落とす", () => {
    const result = googleServiceAccountCredentialsSchema.safeParse({
      type: "service_account",
      client_email: "service-account@test-project.iam.gserviceaccount.com",
    });

    expect(result.success).toBe(false);
  });
});

describe("parseGoogleServiceAccountCredentials", () => {
  test("有効な JSON をパースする", () => {
    const result = parseGoogleServiceAccountCredentials(
      validServiceAccountJson,
    );

    expect(result).not.toBeNull();
    expect(result?.client_email).toBe(
      "service-account@test-project.iam.gserviceaccount.com",
    );
  });

  test("不正な JSON は null を返す", () => {
    expect(parseGoogleServiceAccountCredentials("{")).toBeNull();
  });

  test("必須フィールドが欠けた JSON は null を返す", () => {
    const invalidJson = JSON.stringify({
      type: "service_account",
      client_email: "service-account@test-project.iam.gserviceaccount.com",
    });

    expect(parseGoogleServiceAccountCredentials(invalidJson)).toBeNull();
  });
});
