/**
 * Comprueba quien ve que cosa en Arriendos, llamando a las funciones del
 * servidor directamente. No toca monday ni la base.
 *
 *   npm run probar-permisos-arriendo
 *
 * Lo que importa de verdad aca es el ultimo bloque: esconder la columna del
 * total NO alcanza, porque el acumulado se calcula desde el precio de cada item.
 * Si los subelementos llegan con su precio, la pantalla rehace el total que se
 * acaba de esconder y el recorte es decorativo.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Va antes de importar el modulo del servidor, y por eso esos imports son
// dinamicos: los estaticos se resuelven todos juntos antes de correr esta linea.
// Mismo molde que scripts/probar-permisos-herramientas.mjs.
register("./alias-loader.mjs", pathToFileURL(import.meta.filename));

const {
  quitarColumnasRestringidas,
  filtrarPorObrasPermitidas,
  requireGestionArriendos,
  verificarAccesoUpload,
} = await import("../lib/server/board-access-policy.js");
const { resolveColumnId } = await import("../lib/board-schemas.js");

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };

const sesion = (appRol, extra = {}) => ({
  uid: 1,
  email: "x@vdv.cl",
  asignaciones: [{ app: "herramientas", appRol, ...extra }],
});

const ROLES = {
  administrador: sesion("administrador"),
  oficinaTecnica: sesion("oficina_tecnica"),
  bodeguero: sesion("bodeguero"),
  jefeDeObra: sesion("jefe_obra"),
  jefeDeObraM388: sesion("jefe_obra", { appConfig: { restrictObras: true, obras: ["M388"] } }),
  otraApp: { uid: 2, email: "y@vdv.cl", asignaciones: [{ app: "vale-express", appRol: "super_admin" }] },
};

/** Un arriendo como lo devuelve la API, con sus items adentro. */
const arriendoDeMuestra = () => ({
  id: "1",
  name: "Andamio torre",
  obra: "M388",
  tarifaUnitaria: 187537,
  costoEstimadoAcumulado: 497171,
  costoDiarioEstimado: 0,
  cantidadInicial: 26,
  subitems: [
    { id: "s1", name: "Andamio torre", cantidad: 1, precioUnitario: 6777, precioTarifa: 6777, costoAcumulado: 20331 },
    { id: "s2", name: "Test", cantidad: 10, precioUnitario: 6544, precioTarifa: 6544, costoAcumulado: 130880 },
  ],
});

console.log("\n1. QUIEN VE LA PLATA DEL ARRIENDO");
for (const [nombre, ses, deberiaVer] of [
  ["administrador", ROLES.administrador, true],
  ["oficina tecnica", ROLES.oficinaTecnica, true],
  ["bodeguero", ROLES.bodeguero, true],
  ["jefe de obra", ROLES.jefeDeObra, false],
]) {
  const [r] = quitarColumnasRestringidas(ses, "ControlArriendosBoard", [arriendoDeMuestra()]);
  const ve = "costoEstimadoAcumulado" in r;
  if (ve === deberiaVer) ok(`${nombre} ${deberiaVer ? "ve" : "NO ve"} el acumulado`);
  else falla(`${nombre}`, `deberia ${deberiaVer ? "ver" : "no ver"} el acumulado`);
}

console.log("\n2. LA TARIFA, QUE ES DE DONDE SALE LA CUENTA");
{
  const [r] = quitarColumnasRestringidas(ROLES.jefeDeObra, "ControlArriendosBoard", [arriendoDeMuestra()]);
  if (!("tarifaUnitaria" in r)) ok("al jefe de obra no le llega la tarifa unitaria");
  else falla("tarifa unitaria", "le llego, puede recalcular el total");
  if (!("costoDiarioEstimado" in r)) ok("tampoco el costo diario");
  else falla("costo diario", "le llego");
}

console.log("\n3. LOS SUBELEMENTOS — el agujero que hay que tapar");
{
  const [r] = quitarColumnasRestringidas(ROLES.jefeDeObra, "ControlArriendosBoard", [arriendoDeMuestra()]);
  const conPrecio = (r.subitems ?? []).filter((s) => "precioUnitario" in s || "precioTarifa" in s);
  if (conPrecio.length === 0) ok("ningun item le llega con precio");
  else falla("precio en los items", `${conPrecio.length} de ${r.subitems.length} items llegaron con precio`);

  const conAcumulado = (r.subitems ?? []).filter((s) => "costoAcumulado" in s);
  if (conAcumulado.length === 0) ok("ningun item le llega con su acumulado");
  else falla("acumulado en los items", `${conAcumulado.length} items`);

  // La cantidad SI tiene que llegar: sin ella no se puede mostrar cuantas
  // unidades siguen en obra, que es dato de operacion y no de plata.
  const sinCantidad = (r.subitems ?? []).filter((s) => !("cantidad" in s));
  if (sinCantidad.length === 0) ok("la cantidad si le llega (no es un dato de plata)");
  else falla("cantidad", "se recorto de mas");
}

