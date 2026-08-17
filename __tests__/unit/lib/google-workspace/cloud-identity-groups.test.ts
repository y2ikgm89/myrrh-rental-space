/**
 * Cloud Identity Groups の HTTP 呼び出しが `withGoogleApiRetry` で包まれていること。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockLookup = mock<
  (args: unknown) => Promise<{ data: { name?: string } }>
>(() => Promise.resolve({ data: { name: "groups/1" } }));
const mockCheckTransitiveMembership = mock<
  (args: unknown) => Promise<{ data: { hasMembership?: boolean } }>
>(() => Promise.resolve({ data: { hasMembership: true } }));

mock.module("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: class GoogleAuth {},
    },
    cloudidentity: () => ({
      groups: {
        lookup: mockLookup,
        memberships: {
          checkTransitiveMembership: mockCheckTransitiveMembership,
        },
      },
    }),
  },
}));

import { isGoogleWorkspaceGroupMember } from "@/shared/lib/google-workspace/cloud-identity-groups";

describe("isGoogleWorkspaceGroupMember", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    mockLookup.mockImplementation(() =>
      Promise.resolve({ data: { name: "groups/1" } }),
    );
    mockCheckTransitiveMembership.mockReset();
    mockCheckTransitiveMembership.mockImplementation(() =>
      Promise.resolve({ data: { hasMembership: true } }),
    );
  });

  test("lookup が 503 のあと成功したら membership を返す（retry 経由）", async () => {
    let calls = 0;
    mockLookup.mockImplementation(() => {
      calls += 1;
      if (calls < 2) {
        return Promise.reject({ code: 503, message: "Service Unavailable" });
      }
      return Promise.resolve({ data: { name: "groups/1" } });
    });

    const result = await isGoogleWorkspaceGroupMember({
      groupEmail: "admins@example.com",
      memberEmail: "user@example.com",
    });

    expect(result).toBe(true);
    expect(calls).toBe(2);
  });
});
