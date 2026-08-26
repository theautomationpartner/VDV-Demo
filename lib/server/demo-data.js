import "server-only";

/**
 * Dataset 100% inventado para DEMO_MODE=true. Ningun dato de aca sale de monday.com -
 * reemplaza por completo la llamada real (mondayFetch) cuando el modo demo esta activo,
 * asi el link publico de demo no expone jamas informacion real de la cuenta de monday.
 *
 * Los arrays de items viven en memoria (module scope): los cambios que se hacen desde la
 * UI (aprobar un vale, crear un material, etc.) se ven durante la sesion del servidor,
 * pero se resetean en cada cold start / redeploy de Vercel. Es intencional: es un demo,
 * no hace falta persistencia real.
 */

// Nombres de obra 100% ficticios (a proposito distintos de los reales que usa la
// app en hooks/vale-express/useUserRole.js ALL_OBRAS) para que nada en el dataset
// de demo coincida con un proyecto real de VDV.
const OBRAS = [
  "OBRA MIRADOR SUR", "OBRA LOS ALAMOS", "OBRA VALLE VERDE", "OBRA COSTANERA NORTE",
  "OBRA ALTOS DEL SOL", "OBRA PARQUE CENTRAL", "OBRA BOSQUE NATIVO", "OBRA LADERA AZUL",
  "OBRA TERRAZAS DEL RIO", "OBRA CUMBRES DEL ESTE",
];

const PROVEEDORES_NOMBRES = [
  "Comercial Ferretera Andes SPA",
  "Constructora Demo SPA",
  "Aceros y Materiales del Sur Ltda.",
  "Hormigones Pacifico SA",
  "Distribuidora Electrica Maipo",
  "Insumos Industriales Rengo",
  "Maderas y Terminaciones Osorno",
  "Grupo Sanitario Andino",
];

function d(daysFromNow) {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromNow);
  dt.setHours(9, 0, 0, 0);
  return dt;
}

function group(id, title) {
  return { id, title };
}

// ---------------------------------------------------------------------------
// BaseDeDatosMaterialesBoard
// ---------------------------------------------------------------------------
const MATERIALES = [
  { id: "mat-1", name: "Cemento Portland 25kg", unidad: "SACO", codigoInterno: "mat-1", precioLista: 6200, stockCritico: 40 },
  { id: "mat-2", name: "Fierro Estriado 10mm 6m", unidad: "UNID", codigoInterno: "mat-2", precioLista: 8900, stockCritico: 100 },
  { id: "mat-3", name: "Tabla Pino 1x4 3.2m", unidad: "UNID", codigoInterno: "mat-3", precioLista: 2350, stockCritico: 150 },
  { id: "mat-4", name: "Ladrillo Fiscal", unidad: "UNID", codigoInterno: "mat-4", precioLista: 320, stockCritico: 500 },
  { id: "mat-5", name: "Pintura Latex Blanco 1GL", unidad: "UNID", codigoInterno: "mat-5", precioLista: 15900, stockCritico: 20 },
  { id: "mat-6", name: "Tuberia PVC 110mm 6m", unidad: "UNID", codigoInterno: "mat-6", precioLista: 11400, stockCritico: 30 },
  { id: "mat-7", name: "Malla Acma C-139", unidad: "UNID", codigoInterno: "mat-7", precioLista: 24500, stockCritico: 15 },
  { id: "mat-8", name: "Cable Electrico THHN 12AWG", unidad: "KG", codigoInterno: "mat-8", precioLista: 3100, stockCritico: 60 },
  { id: "mat-9", name: "Clavo Corriente 3\"", unidad: "KG", codigoInterno: "mat-9", precioLista: 1450, stockCritico: 25 },
  { id: "mat-10", name: "Panel Yeso-Carton 15mm", unidad: "UNID", codigoInterno: "mat-10", precioLista: 7800, stockCritico: 40 },
];

// ---------------------------------------------------------------------------
// ProveedoresBoard (sin columnas propias, solo id + name)
// ---------------------------------------------------------------------------
const PROVEEDORES = PROVEEDORES_NOMBRES.map((name, i) => ({ id: `prov-${i + 1}`, name }));

