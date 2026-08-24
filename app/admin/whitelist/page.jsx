"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ShieldAlert, Lock, Plus, Pencil, Trash2, UserCog, X, Search, Users, Package, Handshake, UserX, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_OBRAS } from "@/hooks/vale-express/useUserRole";

const APP_LABELS = { "vale-express": "Vale Express", "portal-proveedor": "Portal Proveedor" };
const APP_ICONS = { "vale-express": Package, "portal-proveedor": Handshake };

const APP_ROLES = {
  "vale-express": [
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Administrador" },
    { value: "bodeguero", label: "Bodeguero" },
    { value: "jefe_obra", label: "Jefe de Obra" },
    { value: "apr", label: "APR" },
  ],
  "portal-proveedor": [
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Administrador" },
    { value: "subcontratista", label: "Subcontratista" },
  ],
};

// Lista unica de todos los appRol posibles (deduplicados por value - "Super
// Admin"/"Administrador" existen en las 2 apps con el mismo significado) para
// el conteo general "cuantos hay de cada rol" y para el acceso a esta misma
// whitelist: super_admin en CUALQUIER asignacion edita, admin en cualquiera
// solo ve (ver app/api/auth/whitelist/route.js, que es quien lo hace cumplir).
const ALL_APP_ROLES = Object.values(APP_ROLES)
  .flat()
  .filter((r, i, arr) => arr.findIndex((x) => x.value === r.value) === i);

