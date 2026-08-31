"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { crearMaterial } from "@/lib/generador-oc/datos";

/**
 * Alta de un material que todavia no esta en la base. Queda disponible para
 * cualquier orden futura, y tambien para Vale Express: es la misma base.
 */
export default function CrearMaterialForm({
  nombreInicial,
  unidades,
  categorias,
  onCreated,
  onCancel,
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [unidad, setUnidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [categoria, setCategoria] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!nombre.trim() || !unidad) {
      setError("El nombre y la unidad son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const material = await crearMaterial({
        nombre: nombre.trim(),
        unidad,
        precioLista: parseFloat(precio) || 0,
        categoria: categoria || undefined,
      });
      if (!material) throw new Error("No se pudo crear el material");
      onCreated(material);
    } catch (err) {
      console.error("[generador-oc] Error al crear material:", err);
      setError(err?.message || "No se pudo crear el material. Intente nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mat-nombre">Nombre del material *</Label>
        <Input
          id="mat-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. PERFIL METALCON 90CA085"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mat-unidad">Unidad *</Label>
          <Select value={unidad} onValueChange={setUnidad}>
            <SelectTrigger id="mat-unidad">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mat-precio">Precio lista</Label>
          <Input
            id="mat-precio"
            type="number"
            min="0"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mat-categoria">Categoría</Label>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger id="mat-categoria">
            <SelectValue placeholder="Seleccionar (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear y usar material
        </Button>
      </div>
    </div>
  );
}
