/**
 * Crea las vistas de los tableros de Herramientas, Arriendos y Solicitudes
 * de Material (SPM).
 *
 *   node scripts/vistas-monday.mjs            (muestra que haria)
 *   node scripts/vistas-monday.mjs --aplicar  (lo hace)
 *
 * POR QUE UNA VISTA Y NO REORDENAR EL TABLERO
 *
 * El orden de las columnas DEL TABLERO no se puede cambiar por API: la
 * mutacion `change_column_metadata` solo acepta `title` y `description`
 * (comprobado contra el esquema en vivo, y la documentacion dice lo mismo).
 *
 * Pero una VISTA tiene su propio orden de columnas, su propio juego de
 * columnas escondidas, su filtro y su agrupacion, y eso SI se crea por API.
 * Para lo que hace falta -que el que abre el tablero vea primero lo que
 * importa y no vea lo que no- la vista es mejor que reordenar: el tablero
 * sigue teniendo todo, y cada quien entra por la vista de su tarea.
 *
 * DOS COSAS QUE COSTARON ENCONTRAR, por si hay que tocar esto de nuevo:
 *
 *   1. Las vistas viven en la API 2025-10 en adelante. Con el 2024-10 que usa
 *      la app, `create_view` NO EXISTE y la introspeccion no la muestra.
 *   2. `create_view_table` tipa `column_order` como String y guarda lo que le
 *      mandes como UN SOLO elemento: ["name", "a,b,c"]. Para dar el orden
 *      completo hay que usar `create_view` generico, que toma `settings` como
 *      JSON crudo -y como OBJETO, no como texto: con JSON.stringify contesta
 *      "data must be object"-.
 *
 * Y una tercera: los filtros de vista comparan el INDICE NUMERICO de la
 * etiqueta, no su texto. Es al reves que `items_page`, donde el texto con
 * `contains_text` es lo que funciona. Con el texto contesta "Status column
 * values must be numeric indices".
 *
 * Es idempotente: una vista que ya existe con ese nombre se borra y se vuelve
 * a crear, asi este archivo es la unica verdad. Las vistas que no estan aca
 * -las que haya hecho el cliente a mano- no se tocan.
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

/**
 * `--solo SPM_VDV,COTIZACIONES_SPM` toca solo esos tableros.
 *
 * Hace falta porque este script BORRA Y REHACE cada vista. Para las que crea el
 * script eso es lo correcto -el archivo es la unica verdad-, pero rehacer las de
 * Herramientas cuando uno solo venia a agregar las de SPM se lleva puesto
 * cualquier retoque que el cliente le haya hecho a mano a esas vistas.
 */
const SOLO = (() => {
  const i = process.argv.indexOf("--solo");
  if (i === -1) return null;
  return new Set((process.argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean));
})();

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: de("MONDAY_API_TOKEN"),
      // Las mutaciones de vista no existen antes de 2025-10.
      "API-Version": "2026-07",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// ------------------------------------------------------------- las columnas

const MAESTRO = {
  codigo: "text_mm7687am",
  correlativo: "autonumber_mm76hmj7",
  energia: "dropdown_mm762zqy",
  responsableViejo: "multiple_person_mm76s4g",
  responsable: "board_relation_mm79270j",
  ultSalida: "date_mm76td04",
  ultDevolucion: "date_mm76kdht",
  mantenimiento: "date_mm768mat",
  fechaCompra: "date_mm761zxq",
  valorCompra: "numeric_mm769z30",
  foto: "file_mm76hyqy",
  observaciones: "long_text_mm76z4ex",
  marca: "text_mm767c06",
  modelo: "text_mm76sawx",
  serie: "text_mm762p0s",
  condicion: "color_mm76b1fq",
  estado: "color_mm76r560",
  tipoUbicacion: "color_mm765ngx",
  ubicacion: "color_mm76ncrk",
  custodio: "text_mm764j8g",
  categoria: "dropdown_mm76v0b9",
};

