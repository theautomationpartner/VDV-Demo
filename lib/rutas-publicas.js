/**
 * Las rutas que se pueden abrir SIN sesion de VDV Suite.
 *
 * Hoy hay una sola: la validacion de una Orden de Compra. Es la pagina a la que
 * apunta el QR impreso en cada OC, y quien la escanea es el proveedor - que no
 * tiene ni tiene por que tener cuenta en la app. Si estuviera detras del login,
 * el QR seria inservible, que es exactamente lo que nos paso con los contratos
 * (las URLs de archivo de monday llevaban a la pantalla de login).
 *
 * Agregar algo aca es abrirlo a internet: pensarlo dos veces.
 */
const RUTAS_PUBLICAS = ["/validar"];

export function esRutaPublica(pathname) {
  if (!pathname) return false;
  return RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}
