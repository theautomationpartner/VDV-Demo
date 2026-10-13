/**
 * Comprueba los avisos de SPM en "Mis Pendientes".
 *
 *   npm run probar-pendientes-spm
 *
 * Lo que de verdad hay que proteger son tres cosas:
 *
 * 1. Que una solicitud de OTRA persona no le aparezca a nadie. El cruce es por
 *    el id de la ficha de Equipo VDV, no por el nombre.
 * 2. Que un estado DE PASO recien marcado NO dispare la alerta. "Por enviar"
 *    es normal durante unos segundos; avisar ahi seria el falso positivo que
 *    hace que la gente deje de mirar la bandeja.
 * 3. Que un estado de paso VIEJO si la dispare. Es el unico caso en que Make
 *    no corrio y no dejo ningun error escrito: hoy no lo ve nadie.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-loader.mjs", pathToFileURL(import.meta.filename));

const { pendientesDeSpm, FUENTE_SPM, paraHacerAhora, ordenarPendientes } = await import(
  "../lib/pendientes.js"
);
const { verificarAccesoLectura } = await import("../lib/server/board-access-policy.js");

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comparar = (n, real, esp) =>
  String(real) === String(esp) ? ok(n) : falla(n, `esperaba ${JSON.stringify(esp)}, vino ${JSON.stringify(real)}`);

const MIA = "13070169485";
const AJENA = "13070190358";
const AHORA = Date.parse("2026-10-13T15:00:00Z");
const haceMinutos = (m) => new Date(AHORA - m * 60000).toISOString();

/** Una solicitud como la devuelve el SDK, con su vinculo al emisor. */
const solicitud = (extra = {}) => ({
  id: "900",
  name: "M388 | PINTURA",
  numero: "SPM-007",
  obra: "M388",
  envioCotizacion: "Enviado",
  comparacion: "Comparado",
  fechaEnvio: "2026-10-10",
  updatedAt: haceMinutos(60),
  emisorVdv: { linkedItems: [{ id: MIA, name: "claudio leyton" }] },
  ...extra,
});

const correr = (sols, ficha = MIA) => pendientesDeSpm(sols, ficha, { ahora: AHORA });

console.log("\nDE QUIEN ES CADA SOLICITUD\n");

comparar(
  "una solicitud sana no avisa nada",
  correr([solicitud()]).length,
  0,
);
comparar(
  "la mia fallada si avisa",
  correr([solicitud({ envioCotizacion: "Error envío" })]).length,
  1,
);
comparar(
  "la de OTRA persona no me aparece",
  correr([solicitud({ envioCotizacion: "Error envío", emisorVdv: { linkedItems: [{ id: AJENA }] } })]).length,
  0,
);
comparar(
  "una sin emisor no le aparece a nadie",
  correr([solicitud({ envioCotizacion: "Error envío", emisorVdv: null })]).length,
  0,
);
comparar(
  "sin mi ficha no se muestra nada",
  pendientesDeSpm([solicitud({ envioCotizacion: "Error envío" })], null, { ahora: AHORA }).length,
  0,
);
comparar("sin solicitudes, nada", correr([]).length, 0);
comparar("con undefined, nada", correr(undefined).length, 0);

console.log("\nLO QUE MAKE ESCRIBE COMO ERROR\n");

for (const [columna, estado, accion] of [
  ["envioCotizacion", "Error envío", "El envío falló"],
  ["comparacion", "Error comparación", "La comparación falló"],
]) {
  const [f] = correr([solicitud({ [columna]: estado })]);
  comparar(`"${estado}" avisa`, f?.accion, accion);
}

console.log("\nLO QUE MAKE NO ESCRIBE: EL SILENCIO\n");

/**
 * El caso que hoy no ve nadie. Make toma "Por enviar" por webhook y lo cambia
 * en segundos; si se queda ahi es que no corrio, y no deja ningun error.
 */
comparar(
  "recien marcada 'Por enviar' NO avisa (es normal)",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: haceMinutos(2) })]).length,
  0,
);
comparar(
  "a los 9 minutos tampoco",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: haceMinutos(9) })]).length,
  0,
);
comparar(
  "a los 11 minutos SI avisa",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: haceMinutos(11) })])[0]?.accion,
  "Quedó sin enviar",
);
comparar(
  "'Comparando' colgada tambien avisa",
  correr([solicitud({ comparacion: "Comparando", updatedAt: haceMinutos(30) })])[0]?.accion,
  "Quedó comparando",
);

/**
 * Sin `updatedAt` no se puede saber hace cuanto esta ahi. Suponer que esta rota
 * es inventar: mejor no avisar que avisar mal.
 */
