export type TestNodeEnv = "development" | "production" | "test" | undefined;

export function setNodeEnv(value: TestNodeEnv): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }

  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
