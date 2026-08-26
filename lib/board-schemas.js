/**
 * Mapeo de cada "board" logico (las clases que las 3 apps originales importaban desde
 * @api/BoardSDK) a su board_id real de monday.com y al id de columna real detras de
 * cada nombre "amigable" usado en el codigo migrado (ej. "numeroOc", "estadoDocumento").
 *
 * Completado a partir de `{ boards(ids:[...]) { columns { id title type } } }` contra
 * la cuenta real de monday.com de VDV. Si se agrega o renombra una columna en monday,
 * hay que volver a correr esa query y actualizar el id correspondiente ac
 */
// Grupo "Duplicadas" de FacturasIaBoard, tal como lo excluye el OC Tracker
// original (oc-tracker/hooks/useOCData.js, previo a esta migracion) con
// `.where({ group: { neq: ['group_mm3kw08s'] } })` - mismo criterio que
// GRUPO_OC_DUPLICADAS del lado de las OC, usado SOLO por
// hooks/oc-tracker/useOCData.js. OJO: Portal Proveedor (useFacturacion.js)
// filtra este mismo tablero con una logica propia y distinta (lista blanca
// de 2 grupos, fiel a su propio original en code-text/Portal Proveedor.txt) -
// son dos apps originales separadas, no unificar esta constante entre ambas.
export const FACTURAS_GRUPO_DUPLICADAS_ID = "group_mm3kw08s";

export const BOARD_SCHEMAS = {
  OrdenesDeCompraMaxxaBoard: {
    boardIdEnv: "MONDAY_BOARD_ORDENES_DE_COMPRA_MAXXA",
    columns: {
      numeroOc: "text_mm2pkmjp",
      obra: "color_mm2pdz75",
      monto: "numeric_mm2ps8pn",
      moneda: "dropdown_mm2p64c6",
      estadoDocumento: "color_mm2p1sw0",
      responsable: "multiple_person_mm2phenm",
      validezDocumento: "timerange_mm2pcejk",
      condicionDeCompra: "dropdown_mm2pqfff",
      rut1: "lookup_mm2p7z76",
      rut: "text_mm2pnbxm",
      comentarios: "text_mm2phtxx",
      docOc: "file_mm2p1agb",
      proveedores: "board_relation_mm2pqha4",
    },
  },
  FacturasIaBoard: {
    boardIdEnv: "MONDAY_BOARD_FACTURAS_IA",
    columns: {
      numeroFactura: "text_mm21vxhz",
      oc: "text_mm21ctyp",
      obra: "color_mm21mxfp",
      montoConIva: "numeric_mm21am2f",
      fechaFactura: "date_mm21k4bb",
      estado: "color_mm213we",
      proveedores: "board_relation_mm218b7h",
      fechaVencimiento: "date_mm211dem",
      centroDeCosto: "dropdown_mm21a5yr",
      tipoDePago: "dropdown_mm21fypp",
      correoElectrnico: "email_mm21c268",
      // El "text" de una columna de archivo ya viene siendo la URL protegida del
      // PDF en monday (protected_static). No hace falta pedir assets aparte.
      archivo: "file_mm214kjr",
    },
  },
  BaseDeDatosMaterialesBoard: {
    boardIdEnv: "MONDAY_BOARD_BASE_DE_DATOS_MATERIALES",
    columns: {
      unidad: "dropdown_mm1hymez",
      codigoInterno: "pulse_id_mm1h3kva",
      precioLista: "numeric_mm1hh77p",
      stockCritico: "numeric_mm1sf71w",
      categoriaMaterial: "dropdown_mm296yjk",
    },
  },
  IngresosBoard: {
    boardIdEnv: "MONDAY_BOARD_INGRESOS",
    columns: {
      material: "board_relation_mm1rk1d6",
      cantidadIngresada: "number0avp2tgi",
      estado: "color_mm1r152p",
      obrabodega: "color_mm1rj9sw",
      foto: "filer6xhdtc6",
    },
  },
  ValesBoard: {
    boardIdEnv: "MONDAY_BOARD_VALES",
    columns: {
      baseDeDatosMateriales: "board_relation_mm1rxgfv",
      cantidad: "numeric_mm1rrfjz",
      estado: "color_mm1rac2h",
      obra: "color_mm1hh5e5",
      quienSolicita: "dropdown_mm1rxes3",
      destinoDelMaterial: "dropdown_mm1hs4av",
      quienRetira: "text_mm1zmh3s",
    },
  },
  ProveedoresBoard: {
    boardIdEnv: "MONDAY_BOARD_PROVEEDORES",
    columns: {},
  },
  PagosVdvBoard: {
    boardIdEnv: "MONDAY_BOARD_PAGOS_VDV",
    columns: {
      proveedores: "conectar_tableros2__1",
      estado: "status",
      obra: "department",
      monto: "dup__of_monto3__1",
      numeroFact: "texto__1",
      folioPago: "n_meros5__1",
      fechaLmite: "date",
    },
  },
  FlujoContratacionSubcontratoBoard: {
    boardIdEnv: "MONDAY_BOARD_FLUJO_CONTRATACION_SUBCONTRATO",
    columns: {
      proveedores: "board_relation_mkw46app",
      obra: "color_mkxn75am",
      estadoContrato: "status",
      estadoFirmas: "color_mkw5ep2r",
      vbOt: "color_mm1ax04q",
      vpApr: "color_mkwcd58z",
      vbAdministrador: "color_mkvt649g",
      vbAbogado: "color_mkvt8fh3",
      vbRepLegal: "color_mkvtdtfm",
      montoContratoBruto: "numeric_mkw5kc7w",
      centroCosto: "dropdown_mkw4kn13",
    },
  },
  EstadosDePagoSubcontratosBoard: {
    boardIdEnv: "MONDAY_BOARD_ESTADOS_DE_PAGO_SUBCONTRATOS",
    columns: {
      proveedores: "board_relation_mkw4y738",
      obra: "color_mkxxnrq4",
      estado: "status",
      heather: "color_mm1yax3m",
      vbOt: "color_mkw87gvg",
      vbJt: "color_mky0qfse",
      vbAdm: "color_mkw4az3m",
      vbApr: "color_mkwa2fhv",
      vbGg: "color_mkw4h2xx",
      firmaCaratula: "color_mkxd5fr2",
      montoPresentado: "numeric_mkw4dzmp",
      montoCorregido: "numeric_mkx6ghtp",
      numeroFactura: "numeric_mkw4a9y0",
    },
  },
};

export function getBoardSchema(boardKey) {
  const schema = BOARD_SCHEMAS[boardKey];
  if (!schema) {
    throw new Error(`No existe schema registrado para el board "${boardKey}" en lib/board-schemas.js`);
  }
  return schema;
}

export function resolveColumnId(boardKey, friendlyKey) {
  const schema = getBoardSchema(boardKey);
  const columnId = schema.columns[friendlyKey];
  if (!columnId) {
    throw new Error(
      `El board "${boardKey}" no tiene mapeada la columna "${friendlyKey}" en lib/board-schemas.js`
    );
  }
  if (columnId === "REPLACE_ME") {
    throw new Error(
      `Falta configurar el column_id real de "${friendlyKey}" para "${boardKey}" en lib/board-schemas.js`
    );
  }
  return columnId;
}
