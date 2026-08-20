import "server-only";
import crypto from "node:crypto";

/**
 * Helpers criptograficos para Capa 3 (2FA). El secreto TOTP se cifra en reposo
 * (AES-256-GCM) porque, a diferencia de una contraseña, no tiene sentido hashearlo:
 * el servidor necesita el valor real para calcular el codigo esperado en cada
 * verificacion. Los codigos de recuperacion si son de un solo uso, asi que esos
 * se hashean (SHA-256) y nunca se guardan en texto plano.
 */

function getKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new Error("MFA_ENCRYPTION_KEY no esta configurado");
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY debe ser un hex de 32 bytes (64 caracteres) - generar con: openssl rand -hex 32");
  }
  return key;
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(encoded) {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf-8").digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

// Codigos de recuperacion legibles tipo "XXXX-XXXX" (sin 0/O/1/I para evitar confusion).
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode() {
  const part = () =>
    Array.from({ length: 4 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}