const MOV = {
  obra: "color_mm76vnzv",
  fecha: "date_mm76jsah",
  tipo: "color_mm76b3kk",
  alSalir: "color_mm764jg3",
  alRecibir: "color_mm76bsqh",
  observaciones: "long_text_mm76vxn5",
  evidencia: "file_mm76xqhh",
  idMaestro: "text_mm761181",
  codigo: "text_mm76997n",
  herramienta: "text_mm76cqvb",
  categoria: "text_mm76djdk",
  origen: "text_mm76s0s6",
  destino: "text_mm76mdd5",
  entrega: "text_mm76mpcy",
  recibe: "text_mm767hsg",
  responsableViejo: "multiple_person_mm7657a3",
  responsable: "board_relation_mm797mqq",
  recepcion: "color_mm7y936c",
  confirmadaPor: "text_mm7ygdnm",
  fechaConfirmacion: "date_mm7y9yrs",
};

const ARR = {
  subelementos: "subtasks_mm77c397",
  obra: "color_mm77xt1v",
  codigo: "text_mm76bm7d",
  categoria: "dropdown_mm76nbyq",
  guia: "file_mm76cp1t",
  tipoTarifa: "color_mm769xwd",
  tarifa: "numeric_mm7682b3",
  iva: "color_mm76ecnt",
  unidad: "dropdown_mm766xqg",
  inicio: "date_mm767bkr",
  fin: "date_mm766jse",
  costoAcumulado: "numeric_mm761nxf",
  costoDiario: "numeric_mm76hxtm",
  marca: "text_mm76jvfp",
  ingresoObra: "date_mm76f57n",
  custodio: "text_mm76d4tq",
  responsableViejo: "multiple_person_mm76a69w",
  responsable: "board_relation_mm79bptf",
  estado: "color_mm76rmss",
  excepcion: "color_mm76v1h4",
  motivo: "long_text_mm76vzr7",
  observaciones: "long_text_mm76pars",
  modelo: "text_mm764q1t",
  serie: "text_mm76q7hk",
  cantInicial: "numeric_mm76kbyj",
  cantActiva: "numeric_mm76jjmq",
  cantDevuelta: "numeric_mm76x7qp",
  nGuia: "text_mm76anc5",
  fechaGuia: "date_mm76c5qc",
  proveedor: "board_relation_mm76eppy",
  oc: "board_relation_mm76vaqe",
  fotoLlegada: "file_mm7c4an7",
  fotoEntrega: "file_mm7ch6m6",
};

/**
 * Los indices de las etiquetas, no su texto: es lo unico que entienden los
 * filtros de vista. Si el cliente agrega una etiqueta nueva, los indices de
 * las que ya estaban no se mueven, asi que esto no se desactualiza solo.
 */
const ESTADO_NECESITA_ATENCION = [5, 6, 7, 8]; // EN REPARACION, REQUIERE REPARACION, EXTRAVIADA, DADA DE BAJA
const RECEPCION_PENDIENTE = [1];
const ARRIENDO_ACTIVO = [1];
const EXCEPCION_SI = [2]; // "SI AUTORIZADA"

const SPM = {
  subelementos: "subtasks_mm2290mm",
  fecha: "date_mm22j930",
  personaVieja: "multiple_person_mm22j6ja",
  estado: "color_mm22s1hd",
  boton: "button_mm22vjpd",
  proveedores: "board_relation_mm22xppd",
  reflejo: "lookup_mm22smkb",
  obra: "color_mm2289de",
  emisor: "board_relation_mm79w6vx",
  idItem: "pulse_id_mm7ckn0j",
  fechaEnvio: "date_mm7cj0n3",
  recomendado: "text_mm7c6chk",
  cuadro: "long_text_mm7c53fx",
  centroCosto: "dropdown_mm7cg19s",
  numero: "text_mm7eawn",
  envio: "color_mm7fnd78",
  ocasionales: "long_text_mm7gd0ee",
  destinatarios: "long_text_mm7g3ra0",
  comparacion: "color_mm7jmbwc",
};

