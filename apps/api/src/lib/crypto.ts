import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomUUID,
  scryptSync,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { env } from "../config.js";

export const b64 = (buf: Buffer): string => buf.toString("base64");
export const b64u = (buf: Buffer): string => buf.toString("base64url");
export const fromB64 = (value: string): Buffer => Buffer.from(value, "base64");
export const fromB64u = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function sha256Hex(data: string | Buffer): string {
  return sha256(data).toString("hex");
}

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return b64u(randomBytes(bytes));
}

export function newNonce(bytes = 16): string {
  return b64u(randomBytes(bytes));
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/* --------------------------------------------------------------- passwords */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, b64u(salt), b64u(key)].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
    if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !keyB64) return false;
    const expected = Buffer.from(keyB64, "base64url");
    const actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------- secrets at rest */

/** Encrypts a small secret (VLESS URI) with the platform master key. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.masterKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64u(iv), b64u(cipher.getAuthTag()), b64u(ct)].join(".");
}

export function decryptSecret(blob: string): string {
  const [version, ivB64, tagB64, ctB64] = blob.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new Error("invalid secret blob");
  const decipher = createDecipheriv("aes-256-gcm", env.masterKey, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------ device keys */

export function parseSpki(spkiB64: string) {
  return createPublicKey({ key: Buffer.from(spkiB64, "base64"), format: "der", type: "spki" });
}

export function verifyDeviceSignature(spkiB64: string, message: string, signatureB64: string): boolean {
  try {
    return verify("sha256", Buffer.from(message, "utf8"), parseSpki(spkiB64), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Canonical string the Android client signs. Keep in sync with DeviceProof.kt. */
export function canonicalProof(input: {
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
}): string {
  const bodyHash = sha256Hex(input.body === "" ? "" : input.body);
  return [input.method.toUpperCase(), input.path, bodyHash, input.timestamp, input.nonce].join("\n");
}

/* --------------------------------------------------------- bundle sealing */

export interface SealedEnvelope {
  version: 1;
  ephemeralKey: string;
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
  digest: string;
}

/**
 * ECDH P-256 (ephemeral server key) -> HKDF-SHA256 -> AES-256-GCM.
 * The device private key lives in the Android Keystore and never leaves it.
 */
export function sealForDevice(
  agreementSpkiB64: string,
  plaintext: string,
  context: { deviceId: string; revision: number },
): SealedEnvelope {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const deviceKey = parseSpki(agreementSpkiB64);
  const shared = diffieHellman({ privateKey, publicKey: deviceKey });
  const salt = randomBytes(16);
  const info = Buffer.from(`vpn-bundle-v1|${context.deviceId}|${context.revision}`, "utf8");
  const key = Buffer.from(hkdfSync("sha256", shared, salt, info, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const ephemeralKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    version: 1,
    ephemeralKey,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    tag: b64(cipher.getAuthTag()),
    digest: b64(sha256(plaintext)),
  };
}

/** Used by tests and by the CLI to inspect a bundle. Mirrors the Android side. */
export function openEnvelope(envelope: SealedEnvelope, devicePrivateKeyPem: string, context: { deviceId: string; revision: number }) {
  const shared = diffieHellman({
    privateKey: createPrivateKey(devicePrivateKeyPem),
    publicKey: createPublicKey({ key: Buffer.from(envelope.ephemeralKey, "base64"), format: "der", type: "spki" }),
  });
  const info = Buffer.from(`vpn-bundle-v1|${context.deviceId}|${context.revision}`, "utf8");
  const key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(envelope.salt, "base64"), info, 32));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------------- misc */

/** Stable per-device identity for a VLESS endpoint (UUIDv5-like, SHA-1 based). */
export function deviceIdentity(userId: string, deviceId: string, endpointId: string): string {
  const namespace = "6f6c2f1a-1f2e-4b7a-9c1d-000000000000";
  const hash = createHash("sha1").update(`${namespace}:${userId}:${deviceId}:${endpointId}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signPayload(privatePem: string, payload: string): string {
  return sign("sha256", Buffer.from(payload), privatePem).toString("base64");
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
