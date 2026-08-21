"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ShieldAlert, Plus, Pencil, Trash2, UserCog, X } from "lucide-react";

const APP_LABELS = { "vale-express": "Vale Express", "portal-proveedor": "Portal Proveedor" };

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

function nuevaAsignacion(app) {
  return { app, appRol: APP_ROLES[app][0].value, obras: "", restrictObras: false, proveedorName: "" };
}

const emptyForm = { id: null, email: "", nombre: "", rol: "usuario", asignaciones: [nuevaAsignacion("vale-express")] };

/**
 * Panel de administracion de la whitelist (quien puede entrar a la app + a
 * que app(s)/rol pertenece cada uno - la mayoria de la gente tiene una sola
 * asignacion, pero puede tener mas de una, ej. alguien con Super Admin en
 * Vale Express Y Portal Proveedor). Solo llega gente con rol='admin' en la
 * whitelist global (distinto del rol DENTRO de cada app) - el servidor lo
 * vuelve a validar en cada pedido a /api/auth/whitelist, esto de aca es solo
 * para no mostrar el formulario a quien igual no puede usarlo.
 */
export default function WhitelistAdminPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/auth/whitelist");
    if (res.status === 403 || res.status === 401) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setUsuarios(json.result ?? []);
    setAllowed(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const openNew = () => {
    setForm(emptyForm);
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
      rol: u.rol,
      asignaciones: asignaciones.length ? asignaciones : [nuevaAsignacion("vale-express")],
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
    // Si ya tiene una de cada app, no ofrecemos una tercera - solo hay 2 apps.
    const yaUsadas = form.asignaciones.map((a) => a.app);
    const disponible = Object.keys(APP_LABELS).find((app) => !yaUsadas.includes(app));
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
        rol: form.rol,
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
    }
  };

  const handleDelete = async (u) => {
    if (!confirm(`¿Eliminar a ${u.email} de la whitelist? Ya no va a poder entrar.`)) return;
    try {
      const res = await fetch("/api/auth/whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      toast.success("Usuario eliminado");
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-destructive mb-3" />
        <h1 className="text-lg font-semibold mb-1">Sin acceso</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Necesitás rol de administrador de la whitelist para ver esta sección.
        </p>
      </div>
    );
  }

  const puedeAgregarMas = form.asignaciones.length < Object.keys(APP_LABELS).length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <Toaster richColors position="top-center" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Whitelist de acceso
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quién puede entrar a la app, y a qué app(s)/rol pertenece cada uno.
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Agregar
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Nombre</th>
                <th className="text-left px-4 py-2.5">App(s) / Rol</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="text-right px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-2.5">{u.nombre ?? "-"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(u.asignaciones ?? []).length === 0 && <span className="text-muted-foreground">-</span>}
                      {(u.asignaciones ?? []).map((a, i) => (
                        <Badge key={i} variant="secondary">
                          {APP_LABELS[a.app] ?? a.app}: {APP_ROLES[a.app]?.find((r) => r.value === a.appRol)?.label ?? a.appRol}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={u.estado === "activo" ? "default" : "destructive"}>{u.estado}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleEstado(u)}>
                        {u.estado === "activo" ? "Revocar" : "Reactivar"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(u)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Todavía no hay nadie en la whitelist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar usuario" : "Agregar usuario"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={Boolean(form.id)}
                  placeholder="nombre@vdv.cl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Rol en la whitelist</Label>
              <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="usuario">Usuario (solo puede entrar)</SelectItem>
                  <SelectItem value="admin">Admin (puede administrar esta whitelist)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Apps y roles</Label>
                {puedeAgregarMas && (
                  <Button type="button" variant="outline" size="sm" onClick={addAsignacion} className="gap-1 h-7 text-xs">
                    <Plus className="w-3 h-3" />
                    Agregar otra app
                  </Button>
                )}
              </div>

              {form.asignaciones.map((a, index) => (
                <Card key={index} className="p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <Select
                        value={a.app}
                        onValueChange={(v) => updateAsignacion(index, { app: v, appRol: APP_ROLES[v][0].value })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(APP_LABELS)
                            .filter(([app]) => app === a.app || !form.asignaciones.some((x) => x.app === app))
                            .map(([app, label]) => (
                              <SelectItem key={app} value={app}>{label}</SelectItem>
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
                    {form.asignaciones.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAsignacion(index)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {a.app === "vale-express" && (
                    <Input
                      value={a.obras}
                      onChange={(e) => updateAsignacion(index, { obras: e.target.value, restrictObras: e.target.value.trim().length > 0 })}
                      placeholder="Obras permitidas, separadas por coma (vacío = todas)"
                      className="h-9 text-xs"
                    />
                  )}

                  {a.app === "portal-proveedor" && a.appRol === "subcontratista" && (
                    <Input
                      value={a.proveedorName}
                      onChange={(e) => updateAsignacion(index, { proveedorName: e.target.value })}
                      placeholder="Nombre del proveedor (tal cual figura en monday)"
                      className="h-9 text-xs"
                    />
                  )}
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving || !form.email.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