console.log("\n4. EL ADMINISTRADOR NO PIERDE NADA");
{
  const [r] = quitarColumnasRestringidas(ROLES.administrador, "ControlArriendosBoard", [arriendoDeMuestra()]);
  const completo =
    "costoEstimadoAcumulado" in r &&
    "tarifaUnitaria" in r &&
    r.subitems.every((s) => "precioUnitario" in s && "costoAcumulado" in s);
  if (completo) ok("le llega todo, encabezado e items");
  else falla("administrador", "le falta alguna columna");
}

console.log("\n5. EL RECORTE POR OBRA");
{
  const items = [
    { id: "1", name: "a", obra: "M388" },
    { id: "2", name: "b", obra: "SELMAN" },
  ];
  const paraJefe = filtrarPorObrasPermitidas(ROLES.jefeDeObraM388, "ControlArriendosBoard", items);
  if (paraJefe.length === 1 && paraJefe[0].obra === "M388") ok("el jefe de obra de M388 ve solo M388");
  else falla("recorte por obra", `le quedaron ${paraJefe.length}: ${paraJefe.map((i) => i.obra).join(", ")}`);

  const paraAdmin = filtrarPorObrasPermitidas(ROLES.administrador, "ControlArriendosBoard", items);
  if (paraAdmin.length === 2) ok("el administrador ve las dos obras");
  else falla("administrador por obra", `le quedaron ${paraAdmin.length}`);

  // El bodeguero ve toda la empresa aunque tenga obras asignadas: pedido
  // explicito del cliente, para pedir prestado en vez de arrendar.
  const bodegueroM388 = sesion("bodeguero", { appConfig: { restrictObras: true, obras: ["M388"] } });
  const paraBodeguero = filtrarPorObrasPermitidas(bodegueroM388, "ControlArriendosBoard", items);
  if (paraBodeguero.length === 2) ok("el bodeguero ve toda la empresa");
  else falla("bodeguero", `le quedaron ${paraBodeguero.length}, deberia ver las 2`);
}

console.log("\n6. QUIEN PUEDE DAR DE ALTA Y DEVOLVER");
for (const [nombre, ses, puede] of [
  ["administrador", ROLES.administrador, true],
  ["bodeguero", ROLES.bodeguero, true],
  ["oficina tecnica", ROLES.oficinaTecnica, false],
  ["jefe de obra", ROLES.jefeDeObra, false],
  ["otra app", ROLES.otraApp, false],
]) {
  let dejo = true;
  try { requireGestionArriendos(ses); } catch { dejo = false; }
  if (dejo === puede) ok(`${nombre} ${puede ? "puede" : "NO puede"} gestionar arriendos`);
  else falla(nombre, `deberia ${puede ? "poder" : "no poder"}`);
}

console.log("\n7. LAS FOTOS");
{
  const guia = resolveColumnId("ControlArriendosBoard", "guiaIngreso");
  const devolucion = resolveColumnId("ControlArriendosItemsBoard", "fotoDevolucion");

  let dejo = true;
  try { verificarAccesoUpload(ROLES.bodeguero, "ControlArriendosBoard", { columnId: guia }); } catch { dejo = false; }
  if (dejo) ok("el bodeguero puede subir la guia de ingreso");
  else falla("subir guia", "lo rechazo");

  dejo = true;
  try { verificarAccesoUpload(ROLES.jefeDeObra, "ControlArriendosBoard", { columnId: guia }); } catch { dejo = false; }
  if (!dejo) ok("el jefe de obra NO puede subir la guia");
  else falla("subir guia (jefe de obra)", "lo dejo");

  dejo = true;
  try { verificarAccesoUpload(ROLES.bodeguero, "ControlArriendosItemsBoard", { columnId: devolucion }); } catch { dejo = false; }
  if (dejo) ok("el bodeguero puede subir la foto de devolucion de un item");
  else falla("foto de devolucion", "lo rechazo");

  // Una columna que no es de archivos no se puede usar para subir nada.
  dejo = true;
  try {
    verificarAccesoUpload(ROLES.administrador, "ControlArriendosBoard", {
      columnId: resolveColumnId("ControlArriendosBoard", "observaciones"),
    });
  } catch { dejo = false; }
  if (!dejo) ok("no se puede subir a una columna que no es de archivos");
  else falla("columna indebida", "lo dejo");
}

