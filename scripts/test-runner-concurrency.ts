type ResolveTestConcurrencyInput = {
  cpuCount: number;
  envParallel: string | undefined;
  isCi: boolean;
};

export function resolveTestConcurrency({
  cpuCount,
  envParallel,
  isCi,
}: ResolveTestConcurrencyInput): number {
  const parsedEnv =
    envParallel === undefined ? Number.NaN : Number.parseInt(envParallel, 10);
  if (Number.isFinite(parsedEnv) && parsedEnv > 0) {
    return parsedEnv;
  }

  const normalizedCpuCount = Math.max(1, cpuCount || 1);
  const defaultCap = isCi ? 4 : 8;
  return Math.min(normalizedCpuCount, defaultCap);
}
