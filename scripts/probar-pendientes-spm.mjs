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
const dejaLeer = (sesion, board = "SpmVdvBoard") => {
  try {
    verificarAccesoLectura(sesion, board);
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

/**
 * Y LAS COTIZACIONES CON LA MISMA LLAVE. Esto faltaba y estaba abierto: la
 * regla cubria la solicitud -lo que se PIDE- y dejaba pasar las respuestas -lo
 * que CONTESTARON-, que es donde esta el precio de cada proveedor por obra. Un
 * subcontratista del Portal se las bajaba enteras por /api/monday/board.
 */
for (const board of ["CotizacionesSpmBoard", "CotizacionesSpmItemsBoard"]) {
  comparar(`${board}: con SPM lee`, dejaLeer(sesionCon("spm"), board), true);
  comparar(`${board}: un SUBCONTRATISTA no`, dejaLeer(sesionCon("portal-proveedor"), board), false);
  comparar(`${board}: el Generador de OC tampoco`, dejaLeer(sesionCon("generador-oc"), board), false);
}

/**
 * Y al reves: el maestro de proveedores TIENE que poder leerlo una sesion de
 * SPM. Lo necesitan el buscador del alta y el Maestro de Proveedores, y estaba
 * reservado al Portal y al Generador. El alta no fallaba a la vista -deja
 * cargar un proveedor "ocasional" a mano-, asi que el error se veia como un
 * buscador que no encuentra nada.
 */
comparar("el maestro de proveedores lo lee SPM", dejaLeer(sesionCon("spm"), "ProveedoresBoard"), true);
comparar(
  "pero no cualquiera: Herramientas no",
  dejaLeer(sesionCon("herramientas"), "ProveedoresBoard"),
  false,
);

console.log("\nQUE PUEDE HACER CADA ROL\n");

/**
 * Los tres roles contra los tres permisos, del lado del SERVIDOR.
 *
 * Se prueba aca y no en el navegador a proposito: las pantallas esconden los
 * botones que no corresponden, pero esconder un boton no es un permiso -las
 * rutas se pueden llamar a mano-. Lo que vale es esto.
 *
 * El que de verdad importa es `enviar`: es el unico permiso de la suite que
 * manda correos a gente de afuera, desde una casilla de VDV, y no se puede
 * deshacer. Si alguna vez un solicitante pasa a poder enviar, tiene que ser
 * porque alguien lo decidio, no porque se filtro sin que nadie lo note.
 */
const { requireCrearSpm, requireEnviarSpm, requireDecidirSpm } = await import(
  "../lib/server/board-access-policy.js"
);
const { SPM_ROLES, porQueNoPuedeEnviar } = await import("../lib/spm-roles.js");

const conRol = (appRol) => ({ uid: 1, email: "x@vdv.cl", asignaciones: [{ app: "spm", appRol }] });
const deja = (guardia, appRol) => {
  try {
    guardia(conRol(appRol));
    return true;
  } catch {
    return false;
  }
};

const ESPERADO = {
  solicitante: { crear: true, enviar: false, decidir: false },
  comprador: { crear: true, enviar: true, decidir: true },
  consulta: { crear: false, enviar: false, decidir: false },
  // Los legado, que caen en comprador para no sacarle permisos a nadie de golpe.
  usuario: { crear: true, enviar: true, decidir: true },
  super_admin: { crear: true, enviar: true, decidir: true },
  admin: { crear: true, enviar: true, decidir: true },
  // Y lo que no es ningun rol no puede nada, aunque tenga la app asignada.
  cualquier_cosa: { crear: false, enviar: false, decidir: false },
};

for (const [rol, puede] of Object.entries(ESPERADO)) {
  comparar(`${rol}: crear`, deja(requireCrearSpm, rol), puede.crear);
  comparar(`${rol}: MANDAR A COTIZAR`, deja(requireEnviarSpm, rol), puede.enviar);
  comparar(`${rol}: decidir la ganadora`, deja(requireDecidirSpm, rol), puede.decidir);
}

comparar("son tres roles y no uno", SPM_ROLES.length, 3);
comparar("al comprador no se le explica nada, porque puede", porQueNoPuedeEnviar("comprador"), null);
(porQueNoPuedeEnviar("solicitante") ?? "").includes("quien compra")
  ? ok("al solicitante se le dice a quien avisarle")
  : falla("el motivo del solicitante", porQueNoPuedeEnviar("solicitante"));

// Sin la app, ningun rol sirve: el piso sigue siendo tenerla.
const sinApp = { uid: 1, email: "x@vdv.cl", asignaciones: [{ app: "generador-oc", appRol: "comprador" }] };
for (const [nombre, guardia] of [
  ["crear", requireCrearSpm],
  ["enviar", requireEnviarSpm],
  ["decidir", requireDecidirSpm],
]) {
  let paso = false;
  try {
    guardia(sinApp);
    paso = true;
  } catch {
    /* esperado */
  }
  comparar(`un "comprador" de OTRA app no puede ${nombre}`, paso, false);
}

console.log("\nCUAL ES LA MAS BARATA\n");

/**
 * El cartel de "menor precio" es lo primero que se mira en la pantalla de
 * cotizaciones, y es lo mas facil de arruinar: un total puede ser el mas bajo
 * porque al proveedor le FALTA cotizar la mitad del pedido. La app del cliente
 * compara totales a secas y en esa situacion recomienda lo que no alcanza.
 *
 * Por eso lo que se prueba aca no es cual es el numero menor -eso es un
 * `reduce`- sino CUANDO se puede decir que es el menor.
 */
const { masBarata, formatearFecha, ESTADO, HOMOLOGACION } = await import(
  "../lib/spm/cotizaciones.js"
);

const oferta = (id, precio, lineas = 3, extra = {}) => ({
  id,
  precioTotal: precio,
  moneda: "CLP",
  estado: ESTADO.RECIBIDA,
  subitems: Array.from({ length: lineas }, () => ({ homologacion: HOMOLOGACION.EXACTO })),
  ...extra,
});

comparar("con una sola oferta no hay 'la mas barata'", masBarata([oferta("1", 1000)]), null);
comparar("sin ninguna, tampoco", masBarata([]), null);
comparar("con undefined, tampoco", masBarata(undefined), null);

const dos = masBarata([oferta("1", 1000), oferta("2", 800)]);
comparar("entre dos, gana la de menor total", dos?.id, "2");
comparar("y se puede comparar: cotizaron las mismas lineas", dos?.comparable, true);

/** El caso que importa: la mas barata cotizo MENOS. */
const desparejo = masBarata([oferta("1", 1000, 3), oferta("2", 400, 1)]);
comparar("si una cotizo menos lineas, igual se dice cual es la menor", desparejo?.id, "2");
comparar("PERO se avisa que no se puede comparar", desparejo?.comparable, false);

/** Las lineas "No solicitado" son cosas que el proveedor agrego de onda: no cuentan. */
const conRegalo = masBarata([
  oferta("1", 1000, 3),
  oferta("2", 900, 3, {
    subitems: [
      { homologacion: HOMOLOGACION.EXACTO },
      { homologacion: HOMOLOGACION.EXACTO },
      { homologacion: HOMOLOGACION.EXACTO },
      { homologacion: HOMOLOGACION.NO_SOLICITADO },
    ],
  }),
]);
comparar("lo que el proveedor sumo de mas no rompe la comparacion", conRegalo?.comparable, true);

/** Las que ya salieron de carrera no deberian ganar un cartel de "la mas barata". */
const conDescartada = masBarata([
  oferta("1", 1000),
  oferta("2", 300, 3, { estado: ESTADO.DESCARTADA }),
]);
comparar("una DESCARTADA no cuenta", conDescartada, null);
const conVencida = masBarata([
  oferta("1", 1000),
  oferta("2", 300, 3, { estado: ESTADO.VENCIDA }),
  oferta("3", 900),
]);
comparar("una VENCIDA tampoco", conVencida?.id, "3");

/** Sin precio no hay nada que comparar: un 0 no es la oferta mas barata. */
comparar("un total en 0 no gana", masBarata([oferta("1", 0), oferta("2", 500)]), null);

console.log("\nLA FECHA\n");
comparar("se lee como en Chile", formatearFecha("2026-09-26"), "26-09-2026");
comparar("una fecha vacia no inventa nada", formatearFecha(""), null);
comparar("una fecha rota tampoco", formatearFecha("ayer"), null);

console.log("\nEL DESPERTADOR DE LA COMPARACION\n");

/**
 * Reemplaza al escenario 3b de Make. Lo que hay que cuidar no es a quien
 * despierta -eso es una resta de fechas- sino a quien NO:
 *
 * 1. Una solicitud que ya dice "Por comparar" NO se vuelve a escribir. Make
 *    mira el CAMBIO de esa columna, asi que reescribirla dispara una
 *    comparacion nueva que pisa la recomendacion que ya estaba.
 * 2. Una recien enviada no se apura.
 * 3. Una sin fecha de envio no se inventa.
 */
const { aDespertar } = await import("../lib/server/spm-despertador.js");

const AHORA_D = Date.parse("2026-10-13T15:00:00Z");
const haceDias = (n) => {
  const d = new Date(AHORA_D - n * 86400000);
  return d.toISOString().slice(0, 10);
};

const sol = (extra = {}) => ({
  id: "1",
  numero: "SPM-007",
  envioCotizacion: "Enviado",
  comparacion: "Pendiente",
  fechaEnvio: haceDias(3),
  ...extra,
});

const despierta = (s2) => aDespertar([s2], { ahora: AHORA_D }).length;

comparar("una enviada hace 3 días se despierta", despierta(sol()), 1);
comparar("con la comparación vacía también", despierta(sol({ comparacion: "" })), 1);
comparar("y con null también", despierta(sol({ comparacion: null })), 1);

comparar("enviada HOY no se apura", despierta(sol({ fechaEnvio: haceDias(0) })), 0);
comparar("enviada ayer sí", despierta(sol({ fechaEnvio: haceDias(1) })), 1);

comparar("un BORRADOR no se toca", despierta(sol({ envioCotizacion: "Borrador" })), 0);
comparar("una que está saliendo tampoco", despierta(sol({ envioCotizacion: "Por enviar" })), 0);
comparar("una con error de envío tampoco", despierta(sol({ envioCotizacion: "Error envío" })), 0);

/** El que importa: no volver a disparar una comparacion que ya se pidio. */
comparar("una que YA dice 'Por comparar' no se vuelve a escribir", despierta(sol({ comparacion: "Por comparar" })), 0);
comparar("una que se está comparando tampoco", despierta(sol({ comparacion: "Comparando" })), 0);
comparar("una YA COMPARADA tampoco: pisaría la recomendación", despierta(sol({ comparacion: "Comparado" })), 0);
comparar("una con error de comparación tampoco: se arregla a mano", despierta(sol({ comparacion: "Error comparación" })), 0);

comparar("sin fecha de envío no se inventa", despierta(sol({ fechaEnvio: null })), 0);
comparar("con una fecha rota, tampoco", despierta(sol({ fechaEnvio: "ayer" })), 0);

comparar("sin solicitudes, nada", aDespertar([], { ahora: AHORA_D }).length, 0);
comparar("con undefined, nada", aDespertar(undefined, { ahora: AHORA_D }).length, 0);

const varias = aDespertar(
  [
    sol({ id: "a", fechaEnvio: haceDias(5) }),
    sol({ id: "b", fechaEnvio: haceDias(0) }),
    sol({ id: "c", fechaEnvio: haceDias(2), comparacion: "Comparado" }),
    sol({ id: "d", fechaEnvio: haceDias(9) }),
  ],
  { ahora: AHORA_D },
);
comparar("de cuatro, despierta las dos que corresponde", varias.length, 2);
comparar("y son las correctas", varias.map((x) => x.id).join(","), "a,d");

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
