"use client";

/**
 * Estado en el navegador de la Capa 3 (2FA). El token de sesion MFA (corta
 * duracion, ~12hs) vive solo en memoria + sessionStorage; el de "dispositivo de
 * confianza" (30 dias, para no pedir el codigo todos los dias) vive en
 * localStorage. Ninguno de los dos reemplaza al sessionToken de monday (Capa 1) -
 * son un header adicional (ver lib/monday-auth.js authHeader()).
 */

const MFA_SESSION_KEY = "vdv_mfa_session";
const TRUSTED_DEVICE_KEY = "vdv_trusted_device";

let mfaSessionToken = null;

export function getMfaSessionToken() {
  if (mfaSessionToken) return mfaSessionToken;
  if (typeof window === "undefined") return null;
  mfaSessionToken = window.sessionStorage.getItem(MFA_SESSION_KEY);
  return mfaSessionToken;
}

export function setMfaSessionToken(token) {
  mfaSessionToken = token;
  if (typeof window !== "undefined") window.sessionStorage.setItem(MFA_SESSION_KEY, token);
}

export function getTrustedDeviceToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TRUSTED_DEVICE_KEY);
}

export function setTrustedDeviceToken(token) {
  if (typeof window !== "undefined") window.localStorage.setItem(TRUSTED_DEVICE_KEY, token);
}

export function clearAuthState() {
  mfaSessionToken = null;
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MFA_SESSION_KEY);
  window.localStorage.removeItem(TRUSTED_DEVICE_KEY);
}
