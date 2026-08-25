// CSP: style-src necesita 'unsafe-inline' porque varias paginas usan style={{...}}
// de React (compila a un atributo style="" inline, no a JS) - Next no inyecta
// nonces automaticamente para eso. script-src se queda en 'self' porque no hay
// ningun <script> inline propio ni onclick="" en el codigo (React usa
// delegacion de eventos, no atributos inline). Los estilos de tema
// (styles/theme-*.css) importan Google Fonts vía @import url(...), de ahi el
// permiso a fonts.googleapis.com/fonts.gstatic.com. img-src permite https:
// porque las fotos de usuario vienen de la URL que devuelve la API de
// monday.com (host variable, no documentado).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
