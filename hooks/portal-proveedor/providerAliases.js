/**
 * Provider alias mapping.
 * Key = canonical display name shown in login.
 * Value = array of ALL name variants that exist in the Proveedores board.
 * When fetching data, ALL variants are queried and results are merged.
 *
 * To add more consolidations, simply add a new entry here.
 */
export const PROVIDER_ALIASES = {
  'CONSTRUCCIONES FCA SPA': [
    'CONSTRUCTORA FCA',
    'CONSTRUCCIONES FCA SPA',
    'CONSTRUCCIONES FCA SPA II',
  ],
};

// Build reverse lookup: variant name -> canonical name. Si la misma variante
// aparece en dos grupos canonicos distintos (typo/copy-paste al agregar una
// consolidacion), _reverseLookup.set() la pisaba en silencio con el ultimo
// grupo procesado - fusionando los datos de dos proveedores distintos bajo un
// mismo nombre sin ningun aviso. Ahora se valida al cargar el modulo y explota
// temprano (build/arranque) en vez de fallar en silencio en produccion.
const _reverseLookup = new Map();
Object.entries(PROVIDER_ALIASES).forEach(([canonical, variants]) => {
  variants.forEach((v) => {
    const key = v.toUpperCase();
    const existing = _reverseLookup.get(key);
    if (existing && existing !== canonical) {
      throw new Error(
        `providerAliases.js: la variante "${v}" esta en dos grupos distintos ("${existing}" y "${canonical}") - revisar PROVIDER_ALIASES antes de que esto fusione datos de dos proveedores.`
      );
    }
    _reverseLookup.set(key, canonical);
  });
});

/**
 * Given a raw provider name, return the canonical display name.
 * If the name is not in any alias group, returns the original name.
 */
export function getCanonicalName(rawName) {
  if (!rawName) return rawName;
  return _reverseLookup.get(rawName.toUpperCase()) || rawName;
}

/**
 * Given a canonical (or any) provider name, return all variant names
 * that should be queried to get the full dataset.
 * If the name is not in any alias group, returns [name].
 */
export function getAllVariants(name) {
  if (!name) return [name];
  // Check if it's a canonical name directly
  if (PROVIDER_ALIASES[name]) return PROVIDER_ALIASES[name];
  // Check if it's a variant - resolve to canonical, then return all variants
  const canonical = _reverseLookup.get(name.toUpperCase());
  if (canonical && PROVIDER_ALIASES[canonical]) return PROVIDER_ALIASES[canonical];
  // No aliases - return as-is
  return [name];
}

/**
 * Given a list of raw provider names from the board,
 * returns a deduplicated list using canonical names.
 */
export function deduplicateProviders(rawNames) {
  const seen = new Set();
  const result = [];
  rawNames.forEach((name) => {
    const canonical = getCanonicalName(name);
    if (!seen.has(canonical.toUpperCase())) {
      seen.add(canonical.toUpperCase());
      result.push(canonical);
    }
  });
  return result.sort();
}
