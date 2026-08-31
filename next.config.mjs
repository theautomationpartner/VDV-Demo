// CSP: script-src NECESITA 'unsafe-inline' - Next.js App Router inyecta sus
// propios <script> inline sin nonce para el payload de RSC/hidratacion
// (self.__next_f.push(...)) en TODAS las paginas, esten o no marcadas
// dinamicas. Sin 'unsafe-inline' el navegador bloquea esos scripts y la app
// nunca hidrata - queda la pantalla cargada pero sin reaccionar a nada
// (asi se detecto: "no carga nada, se queda esperando" en produccion).
// La alternativa correcta es CSP con nonce por request (ver
// node_modules/next/dist/docs/.../content-security-policy.md), pero eso
// obliga a renderizado dinamico en TODAS las paginas (hoy son casi todas
// estaticas) - cambio de arquitectura más grande, no algo para resolver a las
// apuradas mientras la app esta rota. style-src tambien necesita
// 'unsafe-inline' por los style={{...}} de React (compilan a atributo style=""
// inline). Los estilos de tema (styles/theme-*.css) importan Google Fonts via
// @import url(...), de ahi el permiso a fonts.googleapis.com/fonts.gstatic.com.
// img-src permite https: porque las fotos de usuario vienen de la URL que
// devuelve la API de monday.com (host variable, no documentado).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// El PDF de una Orden de Compra se muestra dentro de la app en un <iframe>, y
// para eso ESA RUTA -y solo esa- tiene que permitir que la enmarque nuestro
// propio origen. Con el DENY general el navegador la bloquea aunque el marco
// sea de la misma pagina.
//
// Lo demas sigue igual de cerrado: 'self' permite que la enmarquemos nosotros,
// nadie mas. Es el mismo archivo que ya servimos, sin cambiar quien lo puede
// pedir (la ruta exige sesion).
const RUTA_PDF = "/api/generador-oc/documento";

const HEADERS_PDF = SECURITY_HEADERS.map((h) => {
  if (h.key === "X-Frame-Options") return { key: h.key, value: "SAMEORIGIN" };
  if (h.key === "Content-Security-Policy") {
    return { key: h.key, value: CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") };
  }
  return h;
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: RUTA_PDF, headers: HEADERS_PDF },
      // Todo lo demas. La ruta del PDF se excluye a proposito: si coincidiera
      // con las dos reglas, las cabeceras duplicadas quedarian indefinidas.
      { source: "/((?!api/generador-oc/documento).*)", headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
