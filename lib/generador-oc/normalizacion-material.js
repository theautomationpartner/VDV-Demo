/**
 * Normalizacion de nombres de material, para poder comparar precios entre
 * compras distintas.
 *
 * Lo que resuelve: tildes, mayusculas, abreviaturas ("Kilos" = "KG"), numeros
 * pegados a la unidad ("25KG" = "25 KG") y palabras de relleno. Verificado:
 * "PLANCHA YESO CARTON ST 10" y "Plancha yeso cartón ST 10" quedan identicos.
 *
 * Lo que NO resuelve, y es a proposito: toda la informacion numerica y
 * dimensional se conserva, asi que "YESO CARTON 10 MM" y "YESO CARTON 15 MM"
 * quedan distintos - son productos distintos y compararles el precio seria un
 * error. Por la misma razon "CEMENTO MELON 25KG" y "Cemento Melon SACO 25 kg"
 * tampoco quedan identicos: "SACO" no es una palabra de relleno. Ese caso lo
 * levanta compararMateriales como coincidencia probable, no como exacta.
 */

/** Familias de unidades convertibles entre si, con su factor a la unidad base. */
const FAMILIAS = {
  KG: { familia: "PESO", factor: 1 },
  G: { familia: "PESO", factor: 0.001 },
  TN: { familia: "PESO", factor: 1000 },
  L: { familia: "VOLUMEN", factor: 1 },
  ML: { familia: "VOLUMEN", factor: 0.001 },
  M: { familia: "LARGO", factor: 1 },
  CM: { familia: "LARGO", factor: 0.01 },
  MM: { familia: "LARGO", factor: 0.001 },
  M2: { familia: "AREA", factor: 1 },
  M3: { familia: "VOLUMEN_M", factor: 1 },
  UN: { familia: "CONTEO", factor: 1 },
};

/** Sinonimos y abreviaciones a su forma canonica. Se aplican sobre tokens completos. */
const SINONIMOS = {
  KILO: "KG", KILOS: "KG", KILOGRAMO: "KG", KILOGRAMOS: "KG", KGS: "KG", KG: "KG",
  GR: "G", GRS: "G", GRAMO: "G", GRAMOS: "G", G: "G",
  TON: "TN", TONELADA: "TN", TONELADAS: "TN", TN: "TN",
  LITRO: "L", LITROS: "L", LT: "L", LTS: "L", L: "L",
  MILILITRO: "ML", MILILITROS: "ML", ML: "ML",
  METRO: "M", METROS: "M", MT: "M", MTS: "M", MTR: "M", M: "M",
  CENTIMETRO: "CM", CENTIMETROS: "CM", CM: "CM",
  MILIMETRO: "MM", MILIMETROS: "MM", MM: "MM",
  M2: "M2", MC: "M3", M3: "M3",
  UNIDAD: "UN", UNIDADES: "UN", UNID: "UN", UNI: "UN", UN: "UN", UND: "UN",
  PZA: "UN", PIEZA: "UN", PIEZAS: "UN", CU: "UN",
  PULGADA: "PULG", PULGADAS: "PULG", PULG: "PULG",
};

/** Palabras que no aportan identidad al producto. */
const RELLENO = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "POR", "CON", "SIN", "Y", "O", "A",
  "TIPO", "MARCA", "COLOR", "APROX", "APROXIMADO",
]);

function sinTildes(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lleva un nombre de material a una forma canonica comparable. */
export function normalizarMaterial(nombre) {
  if (!nombre) return "";

  let t = sinTildes(nombre).toUpperCase();

  // Decimales con coma a punto: 42,5 KG -> 42.5 KG
  t = t.replace(/(\d),(\d)/g, "$1.$2");

  // Numeral: #2 / N°2 / NRO 2 -> N 2
  t = t.replace(/#/g, " N ").replace(/N[º°]/g, " N ").replace(/\bNRO\b/g, "N");

  // Pulgadas: 1/2" -> 1/2 PULG
  t = t.replace(/"/g, " PULG ");

  // Numero pegado a letra: 25KG -> 25 KG ; PLACA10MM -> PLACA 10 MM
  t = t.replace(/(\d)([A-Z])/g, "$1 $2").replace(/([A-Z])(\d)/g, "$1 $2");

  // Signos a espacio, conservando el punto decimal y la barra de fracciones.
  t = t.replace(/[^A-Z0-9./\s]/g, " ");
  t = t.replace(/(?<!\d)\.(?!\d)/g, " ");

  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => SINONIMOS[tok] ?? tok)
    .filter((tok) => !RELLENO.has(tok))
    .join(" ")
    .trim();
}

/** Los tokens con numeros: cantidades y dimensiones. */
export function tokensNumericos(normalizado) {
  return normalizado
    .split(" ")
    .filter((tok) => /\d/.test(tok))
    .sort();
}

/** Los tokens de texto: la identidad del producto (nombre, marca, modelo). */
export function tokensTexto(normalizado) {
  return normalizado.split(" ").filter((tok) => tok.length > 1 && !/\d/.test(tok));
}

/**
 * La presentacion declarada en la descripcion.
 * "CAVE BOND 5 KG" -> { cantidad: 5, unidad: "KG" }
 *
 * Devuelve null si hay mas de una o ninguna: con dos numeros con unidad no se
 * puede saber cual es la presentacion y cual una medida del producto.
 */
export function detectarPresentacion(nombre) {
  const normalizado = normalizarMaterial(nombre);
  const regex = /(\d+(?:\.\d+)?)\s+(KG|G|TN|L|ML|M2|M3|M|CM|MM|UN)\b/g;
  const encontrados = [];

  let match = regex.exec(normalizado);
  while (match !== null) {
    if (match[1] && match[2]) encontrados.push({ cantidad: match[1], unidad: match[2] });
    match = regex.exec(normalizado);
  }

  if (encontrados.length !== 1) return null;

  const cantidad = parseFloat(encontrados[0].cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;

  return { cantidad, unidad: encontrados[0].unidad };
}

/** "Kilos" -> "KG". */
export function normalizarUnidad(unidad) {
  if (!unidad) return "";
  const t = sinTildes(unidad).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return SINONIMOS[t] ?? t;
}

/** La familia de conversion de una unidad, o null si no se reconoce. */
export function familiaUnidad(unidad) {
  return FAMILIAS[normalizarUnidad(unidad)]?.familia ?? null;
}

const BASE_POR_FAMILIA = {
  PESO: "KG",
  VOLUMEN: "L",
  LARGO: "M",
  AREA: "M2",
  VOLUMEN_M: "M3",
  CONTEO: "UN",
};

/** Lleva una cantidad a la unidad base de su familia. null si la unidad no se conoce. */
export function aUnidadBase(cantidad, unidad) {
  const info = FAMILIAS[normalizarUnidad(unidad)];
  if (!info) return null;
  return { cantidad: cantidad * info.factor, unidad: BASE_POR_FAMILIA[info.familia] ?? "UN" };
}

/**
 * El precio por unidad base a partir del precio de una presentacion.
 * "CAVE BOND 5 KG" a $22.500 -> { precio: 4500, unidad: "KG" }
 * null cuando la presentacion no se puede determinar con certeza.
 */
export function precioPorUnidadBase(nombre, precioUnitario) {
  const presentacion = detectarPresentacion(nombre);
  if (!presentacion) return null;

  const base = aUnidadBase(presentacion.cantidad, presentacion.unidad);
  if (!base || base.cantidad <= 0) return null;

  return { precio: precioUnitario / base.cantidad, unidad: base.unidad };
}
