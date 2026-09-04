import {
  LayoutGrid,
  BarChart3,
  PieChart,
  FileWarning,
  FileX2,
  TrendingUp,
  ClipboardList,
  Package,
  PackagePlus,
  Boxes,
  Truck,
  ShieldCheck,
  Handshake,
  Receipt,
  FileClock,
  CircleDollarSign,
  Wallet,
  FileStack,
  UserCircle,
  Users,
  GitCompareArrows,
  Filter,
  FileSignature,
  FilePlus2,
  History,
} from "lucide-react";

import { OC_APP, ROLES_QUE_EMITEN_OC } from "@/lib/oc-roles";

/**
 * Configuracion central de navegacion del sidebar global.
 * Cada seccion representa una de las 3 apps originales.
 * `accent` es un triplete HSL crudo (sin hsl(...)) usado para el hover/activo del switcher.
 * `roles: null` => visible para cualquiera (sin restriccion de rol).
 */
export const NAV_SECTIONS = [
  {
    key: "oc-tracker",
    label: "OC Tracker",
    basePath: "/oc-tracker",
    // Con que app de `asignaciones` se habilita esta seccion. Coincide con la
    // clave en las otras dos; aca no, porque la app se llama "OC Tracker" en
    // pantalla pero en la base sigue guardada como "generador-oc" (ver
    // lib/oc-roles.js). Sin este campo la seccion se le mostraba a cualquier
    // sesion valida, subcontratistas del Portal incluidos.
    app: OC_APP,
    // Las siete pantallas de abajo cuelgan de dos rutas distintas: sin esto,
    // estando en /generador-oc la seccion no se marcaba como activa.
    rutasExtra: ["/generador-oc"],
    icon: BarChart3,
    accent: "328 100% 62%",
    items: [
      // Las cinco del Tracker son de lectura y las ve cualquiera de los tres
      // roles, Consulta incluido. Lo unico editable es el estado de una orden
      // en Consumo por Obra, y eso lo decide el rol dentro de la pantalla.
      { label: "Control General", href: "/oc-tracker", icon: LayoutGrid, roles: null },
      { label: "Consumo por Obra", href: "/oc-tracker/consumo-por-obra", icon: PieChart, roles: null },
      { label: "Facturas sin OC", href: "/oc-tracker/facturas-sin-oc", icon: FileWarning, roles: null },
      { label: "OCs sin Facturas", href: "/oc-tracker/ocs-sin-facturas", icon: FileX2, roles: null },
      { label: "OCs Sobreconsumidas", href: "/oc-tracker/ocs-sobreconsumidas", icon: TrendingUp, roles: null },
      // Emitir es lo unico que el rol Consulta no puede: estas dos no le
      // aparecen. El servidor lo vuelve a verificar igual (requireEmisionOc).
      { label: "Órdenes de Compra", href: "/generador-oc", icon: History, roles: ROLES_QUE_EMITEN_OC },
      { label: "Nueva Orden", href: "/generador-oc?nueva=1", icon: FilePlus2, roles: ROLES_QUE_EMITEN_OC },
    ],
  },
  {
    key: "vale-express",
    label: "Vale Express",
    basePath: "/vale-express",
    icon: Package,
    accent: "28 90% 58%",
    items: [
      { label: "Dashboard", href: "/vale-express/dashboard", icon: LayoutGrid, roles: null },
      { label: "Solicitud de Materiales", href: "/vale-express/solicitud", icon: ClipboardList, roles: ["super_admin", "admin", "jefe_obra", "apr", null] },
      { label: "Ingreso de Materiales", href: "/vale-express/ingreso", icon: PackagePlus, roles: ["super_admin", "admin", "bodeguero"] },
      { label: "Stock por Obra", href: "/vale-express/stock", icon: Boxes, roles: ["super_admin", "admin", "bodeguero", "jefe_obra", "apr"] },
      { label: "Vales Pendientes", href: "/vale-express/vales-pendientes", icon: Truck, roles: ["super_admin", "admin", "bodeguero", "jefe_obra", "apr"] },
      { label: "Administrar Roles", href: "/vale-express/admin", icon: ShieldCheck, roles: ["super_admin", "admin"] },
    ],
  },
  {
    key: "portal-proveedor",
    label: "Portal Proveedores",
    basePath: "/portal-proveedor",
    icon: Handshake,
    accent: "160 70% 45%",
    items: [
      { label: "Dashboard", href: "/portal-proveedor/dashboard", icon: LayoutGrid, roles: null },
      { label: "Órdenes de Compra", href: "/portal-proveedor/ordenes-de-compra", icon: Receipt, roles: null },
      { label: "Pagados", href: "/portal-proveedor/pagados", icon: CircleDollarSign, roles: null },
      { label: "Por Pagar", href: "/portal-proveedor/por-pagar", icon: Wallet, roles: null },
      { label: "Contratos", href: "/portal-proveedor/contratos", icon: FileStack, roles: null },
      { label: "Estados de Pago", href: "/portal-proveedor/estados-de-pago", icon: FileClock, roles: null },
      { label: "Mis Datos", href: "/portal-proveedor/mis-datos", icon: UserCircle, roles: null },
      { label: "Usuarios", href: "/portal-proveedor/usuarios", icon: Users, roles: ["super_admin"] },
      { label: "Proveedores Similares", href: "/portal-proveedor/proveedores-similares", icon: GitCompareArrows, roles: ["super_admin"] },
      { label: "Filtro Super Admin", href: "/portal-proveedor/super-admin-filter", icon: Filter, roles: ["super_admin"] },
    ],
  },
];
