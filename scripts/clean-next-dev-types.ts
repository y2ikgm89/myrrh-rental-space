#!/usr/bin/env bun
import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, ".next", "dev", "types");
const relativeTarget = relative(root, target);

if (
  relativeTarget === "" ||
  relativeTarget.startsWith("..") ||
  isAbsolute(relativeTarget)
) {
  console.error(
    `[clean-next-dev-types] refusing to remove path outside workspace: ${target}`,
  );
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
