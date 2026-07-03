import { describe, expect, test } from "bun:test";

import { resolveTestConcurrency } from "../../../scripts/test-runner-concurrency";

describe("test runner concurrency", () => {
  test("keeps CI default capped at 4 workers", () => {
    expect(
      resolveTestConcurrency({
        cpuCount: 32,
        envParallel: undefined,
        isCi: true,
      }),
    ).toBe(4);
  });

  test("allows local default to use up to 8 workers", () => {
    expect(
      resolveTestConcurrency({
        cpuCount: 32,
        envParallel: undefined,
        isCi: false,
      }),
    ).toBe(8);
  });

  test("keeps low-cpu local machines within available CPU count", () => {
    expect(
      resolveTestConcurrency({
        cpuCount: 2,
        envParallel: undefined,
        isCi: false,
      }),
    ).toBe(2);
  });

  test("lets TEST_PARALLEL override CI and local defaults", () => {
    expect(
      resolveTestConcurrency({
        cpuCount: 2,
        envParallel: "12",
        isCi: true,
      }),
    ).toBe(12);
  });

  test("ignores invalid TEST_PARALLEL values", () => {
    expect(
      resolveTestConcurrency({
        cpuCount: 32,
        envParallel: "invalid",
        isCi: false,
      }),
    ).toBe(8);
  });
});
