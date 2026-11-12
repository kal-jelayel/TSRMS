import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
export const encryptedPhonePrefix = "enc:v1:";

export function readPhoneEncryptionKey() {
  const value = process.env.PHONE_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(value ?? "")) {
    throw new Error("PHONE_ENCRYPTION_KEY must contain 64 hexadecimal characters.");
  }
  return Buffer.from(value, "hex");
}

// A new random nonce protects each copy of the phone number independently.
export function encryptPhone(phone, key = readPhoneEncryptionKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, nonce, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  const parts = [nonce, cipher.getAuthTag(), ciphertext];
  return encryptedPhonePrefix + parts.map((part) => part.toString("base64url")).join(":");
}

// GCM verifies the authentication tag before returning the original number.
export function decryptPhone(storedPhone, key = readPhoneEncryptionKey()) {
  if (!storedPhone.startsWith(encryptedPhonePrefix)) {
    throw new Error("Unknown phone encryption format.");
  }
  const parts = storedPhone.slice(encryptedPhonePrefix.length).split(":");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]*$/.test(part))) {
    throw new Error("Invalid encrypted phone number.");
  }
  const [nonce, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (nonce.length !== 12 || tag.length !== 16) {
    throw new Error("Invalid encrypted phone number.");
  }
  const decipher = createDecipheriv(algorithm, key, nonce, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
