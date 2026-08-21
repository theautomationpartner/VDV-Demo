-- Esquema de autenticacion standalone: whitelist de emails + 2FA (TOTP) como
-- unica puerta de entrada a la app (link publico, sin depender del iframe de
-- monday.com). Se corre una sola vez con `node scripts/migrate.js` (usa
-- DATABASE_URL). Todas las tablas son IF NOT EXISTS, correrlo de nuevo no rompe
-- nada.

CREATE TABLE IF NOT EXISTS usuarios_autorizados (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  nombre            TEXT,                   -- nombre para mostrar (sidebar, etc)
  monday_user_id    BIGINT,                 -- opcional, solo referencia/futuro uso
  rol               TEXT NOT NULL DEFAULT 'usuario',  -- 'admin' | 'usuario' (administra la whitelist)
  estado            TEXT NOT NULL DEFAULT 'activo',   -- 'activo' | 'revocado'
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso     TIMESTAMPTZ,
  -- A que app pertenece esta cuenta (cada persona es de UNA sola, ver
  -- lib/client/fixed-accounts.js) y que rol tiene ADENTRO de esa app - distinto
  -- de `rol` de arriba, que es solo para el panel de whitelist. app_config
  -- guarda los extras especificos de cada app: obras/restrictObras en Vale
  -- Express, proveedorName en Portal Proveedor.
  app               TEXT,                   -- 'vale-express' | 'portal-proveedor' | null
  app_rol           TEXT,                   -- super_admin | admin | bodeguero | jefe_obra | apr | subcontratista
  app_config        JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- La tabla ya existia en produccion antes de estas 3 columnas - CREATE TABLE
-- IF NOT EXISTS de arriba no las agrega a una tabla preexistente, hace falta
-- este ALTER idempotente aparte.
ALTER TABLE usuarios_autorizados ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE usuarios_autorizados ADD COLUMN IF NOT EXISTS app TEXT;
ALTER TABLE usuarios_autorizados ADD COLUMN IF NOT EXISTS app_rol TEXT;
ALTER TABLE usuarios_autorizados ADD COLUMN IF NOT EXISTS app_config JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS mfa_usuarios (
  usuario_id        INTEGER PRIMARY KEY REFERENCES usuarios_autorizados (id) ON DELETE CASCADE,
  secreto_cifrado   TEXT NOT NULL,          -- AES-256-GCM, clave en MFA_ENCRYPTION_KEY
  confirmado_en     TIMESTAMPTZ,
  ultimo_periodo    BIGINT,                 -- anti-reutilizacion de codigo TOTP
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_codigos_recuperacion (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios_autorizados (id) ON DELETE CASCADE,
  hash_codigo       TEXT NOT NULL,          -- sha256, nunca en texto plano
  usado_en          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mfa_codigos_recuperacion_user ON mfa_codigos_recuperacion (usuario_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER,
  email             TEXT,
  accion            TEXT NOT NULL,          -- 'ingreso_ok' | 'no_autorizado' | 'mfa_fallido' | 'mfa_ok' | ...
  ip                TEXT,
  detalle           JSONB,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_creado_en ON auditoria (creado_en DESC);
-- Usados por lib/server/rate-limit.js para contar intentos recientes por
-- cuenta o por IP sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_accion ON auditoria (usuario_id, accion, creado_en);
CREATE INDEX IF NOT EXISTS idx_auditoria_ip_accion ON auditoria (ip, accion, creado_en);