const COT = {
  subelementos: "subtasks_mm7cqph2",
  spm: "board_relation_mm7ckt5z",
  proveedor: "board_relation_mm7cktcn",
  numero: "text_mm7cfbnq",
  fecha: "date_mm7cx9v7",
  validaHasta: "date_mm7cnxv5",
  precio: "numeric_mm7c1m8r",
  moneda: "dropdown_mm7cf5he",
  plazo: "numeric_mm7cnsbz",
  condicionPago: "text_mm7cn2qj",
  estado: "color_mm7cqzdh",
  archivo: "file_mm7crf7g",
  origen: "color_mm7cd1e1",
  obra: "lookup_mm7c9nhh",
  centroCosto: "lookup_mm7cqsq0",
  notasLectura: "long_text_mm7h6xq2",
  remitente: "text_mm7hggtv",
};

/**
 * Indices de SPM. OJO con "Revisar": es el 9, no el 5. monday no renumera
 * cuando se borra una etiqueta, asi que el indice y la posicion en la lista no
 * tienen por que coincidir -por eso se leen del tablero y no se cuentan-.
 */
const ENVIO_BORRADOR = [0];
const ENVIO_ENVIADO = [2];
const ENVIO_TRABADO = [1, 3]; // "Por enviar" colgado + "Error envio"
const COMPARACION_LISTA = [3]; // "Comparado"
const COTIZACION_REVISAR = [9];
const COTIZACION_ELEGIDA = [4]; // "Seleccionada"

// ---------------------------------------------------------------- el plan