// ---------------------------------------------------------------------------
// OrdenesDeCompraMaxxaBoard
// ---------------------------------------------------------------------------
const ESTADOS_OC = ["APROBADO", "PENDIENTE", "NUEVO", "RECHAZADO"];
const OC_NUMEROS = Array.from({ length: 16 }, (_, i) => `OC-${2400 + i}`);
const ORDENES_DE_COMPRA = OC_NUMEROS.map((numeroOc, i) => ({
  id: `oc-${i + 1}`,
  name: numeroOc,
  group: i % 5 === 0 ? group("group_mm2pmyq8", "Completadas") : group("topics", "OC emitidas desde Maxxa"),
  numeroOc,
  obra: OBRAS[i % OBRAS.length],
  monto: 850000 + i * 137500,
  moneda: "CLP",
  estadoDocumento: ESTADOS_OC[i % ESTADOS_OC.length],
  responsable: ["Javiera Rojas", "Matias Fuentealba", "Diego Herrera"][i % 3],
  validezDocumento: "30 dias",
  condicionDeCompra: i % 2 === 0 ? "Contado" : "30 dias",
  rut1: "76.123.456-7",
  rut: "76.123.456-7",
  comentarios: "",
  docOc: "",
  proveedores: PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length],
}));

// ---------------------------------------------------------------------------
// FacturasIaBoard (algunas vinculadas a una OC real, otras sueltas)
// ---------------------------------------------------------------------------
const ESTADOS_FACTURA = ["Pendiente", "En Revisión", "Completada", "Enviada a Pago", "Rechazada"];
const FACTURAS_IA = Array.from({ length: 18 }, (_, i) => {
  const ocVinculada = i < 12 ? ORDENES_DE_COMPRA[i % ORDENES_DE_COMPRA.length] : null;
  return {
    id: `fact-${i + 1}`,
    name: `Factura ${3100 + i}`,
    group: i % 6 === 0 ? group("group_mm21cxe2", "Completadas") : group("topics", "Pendientes"),
    numeroFactura: String(3100 + i),
    oc: ocVinculada ? ocVinculada.numeroOc : "",
    obra: ocVinculada ? ocVinculada.obra : OBRAS[i % OBRAS.length],
    montoConIva: ocVinculada ? Math.round(ocVinculada.monto * (0.4 + (i % 3) * 0.25)) : 420000 + i * 65000,
    fechaFactura: d(-25 + i),
    estado: ESTADOS_FACTURA[i % ESTADOS_FACTURA.length],
    proveedores: ocVinculada ? ocVinculada.proveedores : PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length],
    fechaVencimiento: d(5 + i),
    centroDeCosto: "Obra Gruesa",
    tipoDePago: i % 2 === 0 ? "Transferencia" : "Cheque",
    correoElectrnico: "facturacion@proveedor-demo.cl",
    archivo: "",
  };
});

// ---------------------------------------------------------------------------
// IngresosBoard (material como board_relation -> linkedItems)
// ---------------------------------------------------------------------------
const INGRESOS = Array.from({ length: 14 }, (_, i) => {
  const mat = MATERIALES[i % MATERIALES.length];
  return {
    id: `ing-${i + 1}`,
    name: `Ingreso ${mat.name}`,
    group: group("topics", "Ingresos"),
    material: { linkedItems: [{ id: mat.id, name: mat.name, sourceBoardId: "demo-materiales" }] },
    cantidadIngresada: 20 + (i % 5) * 15,
    estado: i % 6 === 0 ? "PENDIENTE" : "PROCESADO",
    obrabodega: OBRAS[i % OBRAS.length],
    foto: "",
    proveedores: PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length],
  };
});

