"use client";

/**
 * Achica una foto antes de subirla.
 *
 * Una foto de telefono son 3-5 MB y lo que se mira es "que equipo es y como
 * esta": 1600 px de lado largo sobra. En obra se sube con datos moviles, asi
 * que la diferencia entre 4 MB y 300 KB es que la foto entre o no entre.
 *
 * Vivia adentro de FotosHerramienta.jsx; se saco aca cuando la devolucion de
 * arriendos empezo a subir fotos tambien, para no tener dos copias que se
 * separen con el tiempo.
 */

const LADO_MAX = 1600;
const CALIDAD = 0.82;

export async function comprimir(archivo) {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size < 1_000_000) return archivo;

    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (error) {
    // Un navegador sin createImageBitmap, o un formato que no sabe abrir: se
    // sube el original. Mejor pesada que no subirla.
    console.error("[imagenes] No se pudo achicar la foto:", error);
    return archivo;
  }
}
