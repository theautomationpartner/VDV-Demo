/**
 * Deja prolijos los cuatro tableros de Herramientas y Arriendos en monday.
 *
 *   node scripts/ordenar-tableros-monday.mjs            (muestra que haria)
 *   node scripts/ordenar-tableros-monday.mjs --aplicar  (lo hace)
 *
 * Los tableros los creo el cliente con monday vibe y quedaron con nombres
 * disparejos -"UBICACION ACTUAL" a los gritos, "foto llegada" en minuscula,
 * "Group Title" sin tocar- y sin una sola descripcion. Un tablero que nadie
 * entiende se llena de datos a mano que no coinciden con nada.
 *
 * QUE HACE Y QUE NO
 *
 *   SI  renombra columnas        -> change_column_title
 *   SI  les pone descripcion     -> change_column_metadata
 *   SI  renombra los grupos      -> update_group
 *   NO  reordena las columnas    -> no existe la mutacion (ColumnProperty solo
 *                                   acepta "title" y "description"). Va a mano.
 *   NO  crea vistas              -> tampoco existe. Va a mano.
 *
 * ES SEGURO renombrar: la app resuelve todo por ID de columna
 * (lib/board-schemas.js), nunca por titulo, y `npm run validar-schemas`
 * comprueba ids y no nombres. Las automatizaciones de monday tambien guardan
 * ids. Cambiar el titulo no mueve un solo dato.
 *
 * Es idempotente: lo que ya esta como tiene que estar, no se toca.
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: de("MONDAY_API_TOKEN"),
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

/**
 * Lo que tiene que decir cada columna.
 *
 * Las descripciones dicen QUIEN ESCRIBE: es el dato que decide si alguien puede
 * corregir una celda a mano o si al rato la app se la va a pisar. Sin eso, la
 * unica forma de saberlo es preguntarnos.
 */