// ---------------------------------------------------------------------------
// ValesBoard (baseDeDatosMateriales como board_relation -> linkedItems)
// ---------------------------------------------------------------------------
const ESTADOS_VALE = ["SOLICITADA", "ENTREGADA", "NO ENTREGADA"];
const SOLICITANTES_DEMO = ["Francisca Muñoz", "Ignacio Pardo", "Valentina Cáceres"];
const DESTINOS_DEMO = ["Piso 1", "Piso 2", "Subterraneo", "Bodega Central"];
const VALES = Array.from({ length: 16 }, (_, i) => {
  const mat = MATERIALES[(i + 3) % MATERIALES.length];
  return {
    id: `vale-${i + 1}`,
    name: mat.name,
    group: group("topics", "Vales"),
    baseDeDatosMateriales: { linkedItems: [{ id: mat.id, name: mat.name, sourceBoardId: "demo-materiales" }] },
    cantidad: 5 + (i % 6) * 3,
    estado: i < 6 ? "SOLICITADA" : ESTADOS_VALE[i % ESTADOS_VALE.length],
    obra: OBRAS[i % OBRAS.length],
    quienSolicita: SOLICITANTES_DEMO[i % SOLICITANTES_DEMO.length],
    destinoDelMaterial: DESTINOS_DEMO[i % DESTINOS_DEMO.length],
    quienRetira: SOLICITANTES_DEMO[(i + 1) % SOLICITANTES_DEMO.length],
    createdAt: d(-i).toISOString(),
  };
});

// ---------------------------------------------------------------------------
// PagosVdvBoard (group.id = 'group_title' -> Pagado; 'topics'/'new_group' -> pendiente)
// ---------------------------------------------------------------------------
const ESTADOS_PAGO = ["Nuevo", "Pendiente", "En Revisión", "Aprobado", "Listo"];
const PAGOS_VDV = Array.from({ length: 20 }, (_, i) => {
  const pagado = i % 4 === 0;
  const proveedor = PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length];
  return {
    id: `pago-${i + 1}`,
    name: `Pago ${5000 + i}`,
    group: pagado ? group("group_title", "Pagado") : (i % 2 === 0 ? group("topics", "Proveedores") : group("new_group", "Subcontratos")),
    proveedores: proveedor,
    estado: pagado ? "Listo" : ESTADOS_PAGO[i % ESTADOS_PAGO.length],
    obra: OBRAS[i % OBRAS.length],
    monto: 350000 + i * 92000,
    numeroFact: String(4800 + i),
    folioPago: pagado ? String(9000 + i) : "",
    fechaLmite: d(10 - i),
  };
});
// Aseguramos que "Constructora Demo SPA" (usuario subcontratista de prueba) tenga pagos propios.
PAGOS_VDV.push(
  { id: "pago-sub-1", name: "Pago 5100", group: group("group_title", "Pagado"), proveedores: "Constructora Demo SPA", estado: "Listo", obra: "VIK", monto: 4200000, numeroFact: "4900", folioPago: "9100", fechaLmite: d(-3) },
  { id: "pago-sub-2", name: "Pago 5101", group: group("topics", "Proveedores"), proveedores: "Constructora Demo SPA", estado: "En Revisión", obra: "SAMOA", monto: 3100000, numeroFact: "4901", folioPago: "", fechaLmite: d(8) },
);

// ---------------------------------------------------------------------------
// FlujoContratacionSubcontratoBoard
// ---------------------------------------------------------------------------
const ESTADOS_CONTRATO = ["Firmado", "En Proceso", "Sin Efecto"];
const CONTRATOS = Array.from({ length: 10 }, (_, i) => ({
  id: `contrato-${i + 1}`,
  name: `Contrato ${PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length]}`,
  group: group("topics", "Contratos"),
  proveedores: PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length],
  obra: OBRAS[i % OBRAS.length],
  estadoContrato: ESTADOS_CONTRATO[i % ESTADOS_CONTRATO.length],
  estadoFirmas: i % 3 === 0 ? "Firmado" : (i % 3 === 1 ? "En Revisión" : "Pendiente"),
  vbOt: i % 2 === 0 ? "VB" : "Pendiente",
  vpApr: i % 2 === 0 ? "Aprobado" : "Pendiente",
  vbAdministrador: "Aprobado",
  vbAbogado: i % 3 === 0 ? "Pendiente" : "Aprobado",
  vbRepLegal: i % 4 === 0 ? "Pendiente" : "Firmado",
  montoContratoBruto: 12000000 + i * 1450000,
  centroCosto: "Subcontratos",
}));

