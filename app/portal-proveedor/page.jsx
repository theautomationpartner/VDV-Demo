"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, UserCog, Users, ShieldAlert, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Cuentas fijas por rol - son las UNICAS que pueden entrar a Portal Proveedor. No
// se buscan contra los usuarios reales del board de monday (esta app comparte
// cuenta por rol, no una cuenta por empleado).
// proveedorName: null en subcontratista = ve todos los pagos por ahora (sin
// restringir a un proveedor real todavia).
const FIXED_LOGIN_ACCOUNTS = {
  'superadmin.portalproveedor@demo.vdv.cl': { id: 'demo-pp-super-admin', name: 'Super Admin', role: 'super_admin', proveedorName: null },
  'admin.portalproveedor@demo.vdv.cl': { id: 'demo-pp-admin', name: 'Administrador', role: 'admin', proveedorName: null },
  'subcontratista.portalproveedor@demo.vdv.cl': { id: 'demo-pp-subcontratista', name: 'Subcontratista', role: 'subcontratista', proveedorName: null },
};

const roleConfig = {
  super_admin: { label: 'Super Administrador', icon: UserCog, desc: 'Acceso completo al portal', color: 'text-primary', bg: 'bg-primary/10' },
  admin: { label: 'Administrador', icon: Users, desc: 'Acceso a todas las obras y proveedores', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  subcontratista: { label: 'Subcontratista', icon: Building2, desc: 'Acceso a sus propios pagos', color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [searched, setSearched] = useState(false);
  const [entering, setEntering] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    const normalizedEmail = email.toLowerCase().trim();
    setCurrentUser(FIXED_LOGIN_ACCOUNTS[normalizedEmail] ?? null);
    setSearched(true);
  };

  const handleEnter = () => {
    if (!currentUser || entering) return;
    setEntering(true);

    const context = {
      role: currentUser.role,
      mondayUserId: currentUser.id,
      adminName: currentUser.name,
      adminPhoto: null,
      proveedorName: currentUser.proveedorName,
      adminUserId: null,
      allowedObras: null,
      allowedProveedores: null,
      canGrantSubAccess: false,
    };

    localStorage.setItem('pp_session', JSON.stringify(context));

    if (currentUser.role === 'super_admin') {
      router.push('/portal-proveedor/super-admin-filter');
    } else {
      router.push('/portal-proveedor/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Portal Proveedores VDV</h1>
          <p className="text-sm text-muted-foreground">Acceso según tu perfil asignado</p>
        </div>

        {!currentUser && (
          <Card className="p-6 border-border space-y-4">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Tu email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@vdv.cl"
                    className="pl-9 h-11"
                    required
                  />
                </div>
              </div>
              <Button type="submit" size="lg" disabled={!email.trim()} className="w-full h-11">
                Buscar mi usuario
              </Button>
            </form>

            {searched && !currentUser && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Usuario no encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Este correo no tiene acceso al sistema.</p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {currentUser && (
          <Card className="p-6 border-border space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0 ring-2 ring-border">
                <span className="text-lg font-semibold text-primary">{currentUser.name?.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">{currentUser.name}</h2>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
            </div>

            {(() => {
              const config = roleConfig[currentUser.role];
              const Icon = config.icon;
              return (
                <div className={`rounded-lg ${config.bg} border border-border/50 p-4`}>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Icon className={`w-5 h-5 ${config.color}`} />
                    <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-7.5">{config.desc}</p>
                </div>
              );
            })()}

            <Button size="lg" onClick={handleEnter} disabled={entering} className="w-full h-12 text-base">
              {entering ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Ingresando...</> : 'Ingresar al Portal'}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
