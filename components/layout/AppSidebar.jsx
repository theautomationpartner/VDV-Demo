"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, LogOut, UserCog, MoreHorizontal } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav-config";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { cn } from "@/lib/utils";
import { useUserRole, ROLES } from "@/hooks/vale-express/useUserRole";
import { getGlobalEmail, getGlobalApps } from "@/lib/client/fixed-accounts";
import { limpiarCachePersistente } from "@/lib/client/cache-persistente";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const COLLAPSE_KEY = "sidebar_collapsed";

// Foco visible consistente (teclado) en todos los controles interactivos del
// sidebar/nav movil - mismo anillo en los dos, para cumplir WCAG 2.1 AA de
// navegacion por teclado sin depender del estado hover-only.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]";

// Portal Proveedor tiene su propio vocabulario de roles (no pasa por
// hooks/vale-express/useUserRole.js), asi que no comparte el mapa ROLES de
// arriba - se etiqueta aca mismo.
const PP_ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Administrador",
  subcontratista: "Subcontratista",
};

function humanizeEmailLocalPart(email) {
  if (!email) return null;
  const local = email.split("@")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "?";
}

/**
 * No hay un login/usuario unico todavia (ver useSidebarRoles arriba) - esta
 * identidad "quien esta logeado" se arma leyendo las mismas 3 fuentes que ya
 * usa el resto del sidebar: sesion de Portal Proveedor > sesion de Vale
 * Express > email global (login legado / cuenta sin app asignada). Se re-lee
 * en cada cambio de ruta por la misma razon que useSidebarRoles.
 */
function useCurrentUser(pathname, veRole) {
  const [identity, setIdentity] = useState({ name: null, email: null, roleLabel: null });

  useEffect(() => {
    const email = getGlobalEmail();
    const ppSession = readSession("pp_session");
    const veSession = readSession("ve_session");

    if (ppSession?.adminName) {
      setIdentity({
        name: ppSession.adminName,
        email,
        roleLabel: PP_ROLE_LABELS[ppSession.role] ?? ppSession.role ?? null,
      });
    } else if (veSession?.userName) {
      setIdentity({
        name: veSession.userName,
        email,
        roleLabel: veRole ? (ROLES[veRole]?.label ?? veRole) : null,
      });
    } else {
      setIdentity({ name: humanizeEmailLocalPart(email), email, roleLabel: null });
    }
  }, [pathname, veRole]);

  return { ...identity, initials: initialsFor(identity.name) };
}

/**
 * `homeApps` son las apps asignadas a la cuenta (null = todavia no se sabe, o
 * login legado: no se restringe nada).
 *
 * Un item puede declarar `app`: entonces solo se muestra si la cuenta tiene esa
 * app. Lo necesita el Generador de OC, que se muestra dentro de OC Tracker pero
 * sigue siendo una app aparte para los permisos - y como OC Tracker se le
 * muestra a cualquier sesion valida, sin este control el Generador quedaria a
 * la vista de todos.
 */
function isItemVisible(item, role, homeApps) {
  if (item.app && homeApps !== null && !homeApps.includes(item.app)) return false;
  if (item.roles === null) return true;
  if (role === undefined) return true;
  return item.roles.includes(role);
}

