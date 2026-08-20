"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, UserCog, Users, ShieldAlert, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PagosVdvBoard } from '@/lib/board-sdk';
import { useUserManagement } from '@/hooks/portal-proveedor/useUserManagement';
import { useSuperAdmins } from '@/hooks/portal-proveedor/superAdmins';

export default function LoginPage() {
  const router = useRouter();
  const { users, loading: usersLoading } = useUserManagement();
  const { ids: superAdminIds, loading: saLoading, bootstrap } = useSuperAdmins();

  const [email, setEmail] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [entering, setEntering] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!email.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    setCurrentUser(null);

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === 'admin@test.com') {
      setCurrentUser({ id: 'test-viewer', name: 'Admin (Solo lectura)', email: normalizedEmail, photo_url: null });
      setSearching(false);
      setSearched(true);
      return;
    }

    try {
      const board = new PagosVdvBoard();
      const result = await board.users.withPagination({ limit: 500 }).execute();
      const match = (result || []).find(
        (u) => (u.email || '').toLowerCase().trim() === email.toLowerCase().trim()
      );
      if (match) {
        setCurrentUser(match);
      } else {
        setSearchError('No se encontró ningún usuario de monday.com con ese email.');
      }
    } catch (err) {
      console.error('Error buscando usuario:', err);
      setSearchError('No se pudo verificar el email. Intenta nuevamente.');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  // Once we have both the current user and the users list, determine role
  const matchedUser = (!usersLoading && !saLoading && currentUser)
    ? users.find((u) => String(u.mondayUserId) === String(currentUser.id))
    : null;

  // Cuenta de prueba de solo lectura (login con admin@test.com): siempre entra como
  // Administrador normal, nunca puede quedar en el flujo de bootstrap a Super Admin.
  const isTestViewer = currentUser?.id === 'test-viewer';

  // Check if current user is a designated super admin
  const isSuperAdmin = currentUser ? superAdminIds.includes(String(currentUser.id)) : false;

  // Bootstrap: if no super admins exist yet, first user can claim super admin
  const needsBootstrap = !saLoading && !usersLoading && currentUser && !isTestViewer && superAdminIds.length === 0 && !matchedUser;

  // Determine assigned role: stored profile takes priority, then super admin check
  const assignedRole = isTestViewer ? 'admin' : (matchedUser?.role || (isSuperAdmin ? 'super_admin' : null));

  const handleEnter = () => {
    if (!assignedRole || entering) return;
    setEntering(true);

    const context = {
      role: assignedRole,
      mondayUserId: currentUser?.id || null,
      adminName: currentUser?.name || null,
      adminPhoto: currentUser?.photo_url || null,
      proveedorName: null,
      adminUserId: matchedUser?.id || null,
      allowedObras: matchedUser?.allowedObras || null,
      allowedProveedores: matchedUser?.allowedProveedores || null,
      canGrantSubAccess: matchedUser?.canGrantSubAccess || false,
    };

    localStorage.setItem('pp_session', JSON.stringify(context));

    // Super Admin -> goes to filter selection screen
    if (assignedRole === 'super_admin') {
      router.push('/portal-proveedor/super-admin-filter');
    } else {
      router.push('/portal-proveedor/dashboard');
    }
  };

  const handleBootstrap = async () => {
    if (!currentUser || entering) return;
    setEntering(true);
    await bootstrap(currentUser.id);
    const context = {
      role: 'super_admin',
      mondayUserId: currentUser.id,
      adminName: currentUser.name,
      adminPhoto: currentUser.photo_url || null,
      proveedorName: null,
      adminUserId: null,
      allowedObras: null,
      allowedProveedores: null,
      canGrantSubAccess: false,
    };
    localStorage.setItem('pp_session', JSON.stringify(context));
    router.push('/portal-proveedor/super-admin-filter');
  };

  const isLoading = usersLoading || saLoading;

  const roleConfig = {
    super_admin: { label: 'Super Administrador', icon: UserCog, desc: 'Acceso completo al portal, gestión de usuarios y configuración', color: 'text-primary', bg: 'bg-primary/10' },
    admin: { label: 'Administrador', icon: Users, desc: `Acceso a ${matchedUser?.allowedObras?.length || 0} obras y ${matchedUser?.allowedProveedores?.length || 0} subcontratistas asignados`, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    subcontratista: { label: 'Subcontratista', icon: Building2, desc: `Acceso a pagos en ${matchedUser?.allowedObras?.length || 0} obras asignadas`, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Portal Proveedores VDV</h1>
          <p className="text-sm text-muted-foreground">Acceso según tu perfil asignado</p>
        </div>

        {/* Email search form */}
        {!currentUser && (
          <Card className="p-6 border-border space-y-4">
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Tu email de monday.com</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@empresa.com"
                    className="pl-9 h-11"
                    required
                  />
                </div>
              </div>
              <Button type="submit" size="lg" disabled={searching || !email.trim()} className="w-full h-11">
                {searching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Buscando...</> : 'Buscar mi usuario'}
              </Button>
            </form>

            {searched && searchError && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Usuario no encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">{searchError}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Loading state (users list / super admin list) */}
        {currentUser && isLoading && (
          <Card className="p-6 border-border">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-10 w-full mt-4" />
          </Card>
        )}

        {/* User identified - show their profile */}
        {!isLoading && currentUser && assignedRole && (
          <Card className="p-6 border-border space-y-5">
            {/* User identity */}
            <div className="flex items-center gap-4">
              {currentUser.photo_url ? (
                <img src={currentUser.photo_url} className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-border" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0 ring-2 ring-border">
                  <span className="text-lg font-semibold text-primary">{currentUser.name?.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">{currentUser.name}</h2>
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
            </div>

            {/* Assigned role card */}
            {(() => {
              const config = roleConfig[assignedRole];
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

            {/* Enter button */}
            <Button size="lg" onClick={handleEnter} disabled={entering} className="w-full h-12 text-base">
              {entering ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Ingresando...</> : 'Ingresar al Portal'}
            </Button>
          </Card>
        )}

        {/* Bootstrap: first-time setup - no admins exist yet */}
        {!isLoading && currentUser && needsBootstrap && !assignedRole && (
          <Card className="p-6 border-border space-y-5">
            <div className="flex items-center gap-4">
              {currentUser.photo_url ? (
                <img src={currentUser.photo_url} className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-border" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0 ring-2 ring-border">
                  <span className="text-lg font-semibold text-primary">{currentUser.name?.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">{currentUser.name}</h2>
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
              <div className="flex items-start gap-2.5">
                <UserCog className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Configuración inicial</p>
                  <p className="text-xs text-muted-foreground mt-1">Este portal no tiene administradores configurados. Serás registrado como <strong>Super Administrador</strong> para gestionar usuarios y permisos.</p>
                </div>
              </div>
            </div>

            <Button size="lg" onClick={handleBootstrap} disabled={entering} className="w-full h-12 text-base">
              {entering ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Configurando...</> : 'Activar como Super Admin'}
            </Button>
          </Card>
        )}

        {/* User not found in the system */}
        {!isLoading && currentUser && !assignedRole && !needsBootstrap && (
          <Card className="p-6 border-border space-y-4">
            <div className="flex items-center gap-4">
              {currentUser.photo_url ? (
                <img src={currentUser.photo_url} className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-border" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border">
                  <span className="text-lg font-semibold">{currentUser.name?.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">{currentUser.name}</h2>
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
            </div>

            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Sin acceso asignado</p>
                  <p className="text-xs text-muted-foreground mt-1">Tu usuario de monday.com no tiene un perfil asignado en este portal. Contacta al Super Administrador para que te otorgue acceso.</p>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
