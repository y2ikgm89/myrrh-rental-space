import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage, RequestOptions } from "node:http";

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

type PinnedRequestOptions = RequestOptions & {
  servername?: string;
};

export class PublicHttpFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicHttpFetchError";
  }
}

function stripHostBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function parseIpv4Bytes(
  address: string,
): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
  });

  if (bytes.some((byte) => byte === null)) return null;
  const a = bytes[0];
  const b = bytes[1];
  const c = bytes[2];
  const d = bytes[3];
  if (
    a === null ||
    a === undefined ||
    b === null ||
    b === undefined ||
    c === null ||
    c === undefined ||
    d === null ||
    d === undefined
  ) {
    return null;
  }
  return [a, b, c, d];
}

function ipv4ToNumber(bytes: [number, number, number, number]): number {
  const [a, b, c, d] = bytes;
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

function isIpv4InRange(
  value: number,
  start: [number, number, number, number],
  end: [number, number, number, number],
): boolean {
  const startValue = ipv4ToNumber(start);
  const endValue = ipv4ToNumber(end);
  return value >= startValue && value <= endValue;
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const bytes = parseIpv4Bytes(address);
  if (!bytes) return false;
  const value = ipv4ToNumber(bytes);

  return (
    isIpv4InRange(value, [0, 0, 0, 0], [0, 255, 255, 255]) ||
    isIpv4InRange(value, [10, 0, 0, 0], [10, 255, 255, 255]) ||
    isIpv4InRange(value, [100, 64, 0, 0], [100, 127, 255, 255]) ||
    isIpv4InRange(value, [127, 0, 0, 0], [127, 255, 255, 255]) ||
    isIpv4InRange(value, [169, 254, 0, 0], [169, 254, 255, 255]) ||
    isIpv4InRange(value, [172, 16, 0, 0], [172, 31, 255, 255]) ||
    isIpv4InRange(value, [192, 0, 0, 0], [192, 0, 0, 255]) ||
    isIpv4InRange(value, [192, 0, 2, 0], [192, 0, 2, 255]) ||
    isIpv4InRange(value, [192, 168, 0, 0], [192, 168, 255, 255]) ||
    isIpv4InRange(value, [198, 18, 0, 0], [198, 19, 255, 255]) ||
    isIpv4InRange(value, [198, 51, 100, 0], [198, 51, 100, 255]) ||
    isIpv4InRange(value, [203, 0, 113, 0], [203, 0, 113, 255]) ||
    isIpv4InRange(value, [224, 0, 0, 0], [255, 255, 255, 255])
  );
}

function parseIpv6Bytes(address: string): number[] | null {
  const withoutZone =
    stripHostBrackets(address.toLowerCase()).split("%")[0] ?? "";
  if (!withoutZone.includes(":")) return null;

  let normalized = withoutZone;
  const lastColon = normalized.lastIndexOf(":");
  const maybeIpv4 = lastColon >= 0 ? normalized.slice(lastColon + 1) : "";
  const ipv4Bytes = parseIpv4Bytes(maybeIpv4);
  if (ipv4Bytes) {
    const [a, b, c, d] = ipv4Bytes;
    normalized = `${normalized.slice(0, lastColon)}:${((a << 8) | b).toString(
      16,
    )}:${((c << 8) | d).toString(16)}`;
  }

  const compressionParts = normalized.split("::");
  if (compressionParts.length > 2) return null;

  const left = compressionParts[0]
    ? compressionParts[0].split(":").filter(Boolean)
    : [];
  const right = compressionParts[1]
    ? compressionParts[1].split(":").filter(Boolean)
    : [];
  const groups = [...left, ...right];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if (groups.length > 8) return null;

  const zeroCount = compressionParts.length === 2 ? 8 - groups.length : 0;
  if (compressionParts.length === 1 && groups.length !== 8) return null;
  if (zeroCount < 0) return null;

  const expanded = [...left, ...Array<string>(zeroCount).fill("0"), ...right];
  if (expanded.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of expanded) {
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function isAllZero(bytes: readonly number[]): boolean {
  return bytes.every((byte) => byte === 0);
}

function isIpv4MappedIpv6(bytes: readonly number[]): boolean {
  return (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  );
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const bytes = parseIpv6Bytes(address);
  if (!bytes) return false;

  if (isAllZero(bytes)) return true;
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return true;
  }

  if (isIpv4MappedIpv6(bytes)) {
    const mapped: [number, number, number, number] = [
      bytes[12] ?? 0,
      bytes[13] ?? 0,
      bytes[14] ?? 0,
      bytes[15] ?? 0,
    ];
    return isPrivateOrReservedIpv4(mapped.join("."));
  }

  return (
    (bytes[0] ?? 0) === 0xff ||
    ((bytes[0] ?? 0) & 0xfe) === 0xfc ||
    ((bytes[0] ?? 0) === 0xfe && ((bytes[1] ?? 0) & 0xc0) === 0x80) ||
    ((bytes[0] ?? 0) === 0x20 &&
      (bytes[1] ?? 0) === 0x01 &&
      (bytes[2] ?? 0) === 0x0d &&
      (bytes[3] ?? 0) === 0xb8)
  );
}

/**
 * プライベート/予約済みホストかどうかを判定する。
 *
 * URL 文字列の検証だけでは SSRF 対策として不十分なため、DNS 解決結果にも同じ
 * 判定を適用する。Bun では `net.BlockList` が no-op のため、CIDR 判定はここに
 * 明示実装する。
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = stripHostBrackets(hostname.trim()).toLowerCase();
  if (!host) return true;

  if (host === "localhost") return true;

  if (isIP(host) === 4) {
    return isPrivateOrReservedIpv4(host);
  }
  if (isIP(host) === 6) {
    return isPrivateOrReservedIpv6(host);
  }

  const internalPatterns = [
    /^localhost$/i,
    /^.*\.local$/i,
    /^.*\.internal$/i,
    /^.*\.localdomain$/i,
    /^.*\.localhost$/i,
    /^kubernetes\.default/i,
    /^metadata\.google\.internal$/i,
  ];

  return internalPatterns.some((pattern) => pattern.test(host));
}

function getUrlPort(url: URL): number {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === "https:" ? 443 : 80;
}

function assertPublicHttpUrl(urlString: string): URL {
  const url = new URL(urlString);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicHttpFetchError("unsupported protocol");
  }
  if (!ALLOWED_PORTS.has(getUrlPort(url))) {
    throw new PublicHttpFetchError("unsupported port");
  }
  if (isPrivateOrReservedHost(url.hostname)) {
    throw new PublicHttpFetchError("private or reserved host");
  }
  return url;
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const host = stripHostBrackets(hostname);
  if (isIP(host)) {
    if (isPrivateOrReservedHost(host)) {
      throw new PublicHttpFetchError("private or reserved address");
    }
    return [host];
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new PublicHttpFetchError("host has no addresses");
  }

  const addresses = records.map((record) => record.address);
  if (addresses.some(isPrivateOrReservedHost)) {
    throw new PublicHttpFetchError("host resolves to a private address");
  }
  return addresses;
}

export async function isUrlSafe(urlString: string): Promise<boolean> {
  try {
    const url = assertPublicHttpUrl(urlString);
    await resolvePublicAddresses(url.hostname);
    return true;
  } catch {
    return false;
  }
}

function normalizeHeaders(headersInit: HeadersInit | undefined): Headers {
  return new Headers(headersInit);
}

function getRequestHostHeader(url: URL): string {
  const port = getUrlPort(url);
  if (
    (url.protocol === "https:" && port === 443) ||
    (url.protocol === "http:" && port === 80)
  ) {
    return stripHostBrackets(url.hostname);
  }
  return `${stripHostBrackets(url.hostname)}:${port}`;
}

function toRequestHeaders(url: URL, headersInit: HeadersInit | undefined) {
  const headers = normalizeHeaders(headersInit);
  headers.set("host", getRequestHostHeader(url));

  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function toResponseHeaders(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function toUint8Array(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  throw new TypeError("Unsupported response chunk");
}

function toWebReadableStream(
  message: IncomingMessage,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      message.on("data", (chunk: unknown) => {
        controller.enqueue(toUint8Array(chunk));
      });
      message.once("end", () => {
        controller.close();
      });
      message.once("error", (error) => {
        controller.error(error);
      });
    },
    cancel() {
      message.destroy();
    },
  });
}

function requestPinned(
  url: URL,
  address: string,
  init: RequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestOptions: PinnedRequestOptions = {
      protocol: url.protocol,
      hostname: address,
      port: getUrlPort(url),
      path: `${url.pathname}${url.search}`,
      method: init.method ?? "GET",
      headers: toRequestHeaders(url, init.headers),
    };

    if (init.signal) {
      requestOptions.signal = init.signal;
    }
    if (url.protocol === "https:") {
      requestOptions.servername = stripHostBrackets(url.hostname);
    }

    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requestFn(requestOptions, (message) => {
      const responseInit: ResponseInit = {
        status: message.statusCode ?? 502,
        headers: toResponseHeaders(message),
      };
      if (message.statusMessage !== undefined) {
        responseInit.statusText = message.statusMessage;
      }

      resolve(new Response(toWebReadableStream(message), responseInit));
    });

    request.once("error", reject);
    request.end();
  });
}

/**
 * Public HTTP(S) resource fetch with DNS result pinning.
 *
 * The hostname is resolved once, every A/AAAA answer is checked against the
 * same public-address policy, and the TCP/TLS connection is opened to one of
 * those vetted addresses while preserving the original Host header and SNI.
 */
export async function fetchPublicHttpResource(
  urlString: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = assertPublicHttpUrl(urlString);
  const addresses = await resolvePublicAddresses(url.hostname);
  const [address] = addresses;
  if (!address) {
    throw new PublicHttpFetchError("host has no public addresses");
  }
  return requestPinned(url, address, init);
}