function readSession(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Cada app maneja su propia sesion en localStorage (no hay un login unico todavia).
 * Este hook las lee y resuelve el rol de cada una para poder filtrar la nav anidada
 * del sidebar global. Se re-lee en cada cambio de ruta porque el login de cada app
 * navega client-side (sin recargar la pagina) despues de escribir en localStorage.
 */
function useSidebarRoles(pathname) {
  const [veUserId, setVeUserId] = useState(undefined);
  const [ppRole, setPpRole] = useState(undefined);
  const [ocRole, setOcRole] = useState(undefined);

  useEffect(() => {
    const veSession = readSession("ve_session");
    setVeUserId(veSession?.userId ?? undefined);

    const ppSession = readSession("pp_session");
    setPpRole(ppSession?.role ?? undefined);

    const ogSession = readSession("og_session");
    setOcRole(ogSession?.role ?? undefined);
  }, [pathname]);

  const { role: veRole } = useUserRole(veUserId);

  return {
    "vale-express": veUserId === undefined ? undefined : veRole,
    "portal-proveedor": ppRole,
    "generador-oc": ocRole,
  };
}

/**
 * Cada una de las 8 cuentas fijas (login global, ver lib/client/fixed-accounts.js)
 * es de UNA sola app - Vale Express o Portal Proveedor, nunca las dos. El
 * sidebar no debe ofrecer la seccion que esa cuenta no puede usar (evita el
 * "login" confuso de esa app al entrar por curiosidad). null = no hay cuenta
 * global conocida todavia (AUTH_LAYERS_ENABLED=false / login legado): no
 * restringe nada, mismo comportamiento de siempre.
 */
function useHomeApps(pathname) {
  // null = todavia no sabemos (no hay cuenta global conocida, login legado) -
  // distinto de [] (cuenta conocida, pero sin ninguna app asignada).
  const [homeApps, setHomeApps] = useState(null);

  useEffect(() => {
    const email = getGlobalEmail();
    setHomeApps(email ? getGlobalApps() : null);
  }, [pathname]);

  return homeApps;
}

/**
 * /admin/whitelist no tiene rol propio - el acceso sale de los mismos roles
 * de cada app (los que ya calcula useSidebarRoles): 'admin' o 'super_admin'
 * en CUALQUIERA de las 2 (Vale Express o Portal Proveedor) alcanza para
 * entrar. El servidor decide ahi adentro si puede editar o solo ver.
 */
function canSeeWhitelist(roles) {
  return ["vale-express", "portal-proveedor", "generador-oc"].some(
    (app) => roles[app] === "admin" || roles[app] === "super_admin",
  );
}

/**
 * Estado colapsado del rail de escritorio. Persiste en localStorage como el
 * resto de las sesiones por-app (readSession de arriba). En movil no aplica
 * (ahi no hay rail, ver bottom nav mas abajo), asi que no depende de
 * viewport para el valor inicial.
 */
function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(COLLAPSE_KEY);
    } catch {
      stored = null;
    }
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  const persistCollapsed = (value) => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(value));
    } catch {
      // localStorage no disponible (modo privado, cuota) - el estado sigue funcionando en memoria
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  };

  // Fuerza el rail a ancho (a diferencia de toggleCollapsed, no alterna): la usa
  // el click en una seccion estando colapsado, para desplegar el rail y su
  // submenu en un solo gesto en vez de tener que abrir el rail primero.
  const expand = () => {
    setCollapsed(false);
    persistCollapsed(false);
  };

  return { collapsed, toggleCollapsed, expand };
}

/**
 * Si un item del menu es el que se esta viendo.
 *
 * Se mira tambien lo que va despues del "?": hay secciones que se distinguen
 * solo por ahi. En el Generador de OC, el historial es /generador-oc y el
 * formulario /generador-oc?nueva=1; comparando solo la ruta, el historial
 * quedaba marcado siempre, incluso estando en el formulario.
 */