// ---------------------------------------------------------------------------
// EstadosDePagoSubcontratosBoard
// ---------------------------------------------------------------------------
const ESTADOS_EP = ["Aprobado", "En Revisión", "Pendiente"];
const ESTADOS_DE_PAGO = Array.from({ length: 10 }, (_, i) => ({
  id: `ep-${i + 1}`,
  name: `EP ${100 + i}`,
  group: group("topics", "Estados de Pago"),
  proveedores: PROVEEDORES_NOMBRES[i % PROVEEDORES_NOMBRES.length],
  obra: OBRAS[i % OBRAS.length],
  estado: ESTADOS_EP[i % ESTADOS_EP.length],
  heather: "",
  vbOt: i % 2 === 0 ? "VB" : "Pendiente",
  vbJt: i % 2 === 0 ? "VB" : "Pendiente",
  vbAdm: "Aprobado",
  vbApr: i % 3 === 0 ? "Pendiente" : "Aprobado",
  vbGg: i % 4 === 0 ? "Pendiente" : "Aprobado",
  firmaCaratula: i % 3 === 0 ? "Pendiente" : "Firmado",
  montoPresentado: 8000000 + i * 620000,
  montoCorregido: i % 3 === 0 ? 7800000 + i * 600000 : null,
  numeroFactura: 5200 + i,
}));

const DEMO_BOARDS = {
  OrdenesDeCompraMaxxaBoard: ORDENES_DE_COMPRA,
  FacturasIaBoard: FACTURAS_IA,
  BaseDeDatosMaterialesBoard: MATERIALES,
  IngresosBoard: INGRESOS,
  ValesBoard: VALES,
  ProveedoresBoard: PROVEEDORES,
  PagosVdvBoard: PAGOS_VDV,
  FlujoContratacionSubcontratoBoard: CONTRATOS,
  EstadosDePagoSubcontratosBoard: ESTADOS_DE_PAGO,
};

// ---------------------------------------------------------------------------
// Usuarios de la cuenta demo (login por email en Vale Express / Portal Proveedor).
// Los id "demo-*" son fijos y se resuelven a roles fijos - ver hooks/vale-express/
// useUserRole.js (FIXED_TEST_ROLES) y app/portal-proveedor/page.jsx (FIXED_DEMO_USERS).
// ---------------------------------------------------------------------------
export const DEMO_USERS = [
  // Vale Express - independiente de las cuentas de Portal Proveedor, aunque son
  // el mismo login por email, para que quede claro que son dos sistemas distintos.
  { id: "demo-ve-super-admin", name: "Javiera Rojas", email: "superadmin.valeexpress@demo.vdv.cl", photo_url: null },
  { id: "demo-ve-admin", name: "Matias Fuentealba", email: "admin.valeexpress@demo.vdv.cl", photo_url: null },
  { id: "demo-ve-bodeguero", name: "Cristobal Silva", email: "bodega.valeexpress@demo.vdv.cl", photo_url: null },
  { id: "demo-ve-jefe-obra", name: "Francisca Muñoz", email: "jefeobra.valeexpress@demo.vdv.cl", photo_url: null },
  { id: "demo-ve-apr", name: "Ignacio Pardo", email: "apr.valeexpress@demo.vdv.cl", photo_url: null },
  { id: "demo-emp-ve-1", name: "Valentina Caceres", email: "valentina.caceres@demo.vdv.cl", photo_url: null },
  { id: "demo-emp-ve-2", name: "Diego Herrera", email: "diego.herrera@demo.vdv.cl", photo_url: null },

  // Portal Proveedor
  { id: "demo-pp-super-admin", name: "Camila Vidal", email: "superadmin.portalproveedor@demo.vdv.cl", photo_url: null },
  { id: "demo-pp-admin", name: "Rodrigo Salas", email: "admin.portalproveedor@demo.vdv.cl", photo_url: null },
  { id: "demo-pp-subcontratista", name: "Constructora Demo SPA", email: "subcontratista.portalproveedor@demo.vdv.cl", photo_url: null },
];

function normalizeValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : value.join(", ");
  return value;
}

