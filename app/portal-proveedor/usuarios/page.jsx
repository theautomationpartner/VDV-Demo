"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Shield, Building2, UserCog, Check, ChevronsUpDown, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { PagosVdvBoard, FlujoContratacionSubcontratoBoard } from '@/lib/board-sdk';
import { useObrasPagos } from '@/hooks/useObras';
import { useUserManagement } from '@/hooks/portal-proveedor/useUserManagement';
import { deduplicateProviders } from '@/hooks/portal-proveedor/providerAliases';

// Fallback: la lista real sale de monday (useObrasPagos). Solo se usa mientras
// carga o si monday no responde - no hay que mantenerla al dia a mano.
const OBRAS_FALLBACK = [
  "PL 46-50", "VIK", "SAMOA", "IVA", "SELMAN", "NUEVO", "HUELEN", "ALAIA",
  "LEON 3355", "M506", "QUINCHO PDA 5007", "Marketing", "TIENDA PILATES",
  "CERRO COLORADO", "ADOLFO IBAÑEZ 270", "R20", "M388", "CHATEAU PAPUDO",
  "VICTORIA", "OFICINA CENTRAL", "CARMEN FARIÑA", "LAS PESEBRERAS",
  "CASA MARK", "RAFAEL CAÑAS", "DUNKERQUE", "TOMAS DUCH", "MANQUEHUE",
  "FORESTAL", "ACHIRAS", ". JUAN XXIII", "ALAIA 2", "ROSA R",
];

