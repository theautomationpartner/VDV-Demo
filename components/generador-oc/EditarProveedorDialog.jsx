"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { actualizarProveedor, getBancoOptions } from "@/lib/generador-oc/datos";

/**
 * Completar o corregir los datos del proveedor sin salir de la orden. Se
 * escriben directo en el tablero PROVEEDORES: es la misma base que usa el resto
 * de la suite, asi que lo que se arregla aca queda arreglado para todos.
 */
export default function EditarProveedorDialog({ abierto, onOpenChange, proveedor, onGuardado }) {
  const [nombreComercial, setNombreComercial] = useState("");
  const [rut, setRut] = useState("");
  const [contacto, setContacto] = useState("");
  const [mail, setMail] = useState("");
  const [fono, setFono] = useState("");
  const [banco, setBanco] = useState("");
  const [cuentaCorriente, setCuentaCorriente] = useState("");
  const [bancos, setBancos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Al abrir se precargan los valores actuales.
  useEffect(() => {
    if (!abierto) return;
    setNombreComercial(
      proveedor.nombreComercial === proveedor.name ? "" : proveedor.nombreComercial,
    );
    setRut(proveedor.rut);
    setContacto(proveedor.contacto);
    setMail(proveedor.mail);
    setFono(proveedor.fono);
    setBanco(proveedor.banco);
    setCuentaCorriente(proveedor.cuentaCorriente);
    setError(null);
  }, [abierto, proveedor]);

  useEffect(() => {
    if (!abierto || bancos.length > 0) return;
    getBancoOptions()
      .then((lista) => setBancos(lista ?? []))
      .catch((e) => console.error("[generador-oc] Error al cargar bancos:", e));
  }, [abierto, bancos.length]);

  const mailValido = !mail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim());

  const guardar = async () => {
    if (!mailValido) {
      setError("El correo indicado no tiene un formato válido.");
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await actualizarProveedor({
        id: proveedor.id,
        nombreComercial: nombreComercial.trim() || undefined,
        rut: rut.trim() || undefined,
        contacto: contacto.trim(),
        mail: mail.trim(),
        fono: fono.trim() || undefined,
        banco: banco || undefined,
        cuentaCorriente: cuentaCorriente.trim(),
      });

      if (!res?.ok || !res.proveedor) {
        setError(res?.motivo ?? "No se pudieron guardar los datos.");
        return;
      }

      onGuardado(res.proveedor);
      onOpenChange(false);
    } catch (e) {
      console.error("[generador-oc] Error al guardar datos del proveedor:", e);
      setError("No se pudieron guardar los datos del proveedor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Datos de {proveedor.name}</DialogTitle>
          <DialogDescription>
            Los cambios se guardan directamente en la base de proveedores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pv-nombre">Nombre comercial / razón social</Label>
            <Input
              id="pv-nombre"
              value={nombreComercial}
              onChange={(e) => setNombreComercial(e.target.value)}
              placeholder="Ej: COMERCIAL K"
            />
            <p className="text-xs text-muted-foreground">
              Es el nombre que aparecerá en la orden de compra.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pv-rut">RUT</Label>
              <Input
                id="pv-rut"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="77.137.860-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-cuenta">Cuenta corriente</Label>
              <Input
                id="pv-cuenta"
                value={cuentaCorriente}
                onChange={(e) => setCuentaCorriente(e.target.value)}
                placeholder="6407904"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-banco">Banco</Label>
            <Select value={banco} onValueChange={setBanco}>
              <SelectTrigger id="pv-banco">
                <SelectValue placeholder="Seleccionar banco" />
              </SelectTrigger>
              <SelectContent>
                {bancos.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pv-contacto">Persona de contacto</Label>
              <Input
                id="pv-contacto"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pv-fono">Teléfono</Label>
              <Input
                id="pv-fono"
                value={fono}
                onChange={(e) => setFono(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-mail">Mail de contacto</Label>
            <Input
              id="pv-mail"
              type="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="contacto@empresa.cl"
              aria-invalid={!mailValido}
            />
            <p className="text-xs text-muted-foreground">
              A esta dirección se notificará la orden de compra.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardando ? "Guardando..." : "Guardar datos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
