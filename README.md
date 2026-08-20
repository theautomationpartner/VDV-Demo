# VDV Suite

App unificada que fusiona 3 apps originalmente hechas como monday.com Vibe Apps —
**OC Tracker**, **Vale Express** y **Portal Proveedor** — en un solo proyecto Next.js
con un sidebar global compartido.

## Requisitos

- Node.js 18+
- Una cuenta de monday.com con un API token y los boards reales de cada app (para ver datos).

## Arrancar en local

```bash
npm install
cp .env.local.example .env.local   # completar con tus valores (ver abajo)
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

> **Nota Windows/OneDrive**: el script `dev` usa `next dev --webpack` en vez del
> Turbopack por defecto. Turbopack crashea (`0xc0000142`) cuando el proyecto vive
> dentro de una carpeta sincronizada por OneDrive en Windows. No lo cambies a menos
> que muevas el proyecto fuera de OneDrive.

## Configurar la conexión a monday.com

Sin `.env.local` configurado, la app carga y navega igual (sidebar, rutas, login),
pero las pantallas que muestran datos de boards van a mostrar un error de
"falta configuración" en vez de romperse.

1. Conseguí tu API token en monday.com: **Perfil → Administración → API**.
2. Para cada board real de tu cuenta, copiá su `board_id` (aparece en la URL del
   board: `https://<cuenta>.monday.com/boards/<ESTE_NUMERO>`).
3. Completá `.env.local` con el token y los 9 board IDs (ver `.env.local.example`).
4. **Completá los `column_id` reales** en `lib/board-schemas.js`. Los nombres de
   columna "amigables" que usa el código (`numeroOc`, `estadoDocumento`, etc.) están
   mapeados ahí a un placeholder `"REPLACE_ME"` — hay que reemplazarlos por el id
   real de columna de tu board. Para encontrarlos, corré esta query en el
   [GraphQL Playground de monday](https://monday.com/developers/v2/try-it-yourself)
   con tu token:
   ```graphql
   { boards(ids: [TU_BOARD_ID]) { columns { id title } } }
   ```
   Buscá la columna por su `title` (como se ve en la UI del board) y copiá su `id`.

## Arquitectura

- **Next.js App Router**, JS (sin TypeScript) para minimizar la reescritura del
  código fuente original.
- **`lib/board-sdk.js`**: reconstrucción del SDK propietario de monday Vibe Apps
  (`@api/BoardSDK`). Mismo contrato encadenado que el código original
  (`board.items().withColumns().where().execute()`, etc.), pero le pega a
  `/api/monday/board` en vez de a monday directamente — el token nunca llega al navegador.
- **`lib/storage.js`**: reconstrucción de `@skills/monday-storage.jsx` (roles y
  usuarios de Vale Express / Portal Proveedor). Persiste en `data/storage.json`
  (JSON local) en vez del storage nativo de monday Apps, porque ese storage
  requiere que la app esté instalada dentro del iframe de monday.com.
- **`styles/theme-*.css`**: cada una de las 3 apps mantiene su paleta y radios
  originales, escopeados bajo `[data-app="oc-tracker"]` / `[data-app="vale-express"]`
  / `[data-app="portal-proveedor"]`, para no mezclar los 3 temas entre sí.
- **`components/layout/AppSidebar.jsx`** + **`lib/nav-config.js`**: sidebar global
  con las 3 apps como secciones; la de Portal Proveedor reemplaza el sidebar propio
  que tenía esa app.

## Autenticación (solo para uso local)

Vale Express y Portal Proveedor usan un login manual por email (sin contraseña),
matcheando contra los usuarios ("subscribers") del board correspondiente en
monday.com. Esto reproduce fielmente el comportamiento original, pero **no es
seguro para exponer en internet** — antes de deployar a Vercel/DigitalOcean hay que
reemplazarlo por autenticación real (contraseña hasheada, magic link, o similar).

## Deploy futuro

- El storage en `data/storage.json` (JSON en disco) **no sirve en Vercel**
  (filesystem no persistente) — hay que migrarlo a una base de datos real antes de
  deployar ahí.
- En DigitalOcean (droplet/App Platform con filesystem persistente) el storage
  actual sigue funcionando tal cual.
