"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, LogOut, UserCog } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useUserRole, ROLES } from "@/hooks/vale-express/useUserRole";
import { getGlobalEmail, getGlobalApps, getGlobalWhitelistRol } from "@/lib/client/fixed-accounts";

const COLLAPSE_KEY = "sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 768px)";

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

function isItemVisible(item, role) {
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

  useEffect(() => {
    const veSession = readSession("ve_session");
    setVeUserId(veSession?.userId ?? undefined);

    const ppSession = readSession("pp_session");
    setPpRole(ppSession?.role ?? undefined);
  }, [pathname]);

  const { role: veRole } = useUserRole(veUserId);

  return {
    "vale-express": veUserId === undefined ? undefined : veRole,
    "portal-proveedor": ppRole,
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

/** rol='admin' en la whitelist global -> puede administrar /admin/whitelist. */
function useIsWhitelistAdmin(pathname) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(getGlobalWhitelistRol() === "admin");
  }, [pathname]);

  return isAdmin;
}

/**
 * Estado colapsado del sidebar. Persiste en localStorage como el resto de
 * las sesiones por-app (readSession de arriba), y arranca colapsado si la
 * primera carga ya es en viewport movil (no hay preferencia guardada aun).
 */
function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(COLLAPSE_KEY);
    } catch {
      stored = null;
    }
    if (stored !== null) {
      setCollapsed(stored === "true");
    } else if (window.matchMedia(MOBILE_QUERY).matches) {
      setCollapsed(true);
    }
  }, []);

  const persistCollapsed = (value) => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(value));
    } catch {
      // localStorage no disponible (modo privado, cuota) - el estado sigue funcionando en memoria
    }
  };

  // Rail angosto/ancho en escritorio - persiste entre recargas.
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

  // Drawer superpuesto en movil - abre/cierra, no persiste (siempre arranca cerrado).
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  return {
    collapsed,
    mobileOpen,
    toggleCollapsed,
    expand,
    toggleMobile,
    closeMobile: () => setMobileOpen(false),
  };
}

export function AppSidebar() {
  const pathname = usePathname();
  const roles = useSidebarRoles(pathname);
  const homeApps = useHomeApps(pathname);
  const isWhitelistAdmin = useIsWhitelistAdmin(pathname);
  const { collapsed, mobileOpen, toggleCollapsed, expand, toggleMobile, closeMobile } = useSidebarCollapse();
  const currentUser = useCurrentUser(pathname, roles["vale-express"]);

  // OC Tracker no tiene dueño (cualquier cuenta lo puede ver); Vale Express y
  // Portal Proveedor solo se muestran si estan entre las apps asignadas a la
  // cuenta global actual (puede ser mas de una), o si todavia no hay ninguna
  // cuenta global conocida (login legado).
  const visibleSections = NAV_SECTIONS.filter(
    (section) => section.key === "oc-tracker" || homeApps === null || homeApps.includes(section.key)
  );

  const activeSection =
    visibleSections.find((section) => pathname.startsWith(section.basePath)) ?? null;

  // Acordeon de un solo nivel abierto a la vez. La seccion activa (segun la
  // ruta actual) arranca expandida; navegar a otra seccion la vuelve a abrir.
  const [expandedKey, setExpandedKey] = useState(activeSection?.key ?? null);

  useEffect(() => {
    if (activeSection) setExpandedKey(activeSection.key);
  }, [activeSection?.key]);

  useEffect(() => {
    closeMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      localStorage.removeItem("vdv_global_email");
    } catch {
      // localStorage no disponible (modo privado) - igual redirige.
    }
    window.location.href = "/";
  };

  return (
    <>
      {!mobileOpen && (
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menú lateral"
          className="fixed left-4 top-4 z-30 flex size-9 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-md md:hidden"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      {mobileOpen && (
        <div
          data-app="shell"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside data-app="shell" className="h-full shrink-0 max-md:w-0">
        <div
          data-collapsed={collapsed}
          className={cn(
            "flex h-full flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width] duration-300 ease-in-out",
            collapsed ? "w-[76px]" : "w-64",
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:!w-64 max-md:shadow-2xl max-md:transition-transform max-md:duration-300",
            "max-md:" + (mobileOpen ? "translate-x-0" : "-translate-x-full")
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 px-4 py-5",
              collapsed && "flex-col gap-3 px-0"
            )}
          >
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
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[color-mix(in_hsl,var(--sidebar-foreground)_50%,transparent)] transition-colors hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)] hover:text-[var(--sidebar-foreground)] max-md:hidden"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
            <button
              type="button"
              onClick={toggleMobile}
              aria-expanded={mobileOpen}
              aria-label="Cerrar menú lateral"
              className="hidden size-7 shrink-0 items-center justify-center rounded-lg text-[color-mix(in_hsl,var(--sidebar-foreground)_50%,transparent)] transition-colors hover:bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)] hover:text-[var(--sidebar-foreground)] max-md:flex"
            >
              <PanelLeftClose className="size-4" />
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
                const visibleItems = section.items.filter((item) => isItemVisible(item, roles[section.key]));

                return (
                  <li key={section.key} className="group/item relative" style={{ "--accent": section.accent }}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={submenuId}
                      onClick={() => toggleSection(section.key)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors",
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
                        <SectionIcon
                          className={cn("size-4", isSectionActive ? "text-black/80" : "text-[hsl(var(--accent))]")}
                        />
                      </span>
                      <span
                        className={cn(
                          "flex-1 truncate text-left transition-opacity duration-200",
                          collapsed && "hidden"
                        )}
                      >
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
                            const isItemActive = pathname === item.href;
                            const ItemIcon = item.icon;
                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] leading-tight transition-colors",
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
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                    collapsed && "justify-center px-0"
                  )}
                >
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
                    collapsed && "justify-center px-0"
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_hsl,var(--sidebar-foreground)_8%,transparent)]">
                    <UserCog className="size-4" />
                  </span>
                  <span className={cn("flex-1 truncate text-left", collapsed && "hidden")}>Whitelist</span>
                </Link>

                {collapsed && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-md border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-2.5 py-1.5 text-xs font-medium text-[var(--sidebar-foreground)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
                  >
                    Whitelist
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
        </div>
      </aside>
    </>
  );
}
