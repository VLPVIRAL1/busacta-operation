// Password helpers for file-request links.
// System-generated, hashed with PBKDF2-SHA-256 + salt; verified in constant time.
// Works in both Node (server fn) and Cloudflare Workers (server route) via Web Crypto.

const ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    HASH_BITS,
  );
  return toHex(bits);
}

/** Returns "pbkdf2$<iter>$<saltHex>$<hashHex>". */
export async function hashFileRequestPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await pbkdf2(password, salt);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${hashHex}`;
}

export async function verifyFileRequestPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return true; // no password set ⇒ open link
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = fromHex(parts[2]);
  const expected = parts[3];
  const got = await pbkdf2(password, salt);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Generates a memorable 16-char passphrase like "PXKD-7H2N-MBQR-V4LT". */
export function generateFileRequestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (let i = 0; i < 16; i++) s += alphabet[bytes[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}
