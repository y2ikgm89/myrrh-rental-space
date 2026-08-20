import { describe, expect, test } from "bun:test";

import { formatCustomerAddress } from "@/shared/lib/customer-address";

describe("formatCustomerAddress", () => {
  test("空白区切りで 1 行化する", () => {
    expect(
      formatCustomerAddress({
        postalCode: "150-0001",
        prefecture: "東京都",
        city: "渋谷区",
        streetAddress: "神宮前1-1-1",
        building: "サンプルビル 2F",
      }),
    ).toBe("〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル 2F");
  });

  test("buildingName 別名を吸収する", () => {
    expect(
      formatCustomerAddress({
        postalCode: "150-0001",
        prefecture: "東京都",
        city: "渋谷区",
        streetAddress: "神宮前1-1-1",
        buildingName: "本館ビル",
      }),
    ).toBe("〒150-0001 東京都 渋谷区 神宮前1-1-1 本館ビル");
  });

  test("公開面の無空白結合を維持できる", () => {
    expect(
      formatCustomerAddress(
        {
          postalCode: "150-0001",
          prefecture: "東京都",
          city: "渋谷区",
          streetAddress: "神宮前1-1-1",
          buildingName: "本館ビル",
        },
        { separator: "" },
      ),
    ).toBe("〒150-0001東京都渋谷区神宮前1-1-1本館ビル");
  });

  test("全フィールド空なら空文字", () => {
    expect(
      formatCustomerAddress({
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        building: null,
      }),
    ).toBe("");
  });
});