function itemActivo(item, hermanos, pathname, search) {
  const [ruta, query] = item.href.split("?");
  if (pathname !== ruta) return false;

  const puestos = new URLSearchParams(search);
  const pide = (q) => [...new URLSearchParams(q)].every(([k, v]) => puestos.get(k) === v);

  if (query) return pide(query);

  // El item sin parametros propios queda activo salvo que otro de la misma
  // seccion pida justo los que hay puestos. Asi los filtros de otras
  // pantallas (?estado=..., ?obra=...) no le apagan la marca.
  return !hermanos.some(
    (otro) => otro !== item && otro.href.startsWith(`${ruta}?`) && pide(otro.href.split("?")[1]),
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  // Lo que va despues del "?": hace falta para saber que item del menu esta
  // activo cuando dos comparten la misma ruta (ver itemActivo).
  const search = useSearchParams().toString();
  const roles = useSidebarRoles(pathname);
  const homeApps = useHomeApps(pathname);
  const isWhitelistAdmin = canSeeWhitelist(roles);
  const { collapsed, toggleCollapsed, expand } = useSidebarCollapse();
  const currentUser = useCurrentUser(pathname, roles["vale-express"]);
  const [moreOpen, setMoreOpen] = useState(false);
  // En una ruta publica (el QR de una OC) quien mira es un proveedor: no tiene
  // por que ver el menu interno ni los nombres de los modulos.
  const publica = esRutaPublica(pathname);

  // OC Tracker no tiene dueño (cualquier cuenta lo puede ver); Vale Express y
  // Portal Proveedor solo se muestran si estan entre las apps asignadas a la
  // cuenta global actual (puede ser mas de una), o si todavia no hay ninguna
  // cuenta global conocida (login legado).
  const visibleSections = NAV_SECTIONS.filter(
    (section) => section.key === "oc-tracker" || homeApps === null || homeApps.includes(section.key)
  );

  const activeSection =
    visibleSections.find((section) =>
      [section.basePath, ...(section.rutasExtra ?? [])].some((ruta) => pathname.startsWith(ruta)),
    ) ?? null;

  // Acordeon de un solo nivel abierto a la vez, solo para el rail de
  // escritorio. La seccion activa (segun la ruta actual) arranca expandida;
  // navegar a otra seccion la vuelve a abrir.
  const [expandedKey, setExpandedKey] = useState(activeSection?.key ?? null);

  useEffect(() => {
    if (activeSection) setExpandedKey(activeSection.key);
  }, [activeSection?.key]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Con el rail colapsado, un click en la seccion la despliega en un solo
  // gesto: expande el rail a ancho completo y abre el acordeon de esa
  // seccion, en vez de requerir abrir el rail primero y despues elegirla.
  const toggleSection = (key) => {
    if (collapsed) {
      expand();
      setExpandedKey(key);
      return;
    }
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  // Cierra la sesion global (whitelist + 2FA, cookie httpOnly) y las sesiones
  // por-app (Vale Express / Portal Proveedor, en localStorage). Recarga entera
  // para que AuthGate vuelva a pedir login desde cero, sin arrastrar estado.
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Si la sesion global no esta activada (AUTH_LAYERS_ENABLED=false) esta
      // ruta puede no tener nada que hacer - no bloquea el resto del logout.
    }
    try {
      localStorage.removeItem("ve_session");
      localStorage.removeItem("pp_session");
      localStorage.removeItem("og_session");
      localStorage.removeItem("vdv_global_email");
    } catch {
      // localStorage no disponible (modo privado) - igual redirige.
    }
    // Los datos cacheados en el navegador (pagos, contratos, OCs) tambien se
    // van: si no, el proximo que entre en esta pestaña veria de entrada lo que
    // estaba mirando el anterior.
    limpiarCachePersistente();
    window.location.href = "/";
  };

  if (publica) return null;

  return (
    <>
      {/* ---------- Escritorio (md+): rail lateral colapsable, sin cambios de comportamiento ---------- */}
      <aside
        data-app="shell"
        data-collapsed={collapsed}
        className={cn(
          // sticky y no fixed: el menu se queda quieto mientras la pagina
          // scrollea, pero sigue ocupando su lugar en la fila, asi que <main>
          // no necesita margenes y el ancho puede seguir animandose.
          "sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width] duration-300 ease-in-out md:flex",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        <div className={cn("flex items-center gap-2.5 px-4 py-5", collapsed && "flex-col gap-3 px-0")}>
          <div className={cn("flex min-w-0 items-center gap-2.5", collapsed ? "shrink-0" : "flex-1 overflow-hidden")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)] text-[11px] font-bold leading-none tracking-tight">
              VDV
            </span>
            <div className={cn("overflow-hidden", collapsed && "hidden")}>
              <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.15em] text-[color-mix(in_hsl,var(--sidebar-foreground)_45%,transparent)]">
                Vergara del Valle
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg text-[color-mix(in_hsl,var(--sidebar-foreground)_50%,transparent)] transition-colors hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)] hover:text-[var(--sidebar-foreground)]",
              FOCUS_RING
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <div
          className={cn(
            "overflow-hidden whitespace-nowrap px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color-mix(in_hsl,var(--sidebar-foreground)_40%,transparent)] transition-[opacity,max-height] duration-200",
            collapsed ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
          )}
        >
          Aplicaciones
        </div>

        <nav aria-label="Aplicaciones" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <ul className="flex flex-col gap-1 px-2">
            {visibleSections.map((section) => {
              const isSectionActive = activeSection?.key === section.key;
              const isExpanded = !collapsed && expandedKey === section.key;
              const SectionIcon = section.icon;
              const submenuId = `submenu-${section.key}`;
              const visibleItems = section.items.filter((item) => isItemVisible(item, roles[section.key], homeApps));

              return (
                <li key={section.key} className="group/item relative" style={{ "--accent": section.accent }}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={submenuId}
                    onClick={() => toggleSection(section.key)}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors",
                      FOCUS_RING,
                      collapsed && "justify-center px-0",
                      isSectionActive
                        ? "bg-[hsl(var(--accent))] text-black/85"
                        : "text-[color-mix(in_hsl,var(--sidebar-foreground)_85%,transparent)] hover:bg-[hsl(var(--accent)/.16)] hover:text-[var(--sidebar-foreground)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        isSectionActive ? "bg-black/15" : "bg-[hsl(var(--accent)/.16)]"
                      )}
                    >
                      <SectionIcon className={cn("size-4", isSectionActive ? "text-black/80" : "text-[hsl(var(--accent))]")} />
                    </span>
                    <span className={cn("flex-1 truncate text-left transition-opacity duration-200", collapsed && "hidden")}>
                      {section.label}
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-200",
                        isSectionActive ? "text-black/70" : "text-[color-mix(in_hsl,var(--sidebar-foreground)_40%,transparent)]",
                        isExpanded && "rotate-90",
                        collapsed && "hidden"
                      )}
                    />
                  </button>

                  {/* Tooltip flotante: solo cuando el sidebar esta colapsado, en hover/focus del item */}
                  {collapsed && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-xs font-medium text-[var(--sidebar-foreground)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
                    >
                      {section.label}
                    </span>
                  )}

                  {/* Submenu anidado: grid-rows 0fr->1fr da una animacion de alto fluida
                      sin medir pixeles a mano; el fondo/borde usan --accent de la seccion.
                      Colapsado, se mantiene siempre en 0fr (el tooltip reemplaza el detalle). */}
                  <div
                    id={submenuId}
                    className="grid transition-[grid-template-rows] duration-200 ease-out"
                    style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <ul
                        className={cn(
                          "mt-1 mb-1 ml-[18px] flex flex-col gap-0.5 border-l-2 border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.1)] py-1.5 pr-1.5 pl-2.5 transition-opacity duration-200",
                          isExpanded ? "opacity-100" : "opacity-0"
                        )}
                      >
                        {visibleItems.map((item) => {
                          const isItemActive = itemActivo(item, visibleItems, pathname, search);
                          const ItemIcon = item.icon;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] leading-tight transition-colors",
                                  FOCUS_RING,
                                  isItemActive
                                    ? "font-semibold text-[hsl(var(--accent))]"
                                    : "text-[color-mix(in_hsl,var(--sidebar-foreground)_65%,transparent)] hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_6%,transparent)] hover:text-[var(--sidebar-foreground)]"
                                )}
                              >
                                <ItemIcon className="size-3 shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--sidebar-border)] p-2">
          {(currentUser.name || currentUser.email) && (
            <div className="group/item relative mb-1">
              <div className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2", collapsed && "justify-center px-0")}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_hsl,var(--sidebar-primary)_18%,transparent)] text-[11px] font-bold leading-none text-[var(--sidebar-primary)]">
                  {currentUser.initials}
                </span>
                <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
                  <div className="truncate text-[13px] font-semibold leading-tight text-[var(--sidebar-foreground)]">
                    {currentUser.name ?? currentUser.email}
                  </div>
                  {currentUser.roleLabel && (
                    <div className="truncate text-[11px] leading-tight text-[color-mix(in_hsl,var(--sidebar-foreground)_55%,transparent)]">
                      {currentUser.roleLabel}
                    </div>
                  )}
                </div>
              </div>

              {collapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-xs font-medium text-[var(--sidebar-foreground)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
                >
                  {currentUser.name ?? currentUser.email}
                  {currentUser.roleLabel ? ` · ${currentUser.roleLabel}` : ""}
                </span>
              )}
            </div>
          )}

          {isWhitelistAdmin && (
            <div className="group/item relative">
              <Link
                href="/admin/whitelist"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-[color-mix(in_hsl,var(--sidebar-foreground)_85%,transparent)] transition-colors hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]",
                  FOCUS_RING,
                  collapsed && "justify-center px-0"
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]">
                  <UserCog className="size-4" />
                </span>
                <span className={cn("flex-1 truncate text-left", collapsed && "hidden")}>Usuarios y Roles</span>
              </Link>

              {collapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-xs font-medium text-[var(--sidebar-foreground)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
                >
                  Usuarios y Roles
                </span>
              )}
            </div>
          )}

          <div className="group/item relative">
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-[color-mix(in_hsl,var(--sidebar-foreground)_85%,transparent)] transition-colors hover:bg-destructive/15 hover:text-destructive",
                FOCUS_RING,
                collapsed && "justify-center px-0"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]">
                <LogOut className="size-4" />
              </span>
              <span className={cn("flex-1 truncate text-left", collapsed && "hidden")}>Cerrar sesión</span>
            </button>

            {collapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-xs font-medium text-[var(--sidebar-foreground)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
              >
                Cerrar sesión
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ---------- Mobile (<md): bottom nav en la thumb zone + sub-nav de la seccion activa + sheet "Más" ---------- */}
      <MobileNav
        pathname={pathname}
        search={search}
        visibleSections={visibleSections}
        activeSection={activeSection}
        roles={roles}
        homeApps={homeApps}
        isWhitelistAdmin={isWhitelistAdmin}
        currentUser={currentUser}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        onLogout={handleLogout}
      />
    </>
  );
}