console.log("\n8. LA ALERTA EN MIS PENDIENTES");
{
  const { pendientesDeArriendos } = await import("../lib/pendientes.js");

  // La sesion de la bandeja es la de Herramientas (hr_session), que guarda el
  // rol como `role` y no como `appRol`.
  const hr = (role, extra = {}) => ({ role, obras: [], restrictObras: false, ...extra });

  const arriendo = (id, obra, { vencido = false, dias = 3 } = {}) => ({
    id,
    name: `Andamio ${id}`,
    codigoArriendo: `ARR-000${id}`,
    obra,
    resumen: { cerrado: false, permanencia: dias, confiable: true, conIva: 100000 },
    alertas: vencido ? [{ nivel: "vencido" }] : [],
  });

  const datos = [
    arriendo(1, "M388", { vencido: true }),
    arriendo(2, "SELMAN", { dias: 20 }),
    arriendo(3, "M388", { dias: 2 }),
    { ...arriendo(4, "M388", { vencido: true }), resumen: { cerrado: true, permanencia: 30, confiable: true, conIva: 0 } },
  ];

  const admin = pendientesDeArriendos(datos, hr("administrador"));
  if (admin.length === 2) ok("al administrador le aparecen los 2 que hay que devolver");
  else falla("administrador", `le aparecieron ${admin.length}: ${admin.map((x) => x.clave).join(", ")}`);

  if (!admin.some((x) => x.clave === "arriendo:3")) ok("el que lleva 2 dias NO aparece");
  else falla("arriendo de 2 dias", "aparecio y no deberia");

  if (!admin.some((x) => x.clave === "arriendo:4")) ok("el ya devuelto NO aparece");
  else falla("arriendo cerrado", "aparecio y no deberia");

  const vencido = admin.find((x) => x.clave === "arriendo:1");
  // `observado` tiene que ser false: en esta bandeja significa "esperando al
  // proveedor", y con true los vencidos caian bajo "ya los revisaste" y no
  // contaban en "para hacer ahora". Se verifica que SI entren ahi.
  const { paraHacerAhora } = await import("../lib/pendientes.js");
  if (paraHacerAhora(admin).length === 2) ok("los 2 cuentan como 'para hacer ahora'");
  else falla("para hacer ahora", `conto ${paraHacerAhora(admin).length} de 2`);
  if (vencido?.observado === false) ok("ninguno queda como 'esperando al proveedor'");
  else falla("el vencido", "quedo marcado como observado y no corresponde");
  if (/fecha de fin pactada/i.test(vencido?.motivo ?? "")) ok("y explica por que");
  else falla("el motivo del vencido", `dice "${vencido?.motivo}"`);

  const demorado = admin.find((x) => x.clave === "arriendo:2");
  if (/20 d/.test(demorado?.motivo ?? "")) ok("el demorado dice cuantos dias lleva");
  else falla("el motivo del demorado", `dice "${demorado?.motivo}"`);

  const tecnica = pendientesDeArriendos(datos, hr("oficina_tecnica"));
  if (tecnica.length === 2) ok("oficina tecnica ve los mismos 2");
  else falla("oficina tecnica", `vio ${tecnica.length}`);

  // El bodeguero ve toda la empresa en el INVENTARIO, pero la alerta se le
  // acota a sus obras: con el otro criterio la bandeja se le vuelve ruido.
  const bodeguero = pendientesDeArriendos(datos, hr("bodeguero", { obras: ["M388"], restrictObras: true }));
  if (bodeguero.length === 1 && bodeguero[0].obra === "M388") {
    ok("al bodeguero de M388 solo le aparece el de M388");
  } else {
    falla("bodeguero por obra", `le aparecieron ${bodeguero.length}: ${bodeguero.map((x) => x.obra).join(", ")}`);
  }

  const bodegueroTodo = pendientesDeArriendos(datos, hr("bodeguero"));
  if (bodegueroTodo.length === 2) ok("un bodeguero sin obras acotadas ve los 2");
  else falla("bodeguero sin restriccion", `vio ${bodegueroTodo.length}`);

  const jefe = pendientesDeArriendos(datos, hr("jefe_obra", { obras: ["M388"], restrictObras: true }));
  if (jefe.length === 0) ok("al jefe de obra NO le aparece ninguno (no puede devolver)");
  else falla("jefe de obra", `le aparecieron ${jefe.length}`);

  const sinApp = pendientesDeArriendos(datos, null);
  if (sinApp.length === 0) ok("sin sesion de Herramientas, ninguno");
  else falla("sin sesion", `le aparecieron ${sinApp.length}`);
}
console.log("\n====================================================");
console.log(`>>> ${bien} bien, ${mal} ${mal === 1 ? "falla" : "fallas"}`);
process.exit(mal ? 1 : 0);