const PLAN = [
  {
    board: "CONTROL_HERRAMIENTAS",
    vistas: [
      {
        nombre: "Inventario",
        porQue: "La del dia a dia. Deja a la vista que es, donde esta y quien la tiene; esconde la plata, las fechas de compra y las dos columnas muertas.",
        orden: ["name", MAESTRO.codigo, MAESTRO.categoria, MAESTRO.estado, MAESTRO.ubicacion, MAESTRO.custodio, MAESTRO.condicion, MAESTRO.marca, MAESTRO.modelo, MAESTRO.serie, MAESTRO.foto],
        ocultas: [MAESTRO.correlativo, MAESTRO.responsableViejo, MAESTRO.responsable, MAESTRO.energia, MAESTRO.ultSalida, MAESTRO.ultDevolucion, MAESTRO.mantenimiento, MAESTRO.fechaCompra, MAESTRO.valorCompra, MAESTRO.observaciones, MAESTRO.tipoUbicacion],
        congeladas: 2,
      },
      {
        nombre: "Dónde está cada una",
        porQue: "Agrupada por ubicacion: es la respuesta a la pregunta que se hace el bodeguero antes de arrendar algo que ya tenemos.",
        orden: ["name", MAESTRO.codigo, MAESTRO.categoria, MAESTRO.estado, MAESTRO.custodio, MAESTRO.condicion],
        ocultas: [MAESTRO.correlativo, MAESTRO.responsableViejo, MAESTRO.responsable, MAESTRO.energia, MAESTRO.ultSalida, MAESTRO.ultDevolucion, MAESTRO.mantenimiento, MAESTRO.fechaCompra, MAESTRO.valorCompra, MAESTRO.observaciones, MAESTRO.tipoUbicacion, MAESTRO.marca, MAESTRO.modelo, MAESTRO.serie, MAESTRO.foto],
        agruparPor: MAESTRO.ubicacion,
      },
      {
        nombre: "Necesitan atención",
        porQue: "Lo roto, lo perdido y lo dado de baja en un solo lugar. Hoy hay 7 herramientas asi y estan desparramadas entre las 145.",
        orden: ["name", MAESTRO.codigo, MAESTRO.estado, MAESTRO.condicion, MAESTRO.ubicacion, MAESTRO.custodio, MAESTRO.mantenimiento, MAESTRO.observaciones],
        ocultas: [MAESTRO.correlativo, MAESTRO.responsableViejo, MAESTRO.responsable, MAESTRO.energia, MAESTRO.ultSalida, MAESTRO.ultDevolucion, MAESTRO.fechaCompra, MAESTRO.valorCompra, MAESTRO.tipoUbicacion, MAESTRO.marca, MAESTRO.modelo, MAESTRO.serie, MAESTRO.foto, MAESTRO.categoria],
        filtro: [{ column_id: MAESTRO.estado, compare_value: ESTADO_NECESITA_ATENCION, operator: "any_of" }],
      },
      {
        nombre: "Valor del inventario",
        porQue: "Lo que mira Administracion para contabilidad y seguros. Va aparte justamente para que el precio de compra no este en la vista de todos los dias.",
        orden: ["name", MAESTRO.codigo, MAESTRO.categoria, MAESTRO.marca, MAESTRO.modelo, MAESTRO.serie, MAESTRO.fechaCompra, MAESTRO.valorCompra, MAESTRO.estado, MAESTRO.condicion],
        ocultas: [MAESTRO.correlativo, MAESTRO.responsableViejo, MAESTRO.responsable, MAESTRO.energia, MAESTRO.ultSalida, MAESTRO.ultDevolucion, MAESTRO.mantenimiento, MAESTRO.observaciones, MAESTRO.tipoUbicacion, MAESTRO.ubicacion, MAESTRO.custodio, MAESTRO.foto],
      },
    ],
  },
  {
    board: "CONTROL_HERRAMIENTAS_MOVIMIENTOS",
    vistas: [
      {
        nombre: "Falta confirmar",
        porQue: "La contracara en monday de 'Mis Pendientes': las herramientas que salieron y nadie dijo que llegaron. Es el pedido del cliente del 07-10.",
        orden: ["name", MOV.herramienta, MOV.codigo, MOV.obra, MOV.tipo, MOV.fecha, MOV.origen, MOV.destino, MOV.recibe, MOV.responsable],
        ocultas: [MOV.idMaestro, MOV.categoria, MOV.responsableViejo, MOV.alSalir, MOV.alRecibir, MOV.evidencia, MOV.confirmadaPor, MOV.fechaConfirmacion, MOV.entrega, MOV.observaciones],
        filtro: [{ column_id: MOV.recepcion, compare_value: RECEPCION_PENDIENTE, operator: "any_of" }],
        orden_por: [{ column_id: MOV.fecha, direction: "asc" }],
      },
      {
        nombre: "Historial",
        porQue: "Todo el movimiento, lo ultimo arriba. Esconde el ID maestro -que es un numero interno- y la columna de persona en desuso.",
        orden: ["name", MOV.fecha, MOV.tipo, MOV.herramienta, MOV.codigo, MOV.obra, MOV.origen, MOV.destino, MOV.entrega, MOV.recibe, MOV.recepcion, MOV.responsable, MOV.observaciones],
        ocultas: [MOV.idMaestro, MOV.categoria, MOV.responsableViejo],
        orden_por: [{ column_id: MOV.fecha, direction: "desc" }],
        congeladas: 2,
      },
    ],
  },
  {
    board: "CONTROL_ARRIENDOS",
    vistas: [
      {
        nombre: "Arriendos activos",
        porQue: "Lo que esta en obra generando plata hoy. Los dos costos guardados quedan ocultos a proposito: envejecen solos, el numero bueno lo recalcula la app.",
        orden: ["name", ARR.codigo, ARR.obra, ARR.proveedor, ARR.oc, ARR.inicio, ARR.fin, ARR.cantInicial, ARR.cantActiva, ARR.cantDevuelta, ARR.tipoTarifa, ARR.tarifa, ARR.estado],
        ocultas: [ARR.responsableViejo, ARR.responsable, ARR.costoAcumulado, ARR.costoDiario, ARR.marca, ARR.modelo, ARR.serie, ARR.ingresoObra, ARR.motivo, ARR.observaciones, ARR.iva, ARR.unidad, ARR.guia, ARR.fotoLlegada, ARR.fotoEntrega, ARR.categoria, ARR.custodio],
        filtro: [{ column_id: ARR.estado, compare_value: ARRIENDO_ACTIVO, operator: "any_of" }],
        orden_por: [{ column_id: ARR.fin, direction: "asc" }],
        congeladas: 2,
      },
      {
        nombre: "Sin orden de compra",
        porQue: "La regla del cliente es que no se arriende sin OC. Esta vista es la que muestra cuando se rompio y por que.",
        orden: ["name", ARR.codigo, ARR.obra, ARR.proveedor, ARR.excepcion, ARR.motivo, ARR.inicio, ARR.fin, ARR.estado],
        ocultas: [ARR.responsableViejo, ARR.responsable, ARR.costoAcumulado, ARR.costoDiario, ARR.marca, ARR.modelo, ARR.serie, ARR.ingresoObra, ARR.observaciones, ARR.iva, ARR.unidad, ARR.guia, ARR.fotoLlegada, ARR.fotoEntrega, ARR.categoria, ARR.custodio, ARR.tarifa, ARR.tipoTarifa, ARR.cantInicial, ARR.cantActiva, ARR.cantDevuelta, ARR.nGuia, ARR.fechaGuia, ARR.oc],
        filtro: [{ column_id: ARR.excepcion, compare_value: EXCEPCION_SI, operator: "any_of" }],
      },
      {
        nombre: "Papeles",
        porQue: "La guia, su numero y su fecha, y las dos fotos. Es lo que hace falta buscar cuando el proveedor discute una devolucion.",
        orden: ["name", ARR.codigo, ARR.proveedor, ARR.nGuia, ARR.fechaGuia, ARR.guia, ARR.fotoLlegada, ARR.fotoEntrega, ARR.oc, ARR.estado],
        ocultas: [ARR.responsableViejo, ARR.responsable, ARR.costoAcumulado, ARR.costoDiario, ARR.marca, ARR.modelo, ARR.serie, ARR.ingresoObra, ARR.motivo, ARR.observaciones, ARR.iva, ARR.unidad, ARR.categoria, ARR.custodio, ARR.tarifa, ARR.tipoTarifa, ARR.cantInicial, ARR.cantActiva, ARR.cantDevuelta, ARR.inicio, ARR.fin, ARR.excepcion, ARR.obra],
      },
    ],
  },
  {
    board: "SPM_VDV",
    vistas: [
      {
        nombre: "Solicitudes",
        porQue: "La del dia a dia. Numero, obra, quien la pidio y en que anda. Esconde el cuadro comparativo -que es un texto largo que rompe la fila-, los destinatarios y la columna de persona que quedo del esquema viejo.",
        orden: ["name", SPM.numero, SPM.obra, SPM.centroCosto, SPM.emisor, SPM.envio, SPM.comparacion, SPM.fechaEnvio, SPM.recomendado, SPM.estado],
        ocultas: [SPM.cuadro, SPM.destinatarios, SPM.ocasionales, SPM.personaVieja, SPM.reflejo, SPM.boton, SPM.idItem, SPM.fecha, SPM.proveedores],
        orden_por: [{ column_id: SPM.numero, direction: "desc" }],
        congeladas: 2,
      },
      {
        nombre: "Para mandar a cotizar",
        porQue: "Las que estan armadas y todavia no salieron. Es la bandeja del que compra: mientras esten aca, no se le pidio precio a nadie.",
        orden: ["name", SPM.numero, SPM.obra, SPM.centroCosto, SPM.emisor, SPM.destinatarios, SPM.fecha],
        ocultas: [SPM.cuadro, SPM.ocasionales, SPM.personaVieja, SPM.reflejo, SPM.boton, SPM.idItem, SPM.proveedores, SPM.recomendado, SPM.comparacion, SPM.fechaEnvio, SPM.estado],
        filtro: [{ column_id: SPM.envio, compare_value: ENVIO_BORRADOR, operator: "any_of" }],
        orden_por: [{ column_id: SPM.fecha, direction: "asc" }],
      },
      {
        nombre: "Esperando respuesta",
        porQue: "Salieron los correos y se espera al proveedor. Ordenadas por fecha de envio: arriba queda lo que mas tiempo lleva sin contestar.",
        orden: ["name", SPM.numero, SPM.obra, SPM.fechaEnvio, SPM.destinatarios, SPM.comparacion, SPM.emisor],
        ocultas: [SPM.cuadro, SPM.ocasionales, SPM.personaVieja, SPM.reflejo, SPM.boton, SPM.idItem, SPM.proveedores, SPM.recomendado, SPM.fecha, SPM.centroCosto, SPM.estado],
        filtro: [{ column_id: SPM.envio, compare_value: ENVIO_ENVIADO, operator: "any_of" }],
        orden_por: [{ column_id: SPM.fechaEnvio, direction: "asc" }],
      },
      {
        nombre: "Trabadas o con error",
        porQue: "La contracara en monday de 'Mis Pendientes'. Junta las dos formas de romperse: las que Make marco 'Error envio', y las que quedaron en 'Por enviar' -que es un estado DE PASO: si sigue ahi, Make no corrio y no dejo ningun error escrito-.",
        orden: ["name", SPM.numero, SPM.obra, SPM.envio, SPM.emisor, SPM.destinatarios, SPM.fecha, SPM.fechaEnvio],
        ocultas: [SPM.cuadro, SPM.ocasionales, SPM.personaVieja, SPM.reflejo, SPM.boton, SPM.idItem, SPM.proveedores, SPM.recomendado, SPM.comparacion, SPM.centroCosto, SPM.estado],
        filtro: [{ column_id: SPM.envio, compare_value: ENVIO_TRABADO, operator: "any_of" }],
      },
      {
        nombre: "Listas para decidir",
        porQue: "Ya hay con que elegir proveedor: la comparacion esta hecha. Aca si se muestra el cuadro comparativo, que es justo lo que se viene a leer.",
        orden: ["name", SPM.numero, SPM.obra, SPM.centroCosto, SPM.recomendado, SPM.cuadro, SPM.emisor],
        ocultas: [SPM.ocasionales, SPM.personaVieja, SPM.reflejo, SPM.boton, SPM.idItem, SPM.proveedores, SPM.destinatarios, SPM.fecha, SPM.envio, SPM.estado],
        filtro: [{ column_id: SPM.comparacion, compare_value: COMPARACION_LISTA, operator: "any_of" }],
      },
    ],
  },
  {
    board: "COTIZACIONES_SPM",
    vistas: [
      {
        nombre: "Cotizaciones",
        porQue: "Lo que contestaron los proveedores. Esconde las notas de lectura -el texto que deja la IA, que son parrafos- y las dos columnas espejo, que repiten lo que ya dice la solicitud.",
        orden: ["name", COT.spm, COT.proveedor, COT.fecha, COT.precio, COT.moneda, COT.plazo, COT.estado, COT.origen, COT.archivo],
        ocultas: [COT.notasLectura, COT.obra, COT.centroCosto, COT.validaHasta, COT.condicionPago, COT.numero, COT.remitente],
        orden_por: [{ column_id: COT.fecha, direction: "desc" }],
        congeladas: 2,
      },
      {
        nombre: "Para revisar",
        porQue: "Las que la IA no pudo leer con confianza. Aca SI se muestran las notas de lectura, porque el motivo de la duda es lo unico que importa en esta vista.",
        orden: ["name", COT.spm, COT.proveedor, COT.precio, COT.notasLectura, COT.archivo, COT.remitente, COT.fecha],
        ocultas: [COT.obra, COT.centroCosto, COT.validaHasta, COT.condicionPago, COT.numero, COT.moneda, COT.plazo, COT.origen, COT.estado],
        filtro: [{ column_id: COT.estado, compare_value: COTIZACION_REVISAR, operator: "any_of" }],
      },
      {
        nombre: "Elegidas",
        porQue: "Las que ganaron. Es lo que hay que mirar para emitir la orden de compra, y el historial de a quien se le termino comprando.",
        orden: ["name", COT.spm, COT.proveedor, COT.precio, COT.moneda, COT.plazo, COT.condicionPago, COT.fecha, COT.archivo],
        ocultas: [COT.notasLectura, COT.obra, COT.centroCosto, COT.validaHasta, COT.numero, COT.origen, COT.remitente, COT.estado],
        filtro: [{ column_id: COT.estado, compare_value: COTIZACION_ELEGIDA, operator: "any_of" }],
      },
    ],
  },
];

