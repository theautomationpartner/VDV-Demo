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
import { ShieldAlert, Plus, Pencil, Trash2, UserCog } from "lucide-react";

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

const emptyForm = { id: null, email: "", nombre: "", rol: "usuario", app: "vale-express", appRol: "admin", obras: "", restrictObras: false, proveedorName: "" };

/**
 * Panel de administracion de la whitelist (Capa 2: quien puede entrar a la app
 * + a que app/rol pertenece). Solo llega gente con rol='admin' en la whitelist
 * global (distinto del rol DENTRO de Vale Express/Portal Proveedor) - el
 * servidor lo vuelve a validar en cada pedido a /api/auth/whitelist, esto de
 * aca es solo para no mostrar el formulario a quien igual no puede usarlo.
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
    setForm({
      id: u.id,
      email: u.email,
      nombre: u.nombre ?? "",
      rol: u.rol,
      app: u.app ?? "vale-express",
      appRol: u.app_rol ?? "admin",
      obras: (u.app_config?.obras ?? []).join(", "),
      restrictObras: u.app_config?.restrictObras === true,
      proveedorName: u.app_config?.proveedorName ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.email.trim()) return;
    setSaving(true);
    try {
      const appConfig =
        form.app === "vale-express"
          ? { obras: form.obras.split(",").map((s) => s.trim()).filter(Boolean), restrictObras: form.restrictObras }
          : { proveedorName: form.proveedorName.trim() || null };

      const payload = {
        email: form.email.trim(),
        nombre: form.nombre.trim() || null,
        rol: form.rol,
        app: form.app,
        appRol: form.appRol,
        appConfig,
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

  const roleOptions = APP_ROLES[form.app] ?? [];

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
            Quién puede entrar a la app, y a qué app/rol pertenece cada uno.
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
                <th className="text-left px-4 py-2.5">App</th>
                <th className="text-left px-4 py-2.5">Rol</th>
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
                    {u.app ? (u.app === "vale-express" ? "Vale Express" : "Portal Proveedor") : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    {(APP_ROLES[u.app]?.find((r) => r.value === u.app_rol)?.label) ?? u.app_rol ?? "-"}
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
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Todavía no hay nadie en la whitelist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>App</Label>
                <Select value={form.app} onValueChange={(v) => setForm({ ...form, app: v, appRol: APP_ROLES[v][0].value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vale-express">Vale Express</SelectItem>
                    <SelectItem value="portal-proveedor">Portal Proveedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rol en la app</Label>
                <Select value={form.appRol} onValueChange={(v) => setForm({ ...form, appRol: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.app === "vale-express" && (
              <div className="space-y-1.5">
                <Label>Obras permitidas (vacío = todas)</Label>
                <Input
                  value={form.obras}
                  onChange={(e) => setForm({ ...form, obras: e.target.value, restrictObras: e.target.value.trim().length > 0 })}
                  placeholder="VIK, SAMOA, NUEVO (separadas por coma)"
                />
              </div>
            )}

            {form.app === "portal-proveedor" && form.appRol === "subcontratista" && (
              <div className="space-y-1.5">
                <Label>Nombre del proveedor (tal cual figura en monday)</Label>
                <Input
                  value={form.proveedorName}
                  onChange={(e) => setForm({ ...form, proveedorName: e.target.value })}
                  placeholder="Constructora Ejemplo SPA"
                />
              </div>
            )}

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
