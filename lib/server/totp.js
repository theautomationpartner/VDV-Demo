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
 * Habilita un nuevo setup de 2FA para una cuenta que YA tiene uno confirmado -
 * llamar solo despues de una prueba de posesion real (un codigo de recuperacion
 * valido consumido en verificarCodigoRecuperacion). /api/auth/mfa/setup rechaza
 * generar un secreto nuevo mientras tieneMfaConfigurado() siga en true, para que
 * no alcance con conocer el email de la cuenta (ver app/api/auth/mfa/setup/route.js).
 *
 * Borra la fila entera, no solo la marca de confirmado: iniciarSetupMfa() reusa
 * el secreto pendiente si lo encuentra, asi que dejarlo ahi le devolveria a la
 * persona el mismo secreto que quedo en el celular que perdio.
 */
export async function invalidarMfaConfirmado(usuarioId) {
  await sql`delete from mfa_usuarios where usuario_id = ${usuarioId}`;
}

/**
 * Arranca el setup de 2FA y devuelve el QR para escanear. Mientras no se confirme
 * con confirmarSetupMfa(), el login sigue sin poder completarse.
 *
 * Si ya hay un secreto pendiente (sin confirmar) se devuelve ESE, no uno nuevo.
 * Generando uno nuevo en cada llamada, la segunda carga de la pantalla -otra
 * pestaña, un refresco, volver atras, o Android recargando la pestaña mientras
 * la persona esta en su app de autenticacion- pisaba el secreto que acababa de
 * guardar: de ahi en adelante todos sus codigos daban "Codigo invalido", para
 * siempre y sin forma de salir.
 */
export async function iniciarSetupMfa(usuarioId, email) {
  const secret = (await secretoPendiente(usuarioId)) ?? (await crearSecretoPendiente(usuarioId));
  const totp = buildTotp(email, secret);

  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  return { otpauthUri, qrDataUrl, secretBase32: secret.base32 };
}

/** El secreto ya emitido y todavia sin confirmar de esta cuenta, si lo hay. */
async function secretoPendiente(usuarioId) {
  const rows = await sql`
    select secreto_cifrado from mfa_usuarios
    where usuario_id = ${usuarioId} and confirmado_en is null
    limit 1
  `;
  if (!rows[0]) return null;
  return OTPAuth.Secret.fromBase32(decrypt(rows[0].secreto_cifrado));
}

async function crearSecretoPendiente(usuarioId) {
  const secret = new OTPAuth.Secret({ size: 20 });
  await sql`
    insert into mfa_usuarios (usuario_id, secreto_cifrado, confirmado_en, ultimo_periodo)
    values (${usuarioId}, ${encrypt(secret.base32)}, null, null)
    on conflict (usuario_id) do update set secreto_cifrado = excluded.secreto_cifrado, confirmado_en = null, ultimo_periodo = null
  `;
  return secret;
}

async function obtenerSecreto(usuarioId) {
  const rows = await sql`select secreto_cifrado, ultimo_periodo from mfa_usuarios where usuario_id = ${usuarioId} limit 1`;
  if (!rows[0]) return null;
  return { secret: decrypt(rows[0].secreto_cifrado), ultimoPeriodo: rows[0].ultimo_periodo };
}

/**
 * Cuantos periodos de 30s para cada lado se aceptan. 4 = +-2 minutos.
 *
 * Por que tan ancha: el enrolamiento obliga a salir a la app de autenticacion,
 * cargar la cuenta (a veces tipeando la clave a mano) y volver, y en el medio el
 * navegador del celular puede descartar la pestaña y obligar a escribir el email
 * otra vez. Medido en produccion: el unico enrolamiento que entro tardo 4s entre
 * pedir el QR y confirmar; los seis que fallaron tardaron 46-101s, o sea que el
 * codigo ya habia vencido antes de llegar a apretar el boton.
 *
 * Por que es LA MISMA para el enrolamiento y para el login, y no una ancha y una
 * angosta: el desfasaje de un codigo mezcla dos cosas que desde el servidor no se
 * pueden separar - cuanto tardo la persona, y cuanto esta corrido el reloj de su
 * celular. Si el enrolamiento tolerara mas que el login, alguien con el reloj
 * corrido 1-2 minutos configuraria su 2FA sin problema, entraria esa vez... y
 * despues no podria entrar NUNCA MAS, sin ninguna forma de darse cuenta por que.
 * Igualarlas garantiza lo unico que importa: si pudiste configurarlo, podes
 * entrar.
 *
 * Lo que esto NO afloja: un codigo ya usado sigue sin servir dos veces
 * (ultimo_periodo, ver verificarCodigoMfa) y siguen siendo 5 intentos fallidos
 * cada 15 minutos por cuenta (lib/server/rate-limit.js).
 */