/**
 * Bottom navigation - patron mobile nativo en vez del drawer/hamburguesa que
 * habia antes: las acciones que mas se usan (cambiar de app) quedan siempre
 * en el tercio inferior de la pantalla, alcanzables con el pulgar sin
 * reacomodar la mano. Un tap en CUALQUIER seccion con mas de una sub-opcion
 * abre primero un bottom sheet con sus sub-secciones (sea o no la seccion ya
 * activa) - asi se elige la sub-seccion sin tener que cargar una pagina
 * primero. Mismo patron visual que el sheet "Más" (filas verticales con
 * icono + label, min-h-12). Solo si la seccion tiene una unica sub-opcion
 * visible se navega directo, porque ahi no hay nada que elegir.
 */
function MobileNav({
  pathname,
  search,
  visibleSections,
  activeSection,
  roles,
  homeApps,
  isWhitelistAdmin,
  currentUser,
  moreOpen,
  setMoreOpen,
  onLogout,
}) {
  const [openSectionKey, setOpenSectionKey] = useState(null);
  const openSection = visibleSections.find((section) => section.key === openSectionKey) ?? null;
  const openSectionItems = openSection
    ? openSection.items.filter((item) => isItemVisible(item, roles[openSection.key], homeApps))
    : [];
  const isMoreActive = pathname.startsWith("/admin");

  useEffect(() => {
    setOpenSectionKey(null);
  }, [pathname]);

  return (
    <>
      {/* Bottom nav - barra fija, siempre en el tercio inferior, safe-area aware */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-[var(--sidebar-border)] bg-[var(--sidebar)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {visibleSections.map((section) => {
          const isSectionActive = activeSection?.key === section.key;
          const SectionIcon = section.icon;
          const sectionVisibleItems = section.items.filter((item) => isItemVisible(item, roles[section.key], homeApps));
          const firstVisibleHref = sectionVisibleItems[0]?.href ?? section.basePath;
          const itemStyle = { "--accent": section.accent };
          const itemClassName = cn(
            "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 transition-all active:scale-95",
            FOCUS_RING,
            isSectionActive ? "text-[hsl(var(--accent))]" : "text-[color-mix(in_hsl,var(--sidebar-foreground)_55%,transparent)]"
          );
          const label = (
            <>
              <SectionIcon className="size-5 shrink-0" />
              <span className="max-w-full truncate px-1 text-[10px] font-medium leading-none">{section.label}</span>
            </>
          );

          // Cualquier seccion (activa o no) con mas de una sub-opcion abre su
          // sheet al tocarla, en vez de navegar directo - asi se ve y elige
          // la sub-seccion sin cargar una pagina antes. Si tiene una sola
          // sub-opcion visible no hay nada que elegir, se navega directo.
          if (sectionVisibleItems.length > 1) {
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setOpenSectionKey(section.key)}
                aria-haspopup="dialog"
                aria-expanded={openSectionKey === section.key}
                aria-current={isSectionActive ? "page" : undefined}
                style={itemStyle}
                className={itemClassName}
              >
                {label}
              </button>
            );
          }

          return (
            <Link key={section.key} href={firstVisibleHref} aria-current={isSectionActive ? "page" : undefined} style={itemStyle} className={itemClassName}>
              {label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 transition-all active:scale-95",
            FOCUS_RING,
            isMoreActive ? "text-[hsl(var(--sidebar-primary))]" : "text-[color-mix(in_hsl,var(--sidebar-foreground)_55%,transparent)]"
          )}
        >
          <MoreHorizontal className="size-5 shrink-0" />
          <span className="text-[10px] font-medium leading-none">Más</span>
        </button>
      </nav>

      {/* Sheet de sub-secciones de la seccion tocada (activa o no) - mismo
          estilo de filas que el sheet "Más" de abajo (icono en caja +
          label, min-h-12). */}
      {openSection && (
        <Sheet open={Boolean(openSectionKey)} onOpenChange={(open) => setOpenSectionKey(open ? openSection.key : null)}>
          <SheetContent side="bottom" className="rounded-t-2xl border-[var(--sidebar-border)] bg-[var(--sidebar)] pb-[env(safe-area-inset-bottom)] md:hidden">
            <SheetHeader>
              <SheetTitle className="text-[var(--sidebar-foreground)]">{openSection.label}</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-1 px-4 pb-4">
              {openSectionItems.map((item) => {
                const isItemActive = itemActivo(item, openSectionItems, pathname, search);
                const ItemIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isItemActive ? "page" : undefined}
                    style={{ "--accent": openSection.accent }}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-medium transition-colors active:scale-[0.98]",
                      FOCUS_RING,
                      isItemActive
                        ? "text-[hsl(var(--accent))]"
                        : "text-[var(--sidebar-foreground)] hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        isItemActive ? "bg-[hsl(var(--accent)/.16)]" : "bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]"
                      )}
                    >
                      <ItemIcon className="size-4" />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Sheet inferior: usuario, Usuarios y Roles, cerrar sesion */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-[var(--sidebar-border)] bg-[var(--sidebar)] pb-[env(safe-area-inset-bottom)] md:hidden">
          <SheetHeader>
            <SheetTitle className="text-[var(--sidebar-foreground)]">Más opciones</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-1 px-4 pb-4">
            {(currentUser.name || currentUser.email) && (
              <div className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_hsl,var(--sidebar-primary)_18%,transparent)] text-xs font-bold text-[var(--sidebar-primary)]">
                  {currentUser.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--sidebar-foreground)]">
                    {currentUser.name ?? currentUser.email}
                  </div>
                  {currentUser.roleLabel && (
                    <div className="truncate text-xs text-[color-mix(in_hsl,var(--sidebar-foreground)_55%,transparent)]">
                      {currentUser.roleLabel}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isWhitelistAdmin && (
              <Link
                href="/admin/whitelist"
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-medium text-[var(--sidebar-foreground)] transition-colors active:scale-[0.98]",
                  FOCUS_RING,
                  "hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]"
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]">
                  <UserCog className="size-4" />
                </span>
                Usuarios y Roles
              </Link>
            )}

            <button
              type="button"
              onClick={onLogout}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl px-2 text-left text-sm font-medium text-[var(--sidebar-foreground)] transition-colors active:scale-[0.98]",
                FOCUS_RING,
                "hover:bg-destructive/15 hover:text-destructive"
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]">
                <LogOut className="size-4" />
              </span>
              Cerrar sesión
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
