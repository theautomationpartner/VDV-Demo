import "server-only";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { sql } from "@/lib/server/db";
import { encrypt, decrypt, sha256, generateRecoveryCode } from "@/lib/server/crypto";

/**
 * 2FA / TOTP - estandar RFC 6238 (el mismo que Google/Microsoft Authenticator,
 * Authy, 1Password). Todo esto se indexa por `usuario_id` (el id de
 * usuarios_autorizados, ver lib/server/whitelist.js), no por ningun id de monday -
 * la app es standalone, monday es solo fuente de datos, nunca de identidad.
 */

const ISSUER = "VDV Suite";
const RECOVERY_CODE_COUNT = 10;

function buildTotp(email, secret) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

export async function tieneMfaConfigurado(usuarioId) {
  const rows = await sql`select confirmado_en from mfa_usuarios where usuario_id = ${usuarioId} limit 1`;
  return Boolean(rows[0]?.confirmado_en);
}

/**
 * Arranca (o reinicia) el setup de 2FA: genera un secreto nuevo, lo guarda cifrado
 * y sin confirmar, y devuelve el QR para escanear. Mientras no se confirme con
 * confirmarSetupMfa(), el login sigue sin poder completarse.
 */
export async function iniciarSetupMfa(usuarioId, email) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = buildTotp(email, secret);

  await sql`
    insert into mfa_usuarios (usuario_id, secreto_cifrado, confirmado_en, ultimo_periodo)
    values (${usuarioId}, ${encrypt(secret.base32)}, null, null)
    on conflict (usuario_id) do update set secreto_cifrado = excluded.secreto_cifrado, confirmado_en = null, ultimo_periodo = null
  `;

  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  return { otpauthUri, qrDataUrl, secretBase32: secret.base32 };
}

async function obtenerSecreto(usuarioId) {
  const rows = await sql`select secreto_cifrado, ultimo_periodo from mfa_usuarios where usuario_id = ${usuarioId} limit 1`;
  if (!rows[0]) return null;
  return { secret: decrypt(rows[0].secreto_cifrado), ultimoPeriodo: rows[0].ultimo_periodo };
}

function validarCodigo(secret, code) {
  const totp = buildTotp("", secret);
  // window: 1 tolera +-30s de desfasaje de reloj del celular. Devuelve el "periodo"
  // (delta) que matcheo, o null si el codigo es invalido.
  return totp.validate({ token: String(code).replace(/\s+/g, ""), window: 1 });
}

/**
 * Confirma el setup inicial (primer codigo escaneado). Si es valido, marca la
 * cuenta como confirmada y devuelve los codigos de recuperacion EN TEXTO PLANO -
 * es la unica vez que se muestran, despues solo se guarda su hash.
 */
export async function confirmarSetupMfa(usuarioId, code) {
  const datos = await obtenerSecreto(usuarioId);
  if (!datos) throw new Error("No hay un setup de 2FA en curso para este usuario");

  const delta = validarCodigo(datos.secret, code);
  if (delta === null) return { ok: false };

  const periodoActual = Math.floor(Date.now() / 1000 / 30) + delta;
  await sql`update mfa_usuarios set confirmado_en = now(), ultimo_periodo = ${periodoActual} where usuario_id = ${usuarioId}`;

  await sql`delete from mfa_codigos_recuperacion where usuario_id = ${usuarioId}`;
  const codigos = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  for (const codigo of codigos) {
    await sql`insert into mfa_codigos_recuperacion (usuario_id, hash_codigo) values (${usuarioId}, ${sha256(codigo)})`;
  }

  return { ok: true, recoveryCodes: codigos };
}

/**
 * Verifica un codigo TOTP de 6 digitos en el login normal (no en el setup inicial).
 * Anti-reutilizacion: si alguien intercepta un codigo ya usado, no sirve una
 * segunda vez (se guarda el ultimo "periodo" de 30s que ya se acepto).
 */
export async function verificarCodigoMfa(usuarioId, code) {
  const datos = await obtenerSecreto(usuarioId);
  if (!datos) return { ok: false, reason: "no_configurado" };

  const delta = validarCodigo(datos.secret, code);
  if (delta === null) return { ok: false, reason: "codigo_invalido" };

  const periodoActual = Math.floor(Date.now() / 1000 / 30) + delta;
  if (datos.ultimoPeriodo != null && periodoActual <= Number(datos.ultimoPeriodo)) {
    return { ok: false, reason: "codigo_reutilizado" };
  }

  await sql`update mfa_usuarios set ultimo_periodo = ${periodoActual} where usuario_id = ${usuarioId}`;
  return { ok: true };
}

/**
 * Fallback para cuando el usuario perdio el celular: codigo de recuperacion de
 * un solo uso (de los 10 que se le dieron al confirmar el setup).
 */
export async function verificarCodigoRecuperacion(usuarioId, code) {
  const hash = sha256(String(code).trim().toUpperCase());
  const rows = await sql`
    select id from mfa_codigos_recuperacion
    where usuario_id = ${usuarioId} and hash_codigo = ${hash} and usado_en is null
    limit 1
  `;
  if (!rows[0]) return { ok: false };

  await sql`update mfa_codigos_recuperacion set usado_en = now() where id = ${rows[0].id}`;
  return { ok: true };
}