// Misma idea que las "pills" de color por rol de /vale-express/admin, pero
// con clases Tailwind directas (esta pagina no vive dentro de ningun
// [data-app=...] con --chart-*/--accent propios, asi que no hay paleta de
// tema para reusar via color-mix como alla).
const ROLE_COLORS = {
  super_admin: {
    badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  admin: {
    badge: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
    text: "text-blue-600 dark:text-blue-400",
  },
  bodeguero: {
    badge: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  jefe_obra: {
    badge: "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400",
    text: "text-violet-600 dark:text-violet-400",
  },
  apr: {
    badge: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  subcontratista: {
    badge: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
    text: "text-rose-600 dark:text-rose-400",
  },
};
const DEFAULT_ROLE_COLOR = { badge: "bg-muted border-border text-muted-foreground", text: "text-muted-foreground" };
function roleColor(value) {
  return ROLE_COLORS[value] ?? DEFAULT_ROLE_COLOR;
}

function initialsFor(text) {
  const clean = (text || "").trim();
  if (!clean) return "?";
  const namePart = clean.includes("@") ? clean.split("@")[0] : clean;
  const words = namePart.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function nuevaAsignacion(app) {
  return { app, appRol: APP_ROLES[app][0].value, obras: "", restrictObras: false, proveedorName: "" };
}

// Resumen de obras permitidas para la asignacion de Vale Express de un
// usuario (Portal Proveedor no tiene ese concepto) - null si ni siquiera
// tiene asignacion a Vale Express, "Todas" si no esta restringido.
function obrasSummary(asignaciones) {
  const ve = (asignaciones ?? []).find((a) => a.app === "vale-express");
  if (!ve) return null;
  const obras = ve.appConfig?.obras ?? [];
  const restringido = ve.appConfig?.restrictObras === true && obras.length > 0;
  return restringido ? { esTodas: false, count: obras.length, obras } : { esTodas: true, count: null, obras: [] };
}

function SectionLabel({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

/**
 * Selector de obras permitidas para una asignacion de Vale Express. Sigue
 * siendo un string separado por comas por debajo (mismo shape que consume
 * handleSave/openEdit) - esto solo cambia como se arma ese string: en vez de
 * tipearlo a mano, se elige de ALL_OBRAS (la misma lista que usa el resto de
 * Vale Express) y se va armando como chips removibles. El switch "Todas" es
 * la misma semantica que ya tenia el campo vacio (restrictObras=false).
 */
function ObrasPicker({ value, onChange }) {
  const selected = useMemo(() => value.split(",").map((s) => s.trim()).filter(Boolean), [value]);
  const [modoRestringido, setModoRestringido] = useState(selected.length > 0);
  const [open, setOpen] = useState(false);

  const disponibles = ALL_OBRAS.filter((o) => !selected.includes(o));

  const handleModoChange = (todasChecked) => {
    setModoRestringido(!todasChecked);
    if (todasChecked) onChange("");
  };

  const addObra = (obra) => {
    // No cierra el popover - deja seguir eligiendo obras una atras de otra
    // sin tener que reabrirlo cada vez (Command ya achica la lista de
    // "disponibles" solo, asi que la elegida desaparece de la lista).
    onChange([...selected, obra].join(", "));
  };

  const removeObra = (obra) => {
    onChange(selected.filter((o) => o !== obra).join(", "));
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Obras permitidas</span>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch size="sm" checked={!modoRestringido} onCheckedChange={handleModoChange} />
          Todas
        </label>
      </div>

      {modoRestringido ? (
        <>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((obra) => (
                <Badge key={obra} variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
                  {obra}
                  <button
                    type="button"
                    onClick={() => removeObra(obra)}
                    className="rounded-full p-0.5 hover:bg-foreground/10"
                    aria-label={`Quitar ${obra}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" />}>
              <Plus className="w-3 h-3" />
              {selected.length === 0 ? "Elegir obras" : "Agregar otra"}
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar obra..." />
                <CommandList>
                  <CommandEmpty>No quedan obras para agregar.</CommandEmpty>
                  <CommandGroup>
                    {disponibles.map((obra) => (
                      <CommandItem key={obra} value={obra} onSelect={() => addObra(obra)}>
                        {obra}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">Tiene acceso a todas las obras (sin restricción).</p>
      )}
    </div>
  );
}

// Fila de la lista: mismo espiritu que UserCard de /vale-express/admin
// (avatar circular, pills de rol coloreadas, seccion de acceso a la derecha)
// pero adaptada al modelo de esta whitelist (varias apps por persona en vez
// de un solo rol, acciones editar/borrar en vez de expandir un selector).
function UsuarioCard({ u, onEdit, onDelete, onToggleEstado, togglingId, mostrarAcciones }) {
  const isRevocado = u.estado !== "activo";
  const resumenObras = obrasSummary(u.asignaciones);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card transition-colors overflow-hidden",
        isRevocado && "opacity-60"
      )}
    >
      <div className="p-3 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <span className="text-xs font-semibold text-muted-foreground">{initialsFor(u.nombre || u.email)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-medium truncate", !u.nombre && "text-muted-foreground italic font-normal")}>
            {u.nombre ?? "Sin nombre"}
          </div>
          <div className="text-xs text-muted-foreground truncate font-mono">{u.email}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {u.puedeAdministrarCompleto ? (
            <Switch
              checked={u.estado === "activo"}
              onCheckedChange={() => onToggleEstado(u)}
              disabled={togglingId === u.id}
              aria-label={u.estado === "activo" ? "Revocar acceso" : "Reactivar acceso"}
            />
          ) : (
            <Badge variant={u.estado === "activo" ? "default" : "destructive"} className="text-[11px]">
              {u.estado === "activo" ? "Activo" : "Revocado"}
            </Badge>
          )}
          {mostrarAcciones &&
            (u.puedeAdministrarCompleto ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(u)} aria-label={`Editar ${u.email}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(u)} aria-label={`Eliminar ${u.email}`}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground pr-1">Solo lectura</span>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
        {(u.asignaciones ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sin apps asignadas</span>}
        {(u.asignaciones ?? []).map((a, i) => {
          const AppIcon = APP_ICONS[a.app];
          const color = roleColor(a.appRol);
          return (
            <span
              key={i}
              className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium", color.badge)}
            >
              {AppIcon && <AppIcon className="w-3 h-3" />}
              {APP_LABELS[a.app] ?? a.app}
              <span className="opacity-50">·</span>
              {APP_ROLES[a.app]?.find((r) => r.value === a.appRol)?.label ?? a.appRol}
            </span>
          );
        })}
        {resumenObras &&
          (resumenObras.esTodas ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground">
              Todas las obras
            </span>
          ) : (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  />
                }
              >
                <MapPin className="w-3 h-3" />
                {resumenObras.count} obra{resumenObras.count !== 1 ? "s" : ""}
                <ChevronDown className="w-3 h-3" />
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Obras permitidas ({resumenObras.count})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {resumenObras.obras.map((obra) => (
                    <Badge key={obra} variant="secondary" className="text-[11px] font-normal">
                      {obra}
                    </Badge>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ))}
      </div>
    </div>
  );
}

/**
 * Panel de administracion de la whitelist (quien puede entrar a la app + a
 * que app(s)/rol pertenece cada uno - la mayoria de la gente tiene una sola
 * asignacion, pero puede tener mas de una, ej. alguien con Super Admin en
 * Vale Express Y Portal Proveedor). No hay un rol propio de esta whitelist:
 * el acceso sale de los mismos roles de cada app, y esta ACOTADO POR APP -
 * 'super_admin' en Vale Express deja ver Y editar solo usuarios que tengan
 * alguna asignacion en Vale Express, 'admin' deja solo verlos. Alguien con
 * roles en las 2 apps ve/edita segun corresponda en cada una por separado.
 * El servidor (/api/auth/whitelist) ya devuelve la lista recortada a lo que
 * esta cuenta puede ver, y marca por fila si la puede administrar completa
 * (`puedeAdministrarCompleto`) - esto de aca solo arma la UI en base a eso.
 *
 * Estetica calcada de /vale-express/admin (tarjetas con avatar + pills de
 * rol coloreadas + tarjetas de resumen por rol) en vez de la tabla HTML que
 * tenia antes, adaptada a los primitivos shadcn/ui de este proyecto.
 */
export default function WhitelistAdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [access, setAccess] = useState({}); // { [app]: "editor" | "viewer" }
  const [usuarios, setUsuarios] = useState([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ id: null, email: "", nombre: "", asignaciones: [] });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/auth/whitelist");
    if (res.status === 403 || res.status === 401) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setUsuarios(json.result ?? []);
    setAccess(json.access ?? {});
    setAllowed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Apps donde esta cuenta puede editar (super_admin) vs. solo ver (admin) -
  // "editar" en al menos una app alcanza para mostrar el boton "Agregar" y
  // la columna de acciones, pero cada fila despues decide con
  // u.puedeAdministrarCompleto si esta cuenta puede tocar ESE usuario puntual.
  const editableApps = useMemo(() => Object.keys(access).filter((app) => access[app] === "editor"), [access]);
  const soloLecturaApps = useMemo(() => Object.keys(access).filter((app) => access[app] === "viewer"), [access]);
  const mostrarAcciones = editableApps.length > 0;

  const filteredUsuarios = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.nombre ?? "").toLowerCase().includes(q)
    );
  }, [usuarios, search]);

  // Cuenta cuantas personas tienen cada rol de app, sumando entre las 2 apps
  // (alguien con la misma asignacion en ambas cuenta 2 veces, una por cada
  // una - es a proposito, refleja cuantas ASIGNACIONES hay de ese rol).
  const roleCounts = useMemo(() => {
    const counts = {};
    usuarios.forEach((u) => {
      (u.asignaciones ?? []).forEach((a) => {
        counts[a.appRol] = (counts[a.appRol] ?? 0) + 1;
      });
    });
    return counts;
  }, [usuarios]);

  const openNew = () => {
    setForm({
      id: null,
      email: "",
      nombre: "",
      asignaciones: editableApps.length ? [nuevaAsignacion(editableApps[0])] : [],
    });
    setDialogOpen(true);
  };

  const openEdit = (u) => {
    const asignaciones = (u.asignaciones ?? []).map((a) => ({
      app: a.app,
      appRol: a.appRol,
      obras: (a.appConfig?.obras ?? []).join(", "),
      restrictObras: a.appConfig?.restrictObras === true,
      proveedorName: a.appConfig?.proveedorName ?? "",
    }));
    setForm({
      id: u.id,
      email: u.email,
      nombre: u.nombre ?? "",
      asignaciones: asignaciones.length ? asignaciones : editableApps.length ? [nuevaAsignacion(editableApps[0])] : [],
    });
    setDialogOpen(true);
  };

  const updateAsignacion = (index, cambios) => {
    setForm((f) => ({
      ...f,
      asignaciones: f.asignaciones.map((a, i) => (i === index ? { ...a, ...cambios } : a)),
    }));
  };

  const addAsignacion = () => {
    // Solo ofrece apps que esta cuenta administra (editableApps) - no tiene
    // sentido dejarla asignar una app que no puede editar.
    const yaUsadas = form.asignaciones.map((a) => a.app);
    const disponible = editableApps.find((app) => !yaUsadas.includes(app));
    if (!disponible) return;
    setForm((f) => ({ ...f, asignaciones: [...f.asignaciones, nuevaAsignacion(disponible)] }));
  };

  const removeAsignacion = (index) => {
    setForm((f) => ({ ...f, asignaciones: f.asignaciones.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (!form.email.trim() || form.asignaciones.length === 0) return;
    setSaving(true);
    try {
      const asignaciones = form.asignaciones.map((a) => ({
        app: a.app,
        appRol: a.appRol,
        appConfig:
          a.app === "vale-express"
            ? { obras: a.obras.split(",").map((s) => s.trim()).filter(Boolean), restrictObras: a.restrictObras }
            : { proveedorName: a.proveedorName.trim() || null },
      }));

      const payload = {
        email: form.email.trim(),
        nombre: form.nombre.trim() || null,
        asignaciones,
      };

      const res = await fetch("/api/auth/whitelist", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { id: form.id, ...payload } : payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");

      toast.success(form.id ? "Usuario actualizado" : "Usuario agregado");
      setDialogOpen(false);
      cargar();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (u) => {
    const nuevoEstado = u.estado === "activo" ? "revocado" : "activo";
    setTogglingId(u.id);
    try {
      const res = await fetch("/api/auth/whitelist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      toast.success(nuevoEstado === "activo" ? "Acceso reactivado" : "Acceso revocado");
      cargar();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      toast.success("Usuario eliminado");
      setDeleteTarget(null);
      cargar();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold mb-1">Sin acceso</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Necesitás rol de Administrador o Super Admin en Vale Express o Portal Proveedor para ver esta sección.
        </p>
      </div>
    );
  }

  const puedeAgregarMas = form.asignaciones.length < editableApps.length;
  const hayBusqueda = search.trim().length > 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <Toaster richColors position="top-center" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <UserCog className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Usuarios y Roles</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {usuarios.length} usuario{usuarios.length === 1 ? "" : "s"} · quién puede entrar y a qué app(s)/rol pertenece.
            </p>
          </div>
        </div>
        {editableApps.length > 0 && (
          <Button onClick={openNew} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        )}
      </div>

      {/* Tarjetas de resumen por rol, como RoleSummaryCard de /vale-express/admin */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ALL_APP_ROLES.map((r) => (
          <div key={r.value} className="rounded-xl border border-border bg-card p-3 text-center">
            <div className={cn("text-2xl font-semibold", roleColor(r.value).text)}>{roleCounts[r.value] ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">{r.label}</div>
          </div>
        ))}
      </div>

      {soloLecturaApps.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-foreground">
              Modo solo lectura para {soloLecturaApps.map((app) => APP_LABELS[app]).join(" y ")}
            </p>
            {editableApps.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Podés editar: {editableApps.map((app) => APP_LABELS[app]).join(" y ")}.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email o nombre..."
          className="pl-9"
        />
      </div>

      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          Usuarios ({hayBusqueda ? `${filteredUsuarios.length} de ${usuarios.length}` : usuarios.length})
        </h2>
      </div>

      <div className="space-y-2">
        {filteredUsuarios.map((u) => (
          <UsuarioCard
            key={u.id}
            u={u}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onToggleEstado={handleToggleEstado}
            togglingId={togglingId}
            mostrarAcciones={mostrarAcciones}
          />
        ))}
        {filteredUsuarios.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <UserX className="w-8 h-8 text-muted-foreground/50" />
              {hayBusqueda ? <span>No hay resultados para &ldquo;{search}&rdquo;.</span> : <span>Todavía no hay nadie en la whitelist.</span>}
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar usuario" : "Agregar usuario"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-2 md:grid-cols-[minmax(0,15rem)_1px_1fr]">
            {/* Columna izquierda: identidad de la persona */}
            <div className="space-y-4">
              <SectionLabel>Datos del usuario</SectionLabel>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={Boolean(form.id)}
                  placeholder="nombre@vdv.cl"
                />
                {form.id && <p className="text-xs text-muted-foreground">El email no se puede cambiar.</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" />
              </div>

              <p className="text-xs text-muted-foreground">
                El acceso a esta pantalla sale de los roles de la derecha, por app: Super Admin de una app puede editar los usuarios de esa app, Administrador solo puede verlos.
              </p>
            </div>

            {/* Divisor vertical entre secciones (horizontal en mobile) */}
            <div className="h-px w-full bg-border md:h-full md:w-px" />

            {/* Columna derecha: a que app(s)/rol pertenece */}
            <div className="space-y-3 md:min-w-0">
              <div className="flex items-center justify-between">
                <SectionLabel>Apps y roles</SectionLabel>
                {puedeAgregarMas && (
                  <Button type="button" variant="outline" size="sm" onClick={addAsignacion} className="gap-1 h-7 text-xs">
                    <Plus className="w-3 h-3" />
                    Agregar otra app
                  </Button>
                )}
              </div>

              {form.asignaciones.map((a, index) => {
                const AppIcon = APP_ICONS[a.app];

                return (
                  <div key={index} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        {AppIcon && <AppIcon className="w-3.5 h-3.5" />}
                        App {index + 1}
                      </div>
                      {form.asignaciones.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAsignacion(index)}
                          className="ml-auto h-6 w-6 p-0"
                          aria-label="Quitar esta app"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={a.app}
                        onValueChange={(v) => updateAsignacion(index, { app: v, appRol: APP_ROLES[v][0].value })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {editableApps
                            .filter((app) => app === a.app || !form.asignaciones.some((x) => x.app === app))
                            .map((app) => (
                              <SelectItem key={app} value={app}>{APP_LABELS[app]}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select value={a.appRol} onValueChange={(v) => updateAsignacion(index, { appRol: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {APP_ROLES[a.app].map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {a.app === "vale-express" && (
                      <ObrasPicker
                        value={a.obras}
                        onChange={(next) => updateAsignacion(index, { obras: next, restrictObras: next.trim().length > 0 })}
                      />
                    )}

                    {a.app === "portal-proveedor" && a.appRol === "subcontratista" && (
                      <div className="space-y-1">
                        <Input
                          value={a.proveedorName}
                          onChange={(e) => updateAsignacion(index, { proveedorName: e.target.value })}
                          placeholder="Nombre del proveedor"
                          className="h-9 text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">Tal cual figura en monday.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={handleSave} disabled={saving || !form.email.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium text-foreground">{deleteTarget.email}</span> va a perder acceso a la
                  app de forma permanente. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
