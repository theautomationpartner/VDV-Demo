"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, LogOut } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/vale-express/useUserRole";

const COLLAPSE_KEY = "sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 768px)";

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

  // Rail angosto/ancho en escritorio - persiste entre recargas.
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // localStorage no disponible (modo privado, cuota) - el estado sigue funcionando en memoria
      }
      return next;
    });
  };

  // Drawer superpuesto en movil - abre/cierra, no persiste (siempre arranca cerrado).
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  return {
    collapsed,
    mobileOpen,
    toggleCollapsed,
    toggleMobile,
    closeMobile: () => setMobileOpen(false),
  };
}

export function AppSidebar() {
  const pathname = usePathname();
  const roles = useSidebarRoles(pathname);
  const { collapsed, mobileOpen, toggleCollapsed, toggleMobile, closeMobile } = useSidebarCollapse();

  const activeSection =
    NAV_SECTIONS.find((section) => pathname.startsWith(section.basePath)) ?? null;

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

  const toggleSection = (key) => {
    if (collapsed) return;
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

          <nav aria-label="Aplicaciones" className="min-h-0 flex-1 overflow-y-auto">
            <ul className="flex flex-col gap-1 px-2">
              {NAV_SECTIONS.map((section) => {
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
                          ? "bg-[var(--accent)] text-black/85"
                          : "text-[color-mix(in_hsl,var(--sidebar-foreground)_85%,transparent)] hover:bg-[color-mix(in_hsl,var(--accent)_16%,transparent)] hover:text-[var(--sidebar-foreground)]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isSectionActive ? "bg-black/15" : "bg-[color-mix(in_hsl,var(--accent)_16%,transparent)]"
                        )}
                      >
                        <SectionIcon
                          className={cn("size-4", isSectionActive ? "text-black/80" : "text-[var(--accent)]")}
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
                            "mt-1 mb-1 ml-[18px] flex flex-col gap-0.5 border-l-2 border-[color-mix(in_hsl,var(--accent)_35%,transparent)] bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] py-1.5 pr-1.5 pl-2.5 transition-opacity duration-200",
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
                                      ? "font-semibold text-[var(--accent)]"
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