const PLAN = {
  CONTROL_HERRAMIENTAS: {
    titulo: "Maestro de herramientas",
    grupos: { "listado herramientas": "Listado de herramientas" },
    columnas: {
      text_mm7687am: ["Código / QR", "Código HRR-0000 que escribe la app al dar de alta. No tocar a mano: es lo que lee el QR."],
      autonumber_mm76hmj7: ["N° correlativo automático (sin uso)", "Vacía en las 145 filas. El código real es la columna 'Código / QR'. Se puede borrar."],
      dropdown_mm762zqy: ["Fuente de energía", "Se carga a mano al dar de alta."],
      multiple_person_mm76s4g: ["Responsable (usuario monday — en desuso)", "Vacía. Quedó de la versión vieja. La app NO la escribe: se vacía sola el día que esa persona pierde la licencia de monday. La que vale es 'Responsable'."],
      board_relation_mm79270j: ["Custodio actual (ficha)", "La MISMA persona que 'Custodio actual', pero apuntando a su ficha en Equipo VDV. Esta es la que vale: el texto de al lado es para leer, este es el vínculo. Sobrevive a que renombren a la persona y a que pierda la licencia de monday. La escribe la app."],
      date_mm76td04: ["Fecha última salida", "La escribe la app en cada salida a obra."],
      date_mm76kdht: ["Fecha última devolución", "La escribe la app en cada devolución."],
      date_mm768mat: ["Próximo mantenimiento", "Se carga a mano."],
      date_mm761zxq: ["Fecha compra", "Se carga a mano."],
      numeric_mm769z30: ["Valor compra", "Se carga a mano. Solo la ven Administrador y Oficina Técnica: es dato de contabilidad y seguros."],
      file_mm76hyqy: ["Foto", "Foto de la herramienta. La sube la app desde la ficha."],
      long_text_mm76z4ex: ["Observaciones", "Texto libre. Si un movimiento no se pudo sincronizar, la app deja acá la constancia."],
      text_mm767c06: ["Marca", "Se carga a mano."],
      text_mm76sawx: ["Modelo", "Se carga a mano."],
      text_mm762p0s: ["N° serie", "Se carga a mano."],
      color_mm76b1fq: ["Condición física", "NUEVO / USADO / DAÑADO. La recalcula la app según cómo vuelve del último movimiento."],
      color_mm76r560: ["Estado operativo", "DISPONIBLE / EN USO / EN REPARACIÓN / DE BAJA / EXTRAVIADA. La mueve la app con cada movimiento; es la que decide qué acciones se ofrecen."],
      color_mm765ngx: ["Tipo de ubicación", "BODEGA u OBRA. La escribe la app."],
      color_mm76ncrk: ["Ubicación actual", "Dónde está hoy. La escribe la app en cada movimiento. Si no coincide con el historial, la ficha avisa y ofrece 'Poner al día'."],
      text_mm764j8g: ["Custodio actual", "Quién la tiene hoy, para leer de un vistazo. La escribe la app con el nombre tal cual figura en Equipo VDV. El dato que manda es 'Custodio actual (ficha)': este texto es una copia."],
      dropdown_mm76v0b9: ["Categoría", "Se carga a mano al dar de alta."],
    },
  },

  CONTROL_HERRAMIENTAS_MOVIMIENTOS: {
    titulo: "Movimientos de herramientas",
    grupos: { historial: "Historial de movimientos" },
    columnas: {
      color_mm76vnzv: ["Obra", "La obra del movimiento, que es siempre el destino. Es la columna que decide quién puede ver esta fila."],
      date_mm76jsah: ["Fecha del movimiento", "La pone la app el día que se registra."],
      color_mm76b3kk: ["Tipo de movimiento", "Salida, Devolución, Traslado, Envío a reparación, Regreso de reparación, Pérdida o Baja."],
      color_mm764jg3: ["Estado al salir", "Cómo salió. Solo se llena en las salidas."],
      color_mm76bsqh: ["Estado al recibir", "Cómo llegó. Se llena en todo lo que no sea una salida."],
      long_text_mm76vxn5: ["Observaciones", "Texto libre que escribe quien registra el movimiento."],
      file_mm76xqhh: ["Evidencia", "Foto del movimiento, si se sacó."],
      text_mm761181: ["ID maestro", "El id del item de la herramienta en el tablero maestro. Es el vínculo entre los dos tableros: NO TOCAR, sin esto la ficha pierde su historial."],
      text_mm76997n: ["Código / QR", "Copia del código de la herramienta en ese momento."],
      text_mm76cqvb: ["Herramienta", "Copia del nombre de la herramienta en ese momento. Es una foto, no un vínculo: si después la renombran, el historial sigue diciendo lo que decía ese día."],
      text_mm76djdk: ["Categoría", "Copia de la categoría en ese momento."],
      text_mm76s0s6: ["Origen", "De dónde salió."],
      text_mm76mdd5: ["Destino", "A dónde fue."],
      text_mm76mpcy: ["Entrega", "Quién la tenía hasta ese momento. La completa sola la app con el custodio anterior."],
      text_mm767hsg: ["Recibe / custodio", "Quién queda a cargo. Solo gente del tablero Equipo VDV."],
      multiple_person_mm7657a3: ["Responsable del registro (usuario monday — en desuso)", "Vacía. La app NO la escribe: se vacía sola el día que esa persona pierde la licencia de monday. La que vale es 'Responsable del registro'."],
      board_relation_mm797mqq: ["Responsable del registro", "Quién registró el movimiento, apuntando a su ficha en Equipo VDV. Si una herramienta se pierde, esto es lo único que dice quién la entregó."],
      color_mm7y936c: ["Recepción", "Pendiente hasta que el que recibe confirma que llegó. Lo pidió el cliente el 07-10-2026. Mientras diga Pendiente, le aparece en 'Mis Pendientes' al bodeguero de esa obra."],
      text_mm7ygdnm: ["Confirmada por", "Quién confirmó que llegó. La escribe la app."],
      date_mm7y9yrs: ["Fecha de confirmación", "Cuándo se confirmó. La escribe la app."],
    },
  },

  CONTROL_ARRIENDOS: {
    titulo: "Arriendos",
    grupos: { "Group Title": "Arriendos" },
    columnas: {
      color_mm77xt1v: ["Obra", "La obra donde está el equipo arrendado. Decide quién puede ver esta fila."],
      text_mm76bm7d: ["Código arriendo", "Código ARR-0000 que escribe la app. El número sale de nuestra base, no de monday."],
      dropdown_mm76nbyq: ["Categoría", "Se elige al dar de alta."],
      file_mm76cp1t: ["Guía de ingreso", "Foto de la guía del proveedor. Es obligatoria al dar de alta."],
      color_mm769xwd: ["Tipo de tarifa", "POR DÍA / POR SEMANA / POR MES / TARIFA FIJA / POR USO. Decide cómo se calcula el costo. Si está vacía, la app no muestra un total: prefiere no mostrarlo antes que inventarlo."],
      numeric_mm7682b3: ["Tarifa unitaria", "Precio del encabezado. El cálculo real usa el precio de cada ítem."],
      color_mm76ecnt: ["IVA", "Si la tarifa lleva IVA."],
      dropdown_mm766xqg: ["Unidad de cobro", "Por equipo, por cuerpo, por unidad, etc."],
      date_mm767bkr: ["Fecha inicio arriendo", "Desde cuándo corre el costo."],
      date_mm766jse: ["Fecha fin arriendo", "Hasta cuándo se pactó. Si ya pasó y el equipo sigue en obra, salta la alerta en 'Mis Pendientes'."],
      numeric_mm761nxf: ["Costo estimado acumulado", "Se guarda como registro, pero la pantalla muestra el valor RECALCULADO: un número guardado envejece solo. No sirve para tomar decisiones."],
      numeric_mm76hxtm: ["Costo diario estimado", "Igual que el anterior: la pantalla lo recalcula."],
      text_mm76jvfp: ["Marca", "Se carga a mano."],
      date_mm76f57n: ["Fecha ingreso a la obra actual", "Se carga a mano."],
      text_mm76d4tq: ["Custodio actual", "Quién de VDV tiene el equipo."],
      multiple_person_mm76a69w: ["Responsable (usuario monday — en desuso)", "Vacía. La app NO la escribe. La que vale es 'Responsable'."],
      board_relation_mm79bptf: ["Responsable", "Apunta a la ficha de la persona en Equipo VDV. La escribe la app."],
      color_mm76rmss: ["Estado del arriendo", "ACTIVO mientras quede algo en obra; se cierra solo cuando se devuelve el último ítem."],
      color_mm76v1h4: ["Excepción sin OC", "Marca que este arriendo se hizo sin orden de compra. La regla del cliente es que no debería pasar."],
      long_text_mm76vzr7: ["Motivo de la excepción", "Por qué se arrendó sin OC."],
      long_text_mm76pars: ["Observaciones", "Texto libre. La app agrega acá las notas de cada devolución."],
      text_mm764q1t: ["Modelo", "Se carga a mano."],
      text_mm76q7hk: ["N° serie", "Se carga a mano."],
      numeric_mm76kbyj: ["Cantidad inicial", "Cuántas piezas llegaron. La escribe la app sumando los ítems."],
      numeric_mm76jjmq: ["Cantidad activa", "Cuántas siguen en obra. La recalcula la app en cada devolución."],
      numeric_mm76x7qp: ["Cantidad devuelta", "Cuántas volvieron al proveedor."],
      text_mm76anc5: ["N° de guía de ingreso", "Obligatorio al dar de alta."],
      date_mm76c5qc: ["Fecha de la guía de ingreso", "Obligatoria al dar de alta."],
      board_relation_mm76eppy: ["Proveedor", "Apunta al tablero de Proveedores."],
      board_relation_mm76vaqe: ["Orden de compra", "Apunta a la OC del tablero de Órdenes de Compra. Es lo que permite la regla del cliente: que no se arriende sin orden de compra."],
      file_mm7c4an7: ["Foto de llegada", "Cómo llegó el equipo. La sube la app al dar de alta."],
      file_mm7ch6m6: ["Foto de entrega", "Cómo se devolvió. La sube la app en la devolución."],
    },
  },

  CONTROL_ARRIENDOS_ITEMS: {
    titulo: "Ítems de arriendo",
    grupos: {},
    columnas: {
      numeric_mm77cw29: ["Cantidad", "Cuántas piezas de este ítem."],
      numeric_mm77996y: ["Precio unitario", "Precio de una pieza. Solo lo ven los roles que pueden ver costos."],
      numeric_mm77261e: ["Precio de la tarifa", "Precio por período según el tipo de tarifa."],
      color_mm77haqq: ["Tipo de tarifa", "Si está vacía, este ítem no entra en el total: la app prefiere no mostrar un número antes que inventarlo."],
      date_mm77t980: ["Inicio", "Desde cuándo corre el costo de este ítem."],
      date_mm77mg5m: ["Término", "Hasta cuándo se pactó este ítem."],
      date_mm77cxq5: ["Fecha de devolución", "El día que volvió al proveedor. La escribe la app y es la que cierra el costo."],
      color_mm775j0h: ["Estado", "EN OBRA, DEVUELTO o DEVUELTO CON OBSERVACIONES."],
      numeric_mm779a06: ["Costo acumulado", "Se guarda como registro; la pantalla lo recalcula."],
      file_mm7c46se: ["Foto de devolución", "Cómo se devolvió este ítem. Obligatoria."],
      file_mm7cqpyt: ["Foto de llegada", "Cómo llegó este ítem."],
      text_mm7z5hjd: ["Quién recibe", "La persona DEL PROVEEDOR que se lleva el equipo. Texto libre a propósito: no es gente de VDV y no va al tablero Equipo VDV."],
      file_mm7z9jev: ["Firma de recepción", "La firma de quien se lleva el equipo, como en un remito."],
    },
  },
};

