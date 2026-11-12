import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashPattern = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{64})$/;

export async function hashStaffPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, options);
  return `scrypt-v1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyStaffPassword(password, stored) {
  const match = hashPattern.exec(stored ?? "");
  const salt = match ? Buffer.from(match[1], "hex") : Buffer.alloc(16);
  const candidate = await derive(password, salt, 32, options);
  return Boolean(match && timingSafeEqual(candidate, Buffer.from(match[2], "hex")));
}