const VENTANA = 4;

/**
 * Ventana usada SOLO para explicarle a la persona por que no entro - nunca para
 * dejarla pasar. "Codigo invalido" a secas no le sirve a nadie: no distingue
 * entre que el codigo vencio, que esta mirando la cuenta equivocada de su app, o
 * que tiene el reloj del celular corrido, y cada una se resuelve distinto.
 *
 * Si el codigo matchea acá pero no en VENTANA, es de la cuenta correcta: lo unico
 * que pasa es que la hora no da. Si no matchea ni acá, el codigo no sale de esta
 * cuenta (otra entrada en la app, o mal tipeado).
 *
 * No filtra nada: para que un codigo matchee en esta ventana hay que tener el
 * secreto, y quien lo tiene puede generar directamente el codigo del momento.
 */
const VENTANA_DIAGNOSTICO = 20; // +-10 minutos

function validarCodigo(secret, code, ventana = VENTANA) {
  const totp = buildTotp("", secret);
  // Devuelve el "periodo" (delta) que matcheo, o null si el codigo es invalido.
  return totp.validate({ token: String(code).replace(/\s+/g, ""), window: ventana });
}

/**
 * El texto que ve la persona cuando el codigo no entra. Cada motivo se resuelve
 * de una forma distinta, asi que cada uno dice que hacer: "Codigo invalido" a
 * secas dejaba a alguien reintentando lo mismo diez veces sin saber que estaba
 * mirando la cuenta equivocada de su app, o que el numero ya habia vencido.
 */
const MENSAJES = {
  codigo_vencido:
    "Ese código ya venció. Abrí tu app de autenticación, fijate el número que te muestra ahora y escribí ese.",
  reloj_adelantado:
    "La hora de tu celular está adelantada y por eso el código no coincide. Entrá a Ajustes → Fecha y hora, activá la hora automática, y probá de nuevo.",
  codigo_de_otra_cuenta:
    "Ese código no es de esta cuenta. Si en tu app de autenticación tenés más de una cuenta \"VDV Suite\", estás mirando la equivocada: borrá las que no uses y dejá una sola.",
  codigo_reutilizado:
    "Ese código ya lo usaste. Esperá a que tu app te muestre el siguiente y escribí ese.",
  no_configurado:
    "Esta cuenta todavía no tiene la verificación en dos pasos configurada. Volvé a escribir tu correo para empezar de nuevo.",
};

export function mensajeDeRechazo(reason) {
  return MENSAJES[reason] ?? "El código no es correcto. Fijate el número que te muestra tu app de autenticación y escribí ese.";
}

/** Por que fallo, para poder decirselo en criollo. Ver VENTANA_DIAGNOSTICO. */
function motivoDelRechazo(secret, code) {
  const delta = validarCodigo(secret, code, VENTANA_DIAGNOSTICO);
  if (delta === null) return "codigo_de_otra_cuenta";
  // delta negativo: el codigo es de un periodo anterior al actual (tardo en
  // escribirlo, o su reloj esta atrasado). Positivo: su reloj esta adelantado,
  // porque su app ya le esta mostrando codigos que todavia no llegaron.
  return delta > 0 ? "reloj_adelantado" : "codigo_vencido";
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
  if (delta === null) return { ok: false, reason: motivoDelRechazo(datos.secret, code) };

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
  if (delta === null) return { ok: false, reason: motivoDelRechazo(datos.secret, code) };

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