// ------------------------------------------------------------------ aplicar

let creadas = 0;
let reemplazadas = 0;

for (const { board, vistas } of PLAN) {
  if (SOLO && !SOLO.has(board)) continue;
  const boardId = de(`MONDAY_BOARD_${board}`);
  if (!boardId) {
    console.log(`\n### ${board}: falta el env, se omite`);
    continue;
  }

  const d = await mon(`query($b:[ID!]){ boards(ids:$b){ name views{ id name type } } }`, { b: [boardId] });
  const existentes = d.boards[0].views;
  console.log(`\n### ${d.boards[0].name}`);

  for (const v of vistas) {
    const previa = existentes.find((x) => x.name === v.nombre);
    console.log(`  ${previa ? "rehago " : "creo   "} "${v.nombre}"  (${v.orden.length} columnas a la vista, ${v.ocultas.length} escondidas)`);
    console.log(`          ${v.porQue}`);
    if (previa) reemplazadas += 1;
    else creadas += 1;
    if (!APLICAR) continue;

    // Se borra y se rehace en vez de actualizar: `update_view` pide mandar el
    // settings entero igual, y rehacer deja este archivo como la unica verdad.
    if (previa) {
      await mon(`mutation($b:ID!,$v:ID!){ delete_view(board_id:$b,view_id:$v){ id } }`, { b: boardId, v: previa.id });
    }

    const settings = {
      columns: {
        column_order: v.orden,
        column_properties: v.ocultas.map((column_id) => ({ column_id, visible: false })),
        // Las primeras columnas quedan fijas al hacer scroll horizontal: sin
        // esto, en un tablero ancho se pierde de vista cual es la fila.
        floating_columns_count: v.congeladas ?? 1,
      },
      ...(v.agruparPor
        ? { group_by: { conditions: [{ columnId: v.agruparPor }], hideEmptyGroups: true } }
        : {}),
    };

    await mon(
      `mutation($b:ID!,$n:String!,$s:JSON,$f:ItemsQueryGroup,$o:[ItemsQueryOrderBy!]){
         create_view(board_id:$b, type:TABLE, name:$n, settings:$s, filter:$f, sort:$o){ id name }
       }`,
      {
        b: boardId,
        n: v.nombre,
        // OJO: objeto, no JSON.stringify. Ver el comentario de arriba.
        s: settings,
        f: v.filtro ? { operator: "and", rules: v.filtro } : null,
        o: v.orden_por ?? null,
      },
    );
  }
}

console.log(
  APLICAR
    ? `\nListo: ${creadas} vistas nuevas, ${reemplazadas} rehechas.\n`
    : `\nEn seco: ${creadas} por crear, ${reemplazadas} por rehacer. Corré con --aplicar.\n`,
);
