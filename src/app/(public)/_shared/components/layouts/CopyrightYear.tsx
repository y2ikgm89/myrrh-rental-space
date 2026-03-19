"use client";

export function CopyrightYear() {
  // eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is safe here
  return <>{new Date().getFullYear()}</>;
}