function matchesWhere(item, where) {
  for (const [key, cond] of Object.entries(where || {})) {
    if (cond == null) continue;
    if (key === "name") {
      if (!String(item.name || "").toLowerCase().includes(String(cond).toLowerCase())) return false;
      continue;
    }
    const val = item[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("eq" in cond) {
        if (String(val ?? "") !== String(cond.eq)) return false;
      } else if (Array.isArray(cond.neq)) {
        if (cond.neq.map(String).includes(String(val ?? ""))) return false;
      } else if (typeof cond.contains === "string") {
        if (!String(val ?? "").toLowerCase().includes(cond.contains.toLowerCase())) return false;
      }
    } else if (String(val ?? "") !== String(cond)) {
      return false;
    }
  }
  return true;
}

export function demoHandleItems(boardKey, params = {}) {
  const { where = {}, limit = 100, cursor = null } = params;
  const all = DEMO_BOARDS[boardKey] || [];
  const filtered = all.filter((it) => matchesWhere(it, where));
  const start = cursor ? Number(cursor) : 0;
  const page = filtered.slice(start, start + limit);
  const nextCursor = start + limit < filtered.length ? String(start + limit) : null;
  return { items: page, cursor: nextCursor };
}

export function demoHandleItemUpdate(boardKey, params = {}) {
  const { itemId, values = {} } = params;
  const items = DEMO_BOARDS[boardKey] || [];
  const item = items.find((it) => String(it.id) === String(itemId));
  if (item) {
    for (const [key, value] of Object.entries(values)) {
      item[key] = normalizeValue(value);
    }
  }
  return { id: itemId };
}

export function demoHandleItemCreate(boardKey, params = {}) {
  const { name, values = {}, returnColumns = [] } = params;
  if (!DEMO_BOARDS[boardKey]) DEMO_BOARDS[boardKey] = [];
  const items = DEMO_BOARDS[boardKey];
  const id = `demo-new-${boardKey}-${items.length + 1}`;
  const newItem = { id, name, group: group("topics", "Nuevo") };
  for (const [key, value] of Object.entries(values)) {
    newItem[key] = normalizeValue(value);
  }
  items.push(newItem);
  if (returnColumns.length) return newItem;
  return { id, name };
}

export function demoHandleUsersList() {
  return DEMO_USERS;
}

/**
 * Contraparte demo de handleColumnOptions (app/api/monday/board/route.js): en
 * modo demo no hay board real del que leer los labels, asi que se sirven las
 * mismas listas que ya usan los items inventados de arriba. Lo que no este aca
 * vuelve vacio y el llamador se queda con su fallback hardcodeado.
 */
const COLUMN_OPTIONS_DEMO = {
  ValesBoard: {
    obra: OBRAS,
    quienSolicita: SOLICITANTES_DEMO,
    destinoDelMaterial: DESTINOS_DEMO,
  },
  IngresosBoard: {
    obrabodega: OBRAS,
  },
  PagosVdvBoard: {
    obra: OBRAS,
  },
  OrdenesDeCompraMaxxaBoard: {
    obra: OBRAS,
    estadoDocumento: ESTADOS_OC,
  },
  BaseDeDatosMaterialesBoard: {
    unidad: [...new Set(MATERIALES.map((m) => m.unidad))],
    categoriaMaterial: ["ESTRUCTURA", "TERMINACIONES", "INSTALACIONES", "EPP", "INSUMO"],
  },
};

export function demoHandleColumnOptions(boardKey, params = {}) {
  return { options: COLUMN_OPTIONS_DEMO[boardKey]?.[params.column] ?? [] };
}

export function demoHandleUsersMe() {
  return { id: DEMO_USERS[0].id, name: DEMO_USERS[0].name, email: DEMO_USERS[0].email, photo_url: null };
}

// Usado por el fallback del proxy /api/monday/graphql en modo demo (move_item_to_group,
// paginacion con next_items_page, etc.) - ver app/api/monday/graphql/route.js.
export function demoMoveItemToGroup(itemId, groupId) {
  for (const items of Object.values(DEMO_BOARDS)) {
    const item = items.find((it) => String(it.id) === String(itemId));
    if (item) {
      item.group = group(groupId, groupId);
      return { id: itemId };
    }
  }
  return { id: itemId };
}
