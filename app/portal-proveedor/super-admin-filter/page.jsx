"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Grid3x3, Building2, ArrowRight, Check, ChevronsUpDown, UserPlus, Users, Shield, Trash2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PagosVdvBoard, FlujoContratacionSubcontratoBoard } from '@/lib/board-sdk';
import { deduplicateProviders } from '@/hooks/portal-proveedor/providerAliases';
import { useUserManagement } from '@/hooks/portal-proveedor/useUserManagement';

const OBRAS_LIST = [
  "PL 46-50", "VIK", "SAMOA", "IVA", "SELMAN", "NUEVO", "HUELEN", "ALAIA",
  "LEON 3355", "M506", "QUINCHO PDA 5007", "Marketing", "TIENDA PILATES",
  "CERRO COLORADO", "ADOLFO IBAÑEZ 270", "R20", "M388", "CHATEAU PAPUDO",
  "VICTORIA", "OFICINA CENTRAL", "CARMEN FARIÑA", "LAS PESEBRERAS",
  "CASA MARK", "RAFAEL CAÑAS", "DUNKERQUE", "TOMAS DUCH", "MANQUEHUE",
  "FORESTAL", "ACHIRAS", ". JUAN XXIII", "ALAIA 2", "ROSA R",
];

export default function SuperAdminFilterPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedProveedor, setSelectedProveedor] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('filter'); // 'filter' | 'users'

  // User management
  const { users, loading: usersLoading, addUser, deleteUser } = useUserManagement();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [mondayUsers, setMondayUsers] = useState([]);
  const [loadingMondayUsers, setLoadingMondayUsers] = useState(false);
  const [newUser, setNewUser] = useState({ mondayUserId: '', name: '', email: '', photoUrl: '', role: 'subcontratista' });
  const [saving, setSaving] = useState(false);
  const [mondayComboOpen, setMondayComboOpen] = useState(false);
  // Subcontratista: single proveedor
  const [formProveedor, setFormProveedor] = useState('');
  const [formProvComboOpen, setFormProvComboOpen] = useState(false);
  // Admin: multi-select obras
  const [formObras, setFormObras] = useState([]);
  const [formObrasOpen, setFormObrasOpen] = useState(false);

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

  useEffect(() => {
    const fetchProveedores = async () => {
      setLoading(true);
      try {
        // Fetch provider names from board relations in connected boards
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

        const uniqueRaw = Array.from(allNames);
        setProveedores(deduplicateProviders(uniqueRaw));
      } catch (error) {
        console.error('Error al cargar proveedores:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProveedores();
  }, []);

  const fetchMondayUsers = async () => {
    if (mondayUsers.length > 0) return;
    setLoadingMondayUsers(true);
    try {
      const board = new PagosVdvBoard();
      const result = await board.users.execute();
      setMondayUsers(result || []);
    } catch (err) {
      console.error('Error fetching monday users:', err);
    } finally {
      setLoadingMondayUsers(false);
    }
  };

  const handleContinue = () => {
    if (selectedFilter === 'specific' && !selectedProveedor) return;
    const updatedContext = {
      ...userContext,
      filterMode: selectedFilter,
      filterProveedor: selectedFilter === 'specific' ? selectedProveedor : null,
    };
    localStorage.setItem('pp_session', JSON.stringify(updatedContext));
    router.push('/portal-proveedor/dashboard');
  };

  const handleCreateUser = async () => {
    if (!newUser.mondayUserId || !newUser.role) return;
    if (newUser.role === 'subcontratista' && !formProveedor) return;
    if (newUser.role === 'admin' && formObras.length === 0) return;
    setSaving(true);
    try {
      await addUser({
        mondayUserId: newUser.mondayUserId,
        name: newUser.name,
        email: newUser.email,
        photoUrl: newUser.photoUrl,
        role: newUser.role,
        allowedObras: newUser.role === 'admin' ? formObras : [],
        allowedProveedores: newUser.role === 'subcontratista' ? [formProveedor] : null,
        canGrantSubAccess: false,
      });
      setShowCreateDialog(false);
      setNewUser({ mondayUserId: '', name: '', email: '', photoUrl: '', role: 'subcontratista' });
      setFormProveedor('');
      setFormObras([]);
    } catch (err) {
      console.error('Error creating user:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    await deleteUser(userId);
  };

  const selectMondayUser = (user) => {
    setNewUser({
      ...newUser,
      mondayUserId: String(user.id),
      name: user.name,
      email: user.email || '',
      photoUrl: user.photo_url || user.photo_thumb || '',
    });
    setMondayComboOpen(false);
  };

  if (!userContext) return null;

  return (
    <div className="min-h-dvh bg-background px-4 py-6 md:py-8">
      <div className="w-full max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            {userContext.adminPhoto && (
              <img src={userContext.adminPhoto} className="w-10 h-10 rounded-full object-cover ring-2 ring-border" alt="" />
            )}
            <div>
              <h1 className="text-xl font-semibold text-foreground">¡Hola, {userContext.adminName?.split(' ')[0] || 'Admin'}!</h1>
              <p className="text-xs text-muted-foreground">Super Administrador</p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-muted/50 p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('filter')}
            aria-pressed={activeTab === 'filter'}
            className={`flex-1 min-h-12 md:min-h-9 py-2 px-3 rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              activeTab === 'filter' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Ver Datos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            aria-pressed={activeTab === 'users'}
            className={`flex-1 min-h-12 md:min-h-9 py-2 px-3 rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              activeTab === 'users' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Usuarios
            </span>
          </button>
        </div>

        {/* FILTER TAB */}
        {activeTab === 'filter' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <p className="text-sm text-muted-foreground text-center">¿Qué datos deseas visualizar?</p>

            {/* View all */}
            <Card
              className={`p-4 cursor-pointer transition-all border-2 active:scale-[0.98] ${
                selectedFilter === 'all' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => { setSelectedFilter('all'); setSelectedProveedor(''); }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                }`}>
                  <Grid3x3 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground">Ver todo</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Todos los pagos, contratos y subcontratistas</p>
                </div>
                {selectedFilter === 'all' && <Check className="w-5 h-5 text-primary shrink-0" />}
              </div>
            </Card>

            {/* Filter by subcontractor */}
            <Card
              className={`p-4 cursor-pointer transition-all border-2 active:scale-[0.98] ${
                selectedFilter === 'specific' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => setSelectedFilter('specific')}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedFilter === 'specific' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                }`}>
                  <Search className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground">Buscar subcontratista</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Filtrar datos de un proveedor específico</p>
                </div>
                {selectedFilter === 'specific' && <Check className="w-5 h-5 text-primary shrink-0" />}
              </div>
            </Card>

            {/* Subcontractor selector */}
            {selectedFilter === 'specific' && (
              <Card className="p-4 border-border animate-in fade-in duration-300">
                <div className="space-y-3">
                  <Label className="text-foreground text-sm">Selecciona el subcontratista</Label>
                  <Popover open={comboOpen} onOpenChange={setComboOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" aria-expanded={comboOpen} className="w-full justify-between h-11 bg-card border-border text-foreground font-normal" disabled={loading}>
                        {loading ? (
                          <span className="text-muted-foreground">Cargando...</span>
                        ) : selectedProveedor ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="w-4 h-4 text-primary shrink-0" />
                            <span className="truncate">{selectedProveedor}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Buscar empresa...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Escribir nombre..." className="text-foreground" />
                        <CommandList>
                          <CommandEmpty>No se encontró.</CommandEmpty>
                          <CommandGroup>
                            {proveedores.map((prov) => (
                              <CommandItem key={prov} value={prov} onSelect={(val) => { setSelectedProveedor(val === selectedProveedor ? '' : val); setComboOpen(false); }} className="cursor-pointer">
                                <Check className={`mr-2 h-4 w-4 ${selectedProveedor === prov ? 'opacity-100' : 'opacity-0'}`} />
                                {prov}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </Card>
            )}

            <Button size="lg" onClick={handleContinue} disabled={selectedFilter === 'specific' && !selectedProveedor} className="w-full h-12 text-base">
              Continuar al Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Gestión de accesos al portal</p>
              <Button size="sm" onClick={() => { setShowCreateDialog(true); fetchMondayUsers(); }} className="h-8 gap-1.5 text-xs">
                <UserPlus className="w-3.5 h-3.5" />
                Crear Usuario
              </Button>
            </div>

            {/* Users list */}
            {usersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : users.length === 0 ? (
              <Card className="p-6 border-border text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No hay usuarios creados</p>
                <p className="text-xs text-muted-foreground mt-1">Crea usuarios y asígnales un rol para que accedan al portal</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <Card key={user.id} className="p-3 border-border">
                    <div className="flex items-center gap-3">
                      {user.photoUrl ? (
                        <img src={user.photoUrl} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-primary">{user.name?.charAt(0)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {user.role === 'admin' ? 'Admin' : 'Subcontr.'}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user.id)}
                        aria-label={`Eliminar ${user.name}`}
                        className="flex min-h-12 min-w-12 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 md:min-h-0 md:min-w-0 md:p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Info note */}
            <Card className="p-3 border-border bg-muted/20">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong>Nota:</strong> Los usuarios deben ser primero invitados al workspace de monday.com como observadores. Luego podrás asignarles un rol aquí para controlar su acceso al portal.
              </p>
            </Card>

            {/* Full admin link */}
            <Button variant="outline" size="sm" onClick={() => router.push('/portal-proveedor/usuarios')} className="w-full h-9 text-xs gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Panel completo de permisos
              <ArrowRight className="w-3 h-3 ml-auto" />
            </Button>
          </div>
        )}
      </div>

      {/* Create user dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Crear Usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Monday user selector */}
            <div className="space-y-2">
              <Label className="text-sm">Usuario de Monday.com</Label>
              <Popover open={mondayComboOpen} onOpenChange={setMondayComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-11 font-normal" onClick={fetchMondayUsers}>
                    {newUser.mondayUserId ? (
                      <div className="flex items-center gap-2 min-w-0">
                        {newUser.photoUrl ? (
                          <img src={newUser.photoUrl} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-medium text-primary">{newUser.name?.charAt(0)}</span>
                          </div>
                        )}
                        <span className="truncate text-sm">{newUser.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Seleccionar persona...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nombre..." />
                    <CommandList>
                      <CommandEmpty>{loadingMondayUsers ? 'Cargando...' : 'No encontrado'}</CommandEmpty>
                      <CommandGroup>
                        {mondayUsers.map((mu) => (
                          <CommandItem key={mu.id} value={`${mu.name} ${mu.email || ''}`} onSelect={() => selectMondayUser(mu)} className="cursor-pointer">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {(mu.photo_url || mu.photo_thumb) ? (
                                <img src={mu.photo_url || mu.photo_thumb} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-medium">{mu.name?.charAt(0)}</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm truncate">{mu.name}</p>
                                {mu.email && <p className="text-[10px] text-muted-foreground truncate">{mu.email}</p>}
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

            {/* Role selector */}
            <div className="space-y-2">
              <Label className="text-sm">Rol en el Portal</Label>
              <Select value={newUser.role} onValueChange={(val) => { setNewUser({ ...newUser, role: val }); setFormProveedor(''); setFormObras([]); }}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Seleccionar rol..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="subcontratista">Subcontratista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subcontratista: single proveedor selector */}
            {newUser.role === 'subcontratista' && (
              <div className="space-y-2">
                <Label className="text-sm">Subcontrato asignado</Label>
                <p className="text-[10px] text-muted-foreground">Selecciona la empresa que representará este usuario</p>
                <Popover open={formProvComboOpen} onOpenChange={setFormProvComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-11 font-normal" disabled={loading}>
                      {formProveedor ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate text-sm">{formProveedor}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">{loading ? 'Cargando...' : 'Seleccionar empresa...'}</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar empresa..." />
                      <CommandList>
                        <CommandEmpty>No se encontró.</CommandEmpty>
                        <CommandGroup>
                          {proveedores.map((prov) => (
                            <CommandItem key={prov} value={prov} onSelect={(val) => { setFormProveedor(val); setFormProvComboOpen(false); }} className="cursor-pointer">
                              <Check className={`mr-2 h-4 w-4 ${formProveedor === prov ? 'opacity-100' : 'opacity-0'}`} />
                              {prov}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Admin: multi-select obras */}
            {newUser.role === 'admin' && (
              <div className="space-y-2">
                <Label className="text-sm">Obras autorizadas</Label>
                <p className="text-[10px] text-muted-foreground">Selecciona las obras que podrá visualizar. Tendrá acceso a todos los subcontratistas por defecto.</p>
                <Popover open={formObrasOpen} onOpenChange={setFormObrasOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-auto min-h-[44px] font-normal py-2">
                      {formObras.length > 0 ? (
                        <span className="text-sm">{formObras.length} obra{formObras.length > 1 ? 's' : ''} seleccionada{formObras.length > 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Seleccionar obras...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar obra..." />
                      <CommandList>
                        <CommandEmpty>No se encontró.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__all__"
                            onSelect={() => {
                              if (formObras.length === OBRAS_LIST.length) {
                                setFormObras([]);
                              } else {
                                setFormObras([...OBRAS_LIST]);
                              }
                            }}
                            className="cursor-pointer font-medium"
                          >
                            <Check className={`mr-2 h-4 w-4 ${formObras.length === OBRAS_LIST.length ? 'opacity-100' : 'opacity-0'}`} />
                            Seleccionar Todas
                          </CommandItem>
                          {OBRAS_LIST.map((obra) => (
                            <CommandItem
                              key={obra}
                              value={obra}
                              onSelect={() => {
                                setFormObras((prev) =>
                                  prev.includes(obra) ? prev.filter((o) => o !== obra) : [...prev, obra]
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <Check className={`mr-2 h-4 w-4 ${formObras.includes(obra) ? 'opacity-100' : 'opacity-0'}`} />
                              {obra}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {/* Selected obras tags */}
                {formObras.length > 0 && formObras.length <= 8 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formObras.map((obra) => (
                      <Badge key={obra} variant="secondary" className="text-[10px] gap-1 pr-1">
                        {obra}
                        <button
                          type="button"
                          onClick={() => setFormObras((prev) => prev.filter((o) => o !== obra))}
                          aria-label={`Quitar ${obra}`}
                          className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {formObras.length > 8 && (
                  <p className="text-[10px] text-primary font-medium mt-1">{formObras.length} obras seleccionadas</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)} className="h-9">Cancelar</Button>
            <Button
              onClick={handleCreateUser}
              disabled={!newUser.mondayUserId || saving || (newUser.role === 'subcontratista' && !formProveedor) || (newUser.role === 'admin' && formObras.length === 0)}
              className="h-9 gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
