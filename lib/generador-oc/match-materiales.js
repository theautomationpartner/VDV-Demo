/**
 * Compara dos materiales y decide si sus precios se pueden comparar.
 *
 * Prioriza la precision sobre la cobertura: ante la duda NO declara comparable.
 * Una alerta equivocada ("estas pagando 40% de mas") sobre dos productos que en
 * realidad son distintos es peor que no avisar nada.
 */
import {
  normalizarMaterial,
  normalizarUnidad,
  familiaUnidad,
  tokensNumericos,
  tokensTexto,
  detectarPresentacion,
} from "./normalizacion-material";

/** Coeficiente de Dice sobre conjuntos de tokens (0 a 1). */
function dice(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let comunes = 0;
  setA.forEach((tok) => {
    if (setB.has(tok)) comunes += 1;
  });
  return (2 * comunes) / (setA.size + setB.size);
}

/**
 * Compara dos nombres de material.
 *
 * Regla dura: si los tokens numericos difieren (10 MM contra 15 MM, 25 KG
 * contra 42.5 KG) nunca puede ser EXACTO ni MUY_PROBABLE. Son presentaciones o
 * especificaciones distintas.
 */
export function compararMateriales(nombreA, nombreB) {
  const normA = normalizarMaterial(nombreA);
  const normB = normalizarMaterial(nombreB);

  if (!normA || !normB) return { nivel: "NO_COMPARABLE", score: 0 };
  if (normA === normB) return { nivel: "EXACTO", score: 1 };

  const numsIguales = tokensNumericos(normA).join("|") === tokensNumericos(normB).join("|");
  const scoreTexto = dice(tokensTexto(normA), tokensTexto(normB));

  if (numsIguales) {
    if (scoreTexto >= 0.85) return { nivel: "MUY_PROBABLE", score: scoreTexto };
    if (scoreTexto >= 0.6) return { nivel: "POSIBLE", score: scoreTexto };
    return { nivel: "NO_COMPARABLE", score: scoreTexto };
  }

  // Difieren dimensiones o formato: como maximo un posible relacionado.
  if (scoreTexto >= 0.7) return { nivel: "POSIBLE", score: scoreTexto * 0.7 };
  return { nivel: "NO_COMPARABLE", score: scoreTexto * 0.5 };
}

/**
 * Decide si una linea nueva y una compra anterior se pueden comparar en precio.
 * Exige las tres cosas: mismo material, misma moneda y unidades equivalentes.
 */
export function evaluarComparacion(actual, historico) {
  const match = compararMateriales(actual.nombre, historico.nombre);

  if (match.nivel === "NO_COMPARABLE") {
    return { nivel: match.nivel, score: match.score, comparable: false, base: "UNIDAD_COMPRA" };
  }

  // Las monedas no se convierten nunca en automatico: un tipo de cambio viejo
  // daria una alerta falsa.
  if ((actual.moneda || "").toUpperCase() !== (historico.moneda || "").toUpperCase()) {
    return {
      nivel: match.nivel,
      score: match.score,
      comparable: false,
      base: "UNIDAD_COMPRA",
      motivo: "Moneda distinta: no se aplican conversiones automáticas.",
    };
  }

  const uA = normalizarUnidad(actual.unidad);
  const uB = normalizarUnidad(historico.unidad);
  const dudoso = match.nivel === "POSIBLE";

  // Misma unidad de compra: comparacion directa.
  if (uA && uA === uB) {
    return {
      nivel: match.nivel,
      score: match.score,
      comparable: !dudoso,
      base: "UNIDAD_COMPRA",
      motivo: dudoso ? "Coincidencia no concluyente." : undefined,
    };
  }

  // Unidades distintas pero las dos presentaciones son conocidas y de la misma
  // familia: se puede comparar el precio por unidad base ($/KG, $/L, $/M).
  const presA = detectarPresentacion(actual.nombre);
  const presB = detectarPresentacion(historico.nombre);
  const famA = presA ? familiaUnidad(presA.unidad) : familiaUnidad(uA);
  const famB = presB ? familiaUnidad(presB.unidad) : familiaUnidad(uB);

  if (presA && presB && famA && famB && famA === famB) {
    return {
      nivel: match.nivel,
      score: match.score,
      comparable: !dudoso,
      base: "UNIDAD_BASE",
      motivo: dudoso ? "Coincidencia no concluyente." : undefined,
    };
  }

  return {
    nivel: match.nivel,
    score: match.score,
    comparable: false,
    base: "UNIDAD_COMPRA",
    motivo: "No hay información suficiente para comparar las unidades.",
  };
}

/** El token mas distintivo del nombre, usado como semilla de busqueda. */
export function tokenPrincipal(nombre) {
  const tokens = tokensTexto(normalizarMaterial(nombre));
  if (tokens.length === 0) return normalizarMaterial(nombre).slice(0, 12);
  return tokens.reduce((mejor, tok) => (tok.length > mejor.length ? tok : mejor), tokens[0] ?? "");
}

/** El segundo token mas distintivo, para ampliar la busqueda de candidatos. */
export function tokenSecundario(nombre) {
  const principal = tokenPrincipal(nombre);
  const tokens = tokensTexto(normalizarMaterial(nombre)).filter((t) => t !== principal);
  if (tokens.length === 0) return null;
  return tokens.reduce((mejor, tok) => (tok.length > mejor.length ? tok : mejor), tokens[0] ?? "");
}