export default function AdminUsuariosPage() {
  // Obras vivas del board PAGOS VDV: una obra nueva en monday aparece aca sola.
  const { options: OBRAS } = useObrasPagos(OBRAS_FALLBACK);
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    const parsed = JSON.parse(ctx);
    if (parsed.role !== 'super_admin') {
      toast.error('No tenés acceso a esta sección debido a tu rol.');
      router.push('/portal-proveedor/dashboard');
      return;
    }
    setUserContext(parsed);
  }, [router]);

  const { users, loading, addUser, updateUser, deleteUser } = useUserManagement();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formMondayUser, setFormMondayUser] = useState(null); // { id, name, email, photo_url }
  const [formRole, setFormRole] = useState('admin');
  const [formObras, setFormObras] = useState([]);
  const [formProveedores, setFormProveedores] = useState([]);
  const [formCanGrant, setFormCanGrant] = useState(false);
  const [obrasOpen, setObrasOpen] = useState(false);
  const [provsOpen, setProvsOpen] = useState(false);
  const [mondayUserOpen, setMondayUserOpen] = useState(false);

  // Monday.com workspace users
  const [mondayUsers, setMondayUsers] = useState([]);
  const [mondayUsersLoading, setMondayUsersLoading] = useState(false);

  // Provider list
  const [proveedores, setProveedores] = useState([]);
  const [provsLoading, setProvsLoading] = useState(false);

  useEffect(() => {
    const fetchMondayUsers = async () => {
      setMondayUsersLoading(true);
      try {
        const board = new PagosVdvBoard();
        const result = await board.users.execute();
        setMondayUsers(result || []);
      } catch (err) {
        console.error('Error loading monday users:', err);
      } finally {
        setMondayUsersLoading(false);
      }
    };
    fetchMondayUsers();
  }, []);

  useEffect(() => {
    const fetchProvs = async () => {
      setProvsLoading(true);
      try {
        // Extract provider names from board relations
        const pagosBoard = new PagosVdvBoard();
        const contratosBoard = new FlujoContratacionSubcontratoBoard();

        const [pagosResult, contratosResult] = await Promise.all([
          pagosBoard.items().withColumns(['proveedores']).withPagination({ limit: 500 }).execute(),
          contratosBoard.items().withColumns(['proveedores']).withPagination({ limit: 500 }).execute(),
        ]);

        const allNames = new Set();
        [...(pagosResult.items || []), ...(contratosResult.items || [])].forEach((item) => {
          if (item.proveedores) {
            item.proveedores.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => allNames.add(n));
          }
        });

        setProveedores(deduplicateProviders(Array.from(allNames)));
      } catch (err) {
        console.error('Error loading providers:', err);
      } finally {
        setProvsLoading(false);
      }
    };
    fetchProvs();
  }, []);

  // Filter out monday users already assigned
  const availableMondayUsers = useMemo(() => {
    const assignedIds = new Set(users.map((u) => u.mondayUserId).filter(Boolean));
    if (editingUser?.mondayUserId) assignedIds.delete(editingUser.mondayUserId);
    return mondayUsers.filter((mu) => !assignedIds.has(mu.id));
  }, [mondayUsers, users, editingUser]);

  const resetForm = () => {
    setFormMondayUser(null);
    setFormRole('admin');
    setFormObras([]);
    setFormProveedores([]);
    setFormCanGrant(false);
    setEditingUser(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormMondayUser(user.mondayUserId ? { id: user.mondayUserId, name: user.name, email: user.email, photo_url: user.photoUrl ? { original: user.photoUrl } : null } : null);
    setFormRole(user.role);
    setFormObras(user.allowedObras || []);
    setFormProveedores(user.allowedProveedores || []);
    setFormCanGrant(user.canGrantSubAccess || false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formMondayUser) return;
    setSaving(true);
    try {
      const userData = {
        name: formMondayUser.name,
        mondayUserId: formMondayUser.id,
        email: formMondayUser.email || '',
        photoUrl: formMondayUser.photo_url?.original || formMondayUser.photoThumb || '',
        role: formRole,
        allowedObras: formObras,
        allowedProveedores: formProveedores,
        canGrantSubAccess: formCanGrant,
      };
      if (editingUser) {
        await updateUser(editingUser.id, userData);
      } else {
        await addUser(userData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error('Error saving user:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    await deleteUser(userId);
  };

  const toggleObra = (obra) => {
    setFormObras((prev) => prev.includes(obra) ? prev.filter((o) => o !== obra) : [...prev, obra]);
  };

  const toggleProv = (prov) => {
    setFormProveedores((prev) => prev.includes(prov) ? prev.filter((p) => p !== prov) : [...prev, prov]);
  };

  const admins = useMemo(() => users.filter((u) => u.role === 'admin'), [users]);
  const subs = useMemo(() => users.filter((u) => u.role === 'subcontratista'), [users]);

  if (!userContext) return null;

  return (
    <div className="h-dvh flex flex-col">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/portal-proveedor/dashboard"
            aria-label="Volver"
            className="-ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /><h1 className="text-base md:text-lg font-semibold text-foreground">Gestión de Usuarios</h1></div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Crear Usuario</span></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 md:p-6 space-y-6 max-w-[900px] mx-auto">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <UserCog className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Administradores</h2>
              <Badge variant="secondary" className="text-[10px] h-5">{admins.length}</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={`as-${i}`} className="h-16 rounded-lg" />)}</div>
            ) : admins.length === 0 ? (
              <Card className="p-6 border-border border-dashed"><p className="text-center text-muted-foreground text-sm">No hay administradores creados</p></Card>
            ) : (
              <div className="space-y-2">{admins.map((user) => <UserCard key={user.id} user={user} onEdit={openEdit} onDelete={handleDelete} />)}</div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-foreground">Subcontratistas</h2>
              <Badge variant="secondary" className="text-[10px] h-5">{subs.length}</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={`ss-${i}`} className="h-16 rounded-lg" />)}</div>
            ) : subs.length === 0 ? (
              <Card className="p-6 border-border border-dashed"><p className="text-center text-muted-foreground text-sm">No hay subcontratistas creados</p></Card>
            ) : (
              <div className="space-y-2">{subs.map((user) => <UserCard key={user.id} user={user} onEdit={openEdit} onDelete={handleDelete} />)}</div>
            )}
          </section>
        </div>
      </ScrollArea>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Crear Usuario'}</DialogTitle>
            <DialogDescription>{editingUser ? 'Modifica los permisos del usuario.' : 'Vincula un usuario de monday.com y asigna permisos.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Monday User Selector */}
            <div className="space-y-1.5">
              <Label className="text-sm">Usuario monday.com</Label>
              <Popover open={mondayUserOpen} onOpenChange={setMondayUserOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-11 font-normal" disabled={mondayUsersLoading}>
                    {mondayUsersLoading ? <span className="text-muted-foreground text-xs">Cargando usuarios...</span> : formMondayUser ? (
                      <div className="flex items-center gap-2.5 min-w-0">
                        {formMondayUser.photo_url?.original ? (
                          <img src={formMondayUser.photo_url.original} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><span className="text-[10px] font-medium text-primary">{formMondayUser.name?.charAt(0)}</span></div>
                        )}
                        <div className="min-w-0">
                          <span className="text-sm truncate block">{formMondayUser.name}</span>
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground text-xs">Seleccionar usuario...</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nombre o email..." />
                    <CommandList>
                      <CommandEmpty>No se encontró usuario.</CommandEmpty>
                      <CommandGroup>
                        {availableMondayUsers.map((mu) => (
                          <CommandItem key={mu.id} value={`${mu.name} ${mu.email}`} onSelect={() => { setFormMondayUser(mu); setMondayUserOpen(false); }} className="cursor-pointer">
                            <Check className={`mr-2 h-3.5 w-3.5 ${formMondayUser?.id === mu.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex items-center gap-2.5 min-w-0">
                              {mu.photo_url?.original ? (
                                <img src={mu.photo_url.original} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0"><span className="text-[10px] font-medium">{mu.name?.charAt(0)}</span></div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{mu.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{mu.email}</p>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-sm">Perfil</Label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'admin', label: 'Administrador', icon: UserCog, desc: 'Ve obras y subcontratistas asignados' }, { id: 'subcontratista', label: 'Subcontratista', icon: Building2, desc: 'Ve solo sus pagos en obras asignadas' }].map((r) => (
                  <button key={r.id} onClick={() => setFormRole(r.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${formRole === r.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}>
                    <r.icon className={`w-4 h-4 mb-1 ${formRole === r.id ? 'text-primary' : 'text-muted-foreground'}`} />
                    <p className="text-xs font-medium">{r.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Obras */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Obras permitidas</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-primary hover:text-primary" onClick={() => setFormObras(formObras.length === OBRAS.length ? [] : [...OBRAS])}>
                  {formObras.length === OBRAS.length ? 'Quitar Todos' : 'Permitir Todos'}
                </Button>
              </div>
              <Popover open={obrasOpen} onOpenChange={setObrasOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-auto min-h-[2.5rem] py-1.5 font-normal">
                    {formObras.length === OBRAS.length ? <span className="text-xs text-foreground">Todas las obras</span> : formObras.length === 0 ? <span className="text-muted-foreground text-xs">Seleccionar obras...</span> : (
                      <div className="flex flex-wrap gap-1">{formObras.slice(0, 3).map((o) => <Badge key={o} variant="secondary" className="text-[10px]">{o}</Badge>)}{formObras.length > 3 && <Badge variant="secondary" className="text-[10px]">+{formObras.length - 3}</Badge>}</div>
                    )}
                    <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar obra..." />
                    <CommandList>
                      <CommandEmpty>No encontrada</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__all_obras__" onSelect={() => setFormObras(formObras.length === OBRAS.length ? [] : [...OBRAS])} className="cursor-pointer text-primary font-medium">
                          <Check className={`mr-2 h-3.5 w-3.5 ${formObras.length === OBRAS.length ? 'opacity-100' : 'opacity-0'}`} />Permitir Todos
                        </CommandItem>
                        {OBRAS.map((obra) => (
                          <CommandItem key={obra} value={obra} onSelect={() => toggleObra(obra)} className="cursor-pointer">
                            <Check className={`mr-2 h-3.5 w-3.5 ${formObras.includes(obra) ? 'opacity-100' : 'opacity-0'}`} />{obra}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formObras.length > 0 && formObras.length < OBRAS.length && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formObras.map((o) => (
                    <Badge key={o} variant="outline" className="text-[10px] gap-1 pr-1">
                      {o}
                      <button
                        type="button"
                        onClick={() => toggleObra(o)}
                        aria-label={`Quitar ${o}`}
                        className="rounded-full hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Proveedores */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Subcontratistas permitidos</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-primary hover:text-primary" disabled={provsLoading} onClick={() => setFormProveedores(formProveedores.length === proveedores.length ? [] : [...proveedores])}>
                  {formProveedores.length === proveedores.length && proveedores.length > 0 ? 'Quitar Todos' : 'Permitir Todos'}
                </Button>
              </div>
              <Popover open={provsOpen} onOpenChange={setProvsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-auto min-h-[2.5rem] py-1.5 font-normal" disabled={provsLoading}>
                    {provsLoading ? <span className="text-muted-foreground text-xs">Cargando...</span> : formProveedores.length === proveedores.length && proveedores.length > 0 ? <span className="text-xs text-foreground">Todos los subcontratistas</span> : formProveedores.length === 0 ? <span className="text-muted-foreground text-xs">Seleccionar subcontratistas...</span> : (
                      <div className="flex flex-wrap gap-1">{formProveedores.slice(0, 2).map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}{formProveedores.length > 2 && <Badge variant="secondary" className="text-[10px]">+{formProveedores.length - 2}</Badge>}</div>
                    )}
                    <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar subcontratista..." />
                    <CommandList>
                      <CommandEmpty>No encontrado</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__all_provs__" onSelect={() => setFormProveedores(formProveedores.length === proveedores.length ? [] : [...proveedores])} className="cursor-pointer text-primary font-medium">
                          <Check className={`mr-2 h-3.5 w-3.5 ${formProveedores.length === proveedores.length && proveedores.length > 0 ? 'opacity-100' : 'opacity-0'}`} />Permitir Todos
                        </CommandItem>
                        {proveedores.map((prov) => (
                          <CommandItem key={prov} value={prov} onSelect={() => toggleProv(prov)} className="cursor-pointer">
                            <Check className={`mr-2 h-3.5 w-3.5 ${formProveedores.includes(prov) ? 'opacity-100' : 'opacity-0'}`} /><span className="text-xs">{prov}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formProveedores.length > 0 && formProveedores.length < proveedores.length && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formProveedores.slice(0, 5).map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] gap-1 pr-1">
                      {p}
                      <button
                        type="button"
                        onClick={() => toggleProv(p)}
                        aria-label={`Quitar ${p}`}
                        className="rounded-full hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {formProveedores.length > 5 && <Badge variant="outline" className="text-[10px]">+{formProveedores.length - 5} más</Badge>}
                </div>
              )}
            </div>

            {/* Can grant sub access - for admins */}
            {formRole === 'admin' && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-xs font-medium">Puede dar acceso a subcontratistas</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Permite crear usuarios subcontratistas en sus obras</p>
                </div>
                <Switch checked={formCanGrant} onCheckedChange={setFormCanGrant} />
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleSave} disabled={!formMondayUser || saving}>{saving ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserCard({ user, onEdit, onDelete }) {
  const isAdmin = user.role === 'admin';
  const obrasCount = user.allowedObras?.length || 0;
  const provsCount = user.allowedProveedores?.length || 0;

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            {user.photoUrl ? (
              <img src={user.photoUrl} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAdmin ? 'bg-primary/15' : 'bg-purple-500/15'}`}>
                <span className={`text-xs font-semibold ${isAdmin ? 'text-primary' : 'text-purple-400'}`}>{user.name?.charAt(0)}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{user.name}</h3>
                <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-[10px] h-5 shrink-0">{isAdmin ? 'Admin' : 'Sub'}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {user.email && <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>}
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{obrasCount}</span> {obrasCount === 1 ? 'obra' : 'obras'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{provsCount}</span> subcontr.
                </span>
                {isAdmin && user.canGrantSubAccess && (
                  <span className="text-[10px] text-primary/80">Puede asignar</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 min-h-12 min-w-12 md:min-h-0 md:min-w-0"
              onClick={() => onEdit(user)}
              aria-label={`Editar ${user.name}`}
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 min-h-12 min-w-12 md:min-h-0 md:min-w-0"
                  aria-label={`Eliminar ${user.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                  <AlertDialogDescription>Se eliminará el acceso de <strong>{user.name}</strong> al portal. Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(user.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </Card>
  );
}