comparar(
  "sin updatedAt no se inventa una alerta",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: null })]).length,
  0,
);
comparar(
  "con un updatedAt roto, tampoco",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: "ayer" })]).length,
  0,
);
comparar(
  "updatedAt como Date tambien sirve",
  correr([solicitud({ envioCotizacion: "Por enviar", updatedAt: new Date(AHORA - 20 * 60000) })]).length,
  1,
);

console.log("\nUNA FILA POR SOLICITUD\n");

comparar(
  "si fallan las dos columnas, avisa una sola vez",
  correr([solicitud({ envioCotizacion: "Error envío", comparacion: "Error comparación" })]).length,
  1,
);
comparar(
  "y gana el envio, que es la causa",
  correr([solicitud({ envioCotizacion: "Error envío", comparacion: "Error comparación" })])[0].accion,
  "El envío falló",
);

const tres = correr([
  solicitud({ id: "1", envioCotizacion: "Error envío" }),
  solicitud({ id: "2", comparacion: "Error comparación" }),
  solicitud({ id: "3", envioCotizacion: "Por enviar", updatedAt: haceMinutos(45) }),
]);
comparar("tres solicitudes rotas, tres filas", tres.length, 3);
comparar("con claves distintas", new Set(tres.map((f) => f.clave)).size, 3);

console.log("\nCOMO SE VE LA FILA\n");

const [fila] = correr([solicitud({ envioCotizacion: "Error envío" })]);
comparar("la fuente la identifica", fila.fuente, FUENTE_SPM);
comparar("el titulo lleva el numero", fila.titulo, "SPM-007 — M388 | PINTURA");
comparar("la obra", fila.obra, "M388");
comparar("esta habilitada", fila.habilitado, true);
comparar("no es una observacion", fila.observado, false);
comparar("no muestra plata", fila.monto, 0);
fila.href.includes("monday.com") && fila.href.includes("900")
  ? ok("el link lleva al item de monday, donde esta la nota con el motivo")
  : falla("el link", fila.href);

const [sinNumero] = correr([solicitud({ numero: "", envioCotizacion: "Error envío" })]);
comparar("sin numero, titulo entendible", sinNumero.titulo, "Solicitud sin número — M388 | PINTURA");

console.log("\nSE MEZCLA BIEN CON EL RESTO DE LA BANDEJA\n");

const otros = [
  { clave: "c:1", titulo: "Contrato", habilitado: true, observado: false, dias: 90 },
  { clave: "c:2", titulo: "Bloqueado", habilitado: false, observado: false, dias: 300 },
];
const todo = ordenarPendientes([...otros, ...correr([solicitud({ envioCotizacion: "Error envío" })])]);
comparar("lo bloqueado queda abajo", todo.at(-1).clave, "c:2");
comparar("cuenta para 'hacer ahora'", paraHacerAhora(todo).some((i) => i.fuente === FUENTE_SPM), true);

console.log("\nQUIEN PUEDE LEER EL TABLERO\n");

/**
 * El tablero trae el cuadro comparativo: que proveedores cotizaron y a que
 * precio. `board-access-policy` deja pasar por defecto cualquier tablero que
 * no este en una lista, asi que sin una regla propia SPM quedaba abierto a
 * cualquier sesion valida, subcontratistas del Portal incluidos.
 *
 * Desde que SPM es una app aparte el piso es TENERLA: tener otra app de VDV ya
 * no alcanza. Esta comprobado al reves a proposito -que el Generador de OC y
 * Herramientas NO entren-, porque es el cambio que hay que notar si alguien
 * aflojara la regla sin querer.
 */
const sesionCon = (...apps) => ({
  uid: 1,
  email: "x@vdv.cl",
  asignaciones: apps.map((app) => ({ app, appRol: "admin" })),
});
const dejaLeer = (sesion) => {
  try {
    verificarAccesoLectura(sesion, "SpmVdvBoard");
    return true;
  } catch {
    return false;
  }
};

comparar("quien tiene la app SPM lee", dejaLeer(sesionCon("spm")), true);
comparar("tener el Generador de OC NO alcanza", dejaLeer(sesionCon("generador-oc")), false);
comparar("tener Herramientas tampoco", dejaLeer(sesionCon("herramientas")), false);
comparar("un SUBCONTRATISTA (solo Portal) menos", dejaLeer(sesionCon("portal-proveedor")), false);
comparar("sin ninguna app, NO", dejaLeer(sesionCon()), false);
comparar("una sesion vacia, NO", dejaLeer({}), false);
comparar("SPM + otras apps si lee", dejaLeer(sesionCon("portal-proveedor", "spm")), true);

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