let cambios = 0;
let iguales = 0;

for (const [clave, plan] of Object.entries(PLAN)) {
  const boardId = de(`MONDAY_BOARD_${clave}`);
  if (!boardId) {
    console.log(`\n### ${plan.titulo}: falta MONDAY_BOARD_${clave} en el entorno, se omite`);
    continue;
  }

  const d = await mon(
    `query($b:[ID!]){ boards(ids:$b){ name groups{ id title } columns{ id title description } } }`,
    { b: [boardId] },
  );
  const board = d.boards[0];
  console.log(`\n### ${plan.titulo} — ${board.name}`);

  const porId = new Map(board.columns.map((c) => [c.id, c]));

  for (const [columnId, [titulo, descripcion]] of Object.entries(plan.columnas)) {
    const actual = porId.get(columnId);
    if (!actual) {
      console.log(`  NO EXISTE  ${columnId} (se esperaba "${titulo}")`);
      continue;
    }

    if (actual.title !== titulo) {
      console.log(`  titulo   "${actual.title}" -> "${titulo}"`);
      cambios += 1;
      if (APLICAR) {
        await mon(
          `mutation($b:ID!,$c:String!,$t:String!){ change_column_title(board_id:$b,column_id:$c,title:$t){ id } }`,
          { b: boardId, c: columnId, t: titulo },
        );
      }
    } else iguales += 1;

    if ((actual.description ?? "") !== descripcion) {
      console.log(`  descrip  ${titulo}`);
      cambios += 1;
      if (APLICAR) {
        // `value` es String y NO JSON, aunque el tipo se llame metadata: con
        // JSON.stringify monday rechaza la mutacion entera.
        await mon(
          `mutation($b:ID!,$c:String!,$v:String!){
             change_column_metadata(board_id:$b,column_id:$c,column_property:description,value:$v){ id }
           }`,
          { b: boardId, c: columnId, v: descripcion },
        );
      }
    } else iguales += 1;
  }

  for (const [viejo, nuevo] of Object.entries(plan.grupos ?? {})) {
    const grupo = board.groups.find((g) => g.title === viejo);
    if (!grupo) continue;
    console.log(`  grupo    "${viejo}" -> "${nuevo}"`);
    cambios += 1;
    if (APLICAR) {
      await mon(
        `mutation($b:ID!,$g:String!,$v:String!){
           update_group(board_id:$b,group_id:$g,group_attribute:title,new_value:$v){ id }
         }`,
        { b: boardId, g: grupo.id, v: nuevo },
      );
    }
  }

  // Lo que esta en el tablero pero no en el plan: columnas que alguien agrego
  // despues y nadie mapeo. Vale la pena verlas, no se tocan.
  const sinPlan = board.columns.filter(
    (c) => c.type !== "name" && !plan.columnas[c.id] && c.id !== "name" && !/^subtasks_/.test(c.id),
  );
  for (const c of sinPlan) console.log(`  sin plan   "${c.title}" (${c.id})`);
}

console.log(
  APLICAR
    ? `\nAplicado: ${cambios} cambios, ${iguales} ya estaban bien.\n`
    : `\nEn seco: ${cambios} cambios por hacer, ${iguales} ya estan bien. Corré con --aplicar.\n`,
);
