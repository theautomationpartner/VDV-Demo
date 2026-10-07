"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IngresosBoard } from '@/lib/board-sdk';
import { useObrasIngresos } from '@/hooks/useObras';
import { Spinner } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { ArrowLeft, PackageSearch, ChevronDown, RefreshCw, Image as ImageIcon, Package, Download } from 'lucide-react';
import { getAllRoles, canAccessIngreso, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras, getUserRoleData } from '@/hooks/vale-express/useUserRole';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { leerCache, guardarCache } from '@/lib/client/cache-persistente';

const ingresosBoard = new IngresosBoard();

// Foco visible (teclado) para los botones nativos de esta pantalla - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Cuantos ingresos se traen. No hay paginado a proposito.
 *
 * El tablero guarda UNA FILA POR MATERIAL, y lo que esta pantalla muestra es la
 * GUIA (una guia trae 4,1 materiales en promedio, y la mas grande 28). Con
 * paginado por cursor, una guia que cae justo en el borde de la pagina se
 * mostraria incompleta -"guia 4821, 3 materiales" cuando en realidad trae 5-, y
 * esta es una pantalla para verificar lo que se cargo: un conteo que miente es
 * peor que no mostrarlo.
 *
 * Asi que se piden las mas recientes de una, ordenadas por fecha de creacion.
 * Al ritmo actual -unos 250 ingresos por mes- 300 filas cubren mas o menos las
 * ultimas seis semanas, que es lo que alguien va a querer revisar. El techo de
 * monday para una pagina es 500.
 */
const CUANTAS = 300;

// El tablero tiene una fila por material; la unidad que la gente reconoce es la
// guia de despacho. Las que llegaron sin numero de guia se agrupan por item
// para que igual se vean, en vez de amontonarse todas juntas bajo "sin guia".
function agruparPorGuia(filas) {
    const grupos = new Map();
    for (const fila of filas) {
        const guia = (fila.guiaIngreso || '').trim();
        const clave = guia || `__sin-guia-${fila.id}`;
        let grupo = grupos.get(clave);
        if (!grupo) {
            grupo = {
                clave,
                guia,
                obra: fila.obrabodega || '',
                proveedor: fila.proveedores?.linkedItems?.[0]?.name || '',
                oc: (fila.oc || '').trim(),
                fecha: fila.fechaDeIngreso || null,
                // La foto se sube a CADA fila de la guia (ver ingreso/page.jsx),
                // asi que alcanza con quedarse con la primera que la tenga.
                itemConFoto: null,
                materiales: [],
            };
            grupos.set(clave, grupo);
        }
        if (!grupo.itemConFoto && fila.foto) grupo.itemConFoto = fila.id;
        grupo.materiales.push({
            id: fila.id,
            nombre: fila.material?.linkedItems?.[0]?.name || fila.name || 'Sin material',
            cantidad: fila.cantidadIngresada,
        });
    }
    return Array.from(grupos.values());
}

function formatearFecha(valor) {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function IngresosPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refetching, setRefetching] = useState(false);
    const [filas, setFilas] = useState([]);
    const [allowedObras, setAllowedObras] = useState([]);
    const [isRestricted, setIsRestricted] = useState(false);
    const [filterObra, setFilterObra] = useState('');
    const pedidoRef = useRef(0);

    // Las obras salen de monday; la lista escrita a mano es solo el respaldo
    // mientras carga. Ver hooks/useObras.js.
    const { options: obrasVivas } = useObrasIngresos();

    const traer = useCallback(async (obraFilter) => {
        const where = {};
        if (obraFilter) where.obrabodega = { eq: obraFilter };

        const result = await ingresosBoard
            .items()
            // `obrabodega` es obligatoria aunque no se filtre en pantalla: el
            // servidor descarta las filas cuya obra no puede leer, asi que sin
            // esta columna un usuario restringido no veria ningun ingreso.
            // Ver filtrarPorObrasPermitidas en lib/server/board-access-policy.js.
            .withColumns(['obrabodega', 'material', 'cantidadIngresada', 'guiaIngreso', 'oc', 'fechaDeIngreso', 'proveedores', 'foto'])
            .where(where)
            .orderBy({ column: 'createdAt', direction: 'desc' })
            .withPagination({ limit: CUANTAS })
            .execute();

        return result.items || [];
    }, []);

    /**
     * La carga se dispara desde los eventos -el arranque, el filtro, el boton de
     * recargar- y nunca desde un efecto que mire `filterObra`. Un efecto que
     * llama a setState apenas se monta encadena renders de mas; ademas asi el
     * filtro se comporta igual que en Solicitudes Pendientes.
     */
    const cargar = useCallback(async (obraFilter) => {
        // Lo que se trajo la vez anterior se muestra en el acto y despues se
        // revalida por atras. La consulta a monday tarda unos 2,7 segundos y
        // casi todo eso es latencia suya -100 items tardan 2,0- asi que pedir
        // menos no ayuda; lo que ayuda es no hacer esperar dos veces por lo
        // mismo. Vive en sessionStorage: se borra al cerrar la pestaña.
        const clave = `ingresos:${obraFilter || 'todas'}`;
        const guardado = leerCache(clave);
        if (guardado?.datos) {
            setFilas(guardado.datos);
            setLoading(false);
        }

        // Dos cargas solapadas (cambio de filtro, recarga) pisaban la lista con
        // la que contestara ultimo, no con la ultima pedida. Cada pedido se
        // numera y solo el mas nuevo puede escribir el estado.
        const pedido = ++pedidoRef.current;
        setRefetching(true);
        try {
            const items = await traer(obraFilter);
            if (pedido !== pedidoRef.current) return;
            setFilas(items);
            guardarCache(clave, items);
        } catch (err) {
            console.error('[INGRESOS] Load failed:', err);
            toast.error('No se pudieron cargar los ingresos. Probá recargar.');
        } finally {
            if (pedido === pedidoRef.current) {
                setRefetching(false);
                setLoading(false);
            }
        }
    }, [traer]);

    /**
     * Resuelve el rol y las obras de la sesion. No toca el estado a proposito:
     * el estado se setea en el `.then` de abajo. Un setState llamado derecho
     * desde el cuerpo de un efecto encadena renders de mas, y el linter lo
     * marca; adentro de la promesa es el patron que React recomienda.
     */
    async function resolverAcceso() {
        const session = localStorage.getItem('ve_session');
        if (!session) return null;

        const sessionData = JSON.parse(session);
        const { roles } = await getAllRoles();
        const userData = getUserRoleData(roles, sessionData.userId);
        const userRole = getRoleFromData(userData);
        const userObras = getObrasFromData(userData);
        const restricted = isObrasRestricted(userData);

        return {
            role: userRole,
            allowed: getAllowedObras(userRole, userObras, restricted),
            // Un admin ve todas las obras aunque tenga la restriccion marcada,
            // igual que en Solicitudes Pendientes.
            restricted: restricted && userRole !== 'admin',
        };
    }

    useEffect(() => {
        let activo = true;
        resolverAcceso()
            .then((datos) => {
                if (!activo) return;
                if (!datos) { router.push('/vale-express'); return; }
                // Quien puede registrar un ingreso es quien puede verlos. Si mas
                // adelante se quiere que el jefe de obra vea los de su obra, se
                // agrega su rol aca: el servidor ya filtra por obra.
                if (!canAccessIngreso(datos.role)) {
                    toast.error('No tenés acceso a esta sección debido a tu rol.');
                    router.push('/vale-express/dashboard');
                    return;
                }
                setAllowedObras(datos.allowed);
                setIsRestricted(datos.restricted);
                cargar('');
            })
            .catch((err) => {
                console.error('[INGRESOS] Init failed:', err);
                if (activo) router.push('/vale-express/dashboard');
            });
        return () => { activo = false; };
        // Solo al montar: resolverAcceso se redefine en cada render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cambiarObra = (obra) => {
        setFilterObra(obra);
        cargar(obra);
    };

    // La guia cuya foto se esta mirando, o null.
    const [fotoAbierta, setFotoAbierta] = useState(null);

    const guias = useMemo(() => agruparPorGuia(filas), [filas]);

    const obrasDelFiltro = useMemo(() => {
        const vivas = Array.isArray(obrasVivas) && obrasVivas.length ? obrasVivas : allowedObras;
        return isRestricted ? vivas.filter(o => allowedObras.includes(o)) : vivas;
    }, [obrasVivas, allowedObras, isRestricted]);

    if (loading) {
        return (
            <div className="min-h-dvh bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-background text-foreground">
            <Toaster richColors position="top-center" />

            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => router.push('/vale-express/dashboard')} className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`} aria-label="Volver">
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center shrink-0">
                        <PackageSearch className="w-[18px] h-[18px] text-[var(--chart-2)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Registro de Ingresos</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">
                            {guias.length} guía{guias.length !== 1 ? 's' : ''} · {filas.length} material{filas.length !== 1 ? 'es' : ''}
                        </p>
                    </div>
                    <button onClick={() => cargar(filterObra)} disabled={refetching} className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`} aria-label="Recargar">
                        <RefreshCw className={`w-[18px] h-[18px] ${refetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="px-4 pb-3">
                    <div className="relative">
                        <select
                            id="filtro-obra"
                            value={filterObra}
                            onChange={(e) => cambiarObra(e.target.value)}
                            className="w-full h-12 px-3 pr-9 text-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
                            aria-label="Filtrar por obra o bodega"
                        >
                            <option value="">Todas mis obras</option>
                            {obrasDelFiltro.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
                    </div>
                </div>
            </header>

            <main className="px-4 py-4 pb-10">
                <div className={`transition-opacity ${refetching ? 'opacity-50' : 'opacity-100'}`}>
                    {guias.length === 0 ? (
                        <div className="py-16 text-center">
                            <PackageSearch className="w-10 h-10 mx-auto mb-3 text-[var(--fg-subtle)]" />
                            <p className="text-sm font-medium text-foreground mb-1">No hay ingresos para mostrar</p>
                            <p className="text-sm text-[var(--fg-muted)]">
                                {filterObra ? `No se registraron ingresos en ${filterObra}.` : 'Todavía no se registró ningún ingreso.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {guias.map(g => <GuiaCard key={g.clave} guia={g} onVerFoto={() => setFotoAbierta(g)} />)}
                        </div>
                    )}
                </div>

                {guias.length > 0 && (
                    <p className="mt-6 text-center text-xs text-[var(--fg-subtle)]">
                        Se muestran los {CUANTAS} ingresos más recientes.
                    </p>
                )}
            </main>

            {/* La `key` lo rehace por cada guia: si no, el estado de carga de la
                foto anterior se quedaria pegado al abrir la siguiente. */}
            <VisorFoto key={fotoAbierta?.clave ?? 'ninguna'} guia={fotoAbierta} onCerrar={() => setFotoAbierta(null)} />
        </div>
    );
}

/**
 * Mira la foto sin bajarla.
 *
 * monday sirve el archivo con `content-disposition: attachment`, asi que un
 * enlace comun lo descarga -que es lo que hacia antes-. Un <img> ignora esa
 * cabecera y lo dibuja, asi que la misma direccion sirve para las dos cosas:
 * acá se ve, y el boton de abajo la baja. Son JPG de entre 40 KB y 1,6 MB, y
 * no se pide ninguna hasta que alguien abre esta ventana: con 95 guias en
 * pantalla, cargarlas todas de entrada seria insostenible en un celular.
 */
function VisorFoto({ guia, onCerrar }) {
    const [estado, setEstado] = useState('cargando');
    const src = guia
        ? `/api/monday/archivo?boardKey=IngresosBoard&itemId=${encodeURIComponent(guia.itemConFoto)}&columna=foto`
        : null;

    return (
        <Dialog open={Boolean(guia)} onOpenChange={(abierto) => !abierto && onCerrar()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <ImageIcon className="h-4 w-4 text-[var(--chart-2)]" />
                        {guia?.guia ? `Guía ${guia.guia}` : 'Foto del ingreso'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex min-h-[200px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2">
                    {estado === 'cargando' && <Spinner className="size-7 text-accent" />}
                    {estado === 'error' ? (
                        <p className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
                            No se pudo mostrar la foto. Probá descargarla.
                        </p>
                    ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={src}
                            alt={guia?.guia ? `Guía de despacho ${guia.guia}` : 'Foto del ingreso'}
                            onLoad={() => setEstado('ok')}
                            onError={() => setEstado('error')}
                            className={`max-h-[65vh] w-auto max-w-full rounded-[var(--radius-sm)] ${estado === 'cargando' ? 'hidden' : ''}`}
                        />
                    )}
                </div>

                <a
                    href={src ?? '#'}
                    download
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-sm font-medium text-foreground active:bg-[var(--surface-2)] transition-colors ${FOCUS_RING}`}
                >
                    <Download className="h-4 w-4" />
                    Descargar
                </a>
            </DialogContent>
        </Dialog>
    );
}

function GuiaCard({ guia, onVerFoto }) {
    return (
        <article className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-snug break-words">
                        {guia.guia ? `Guía ${guia.guia}` : 'Ingreso sin número de guía'}
                    </h3>
                    {guia.proveedor && (
                        <p className="text-xs text-[var(--fg-muted)] mt-0.5 break-words">{guia.proveedor}</p>
                    )}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius-sm)] bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] text-[var(--accent)] border border-[color-mix(in_hsl,var(--accent)_20%,transparent)] shrink-0">
                    {guia.obra || 'Sin obra'}
                </span>
            </div>

            <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1">
                {guia.fecha && <DetalleChico label="Ingreso" value={formatearFecha(guia.fecha)} />}
                {guia.oc && <DetalleChico label="OC" value={guia.oc} />}
                <DetalleChico label="Materiales" value={String(guia.materiales.length)} />
            </div>

            <ul className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                {guia.materiales.map(m => (
                    <li key={m.id} className="px-4 py-2.5 flex items-start gap-2.5">
                        <Package className="w-4 h-4 text-[var(--chart-1)] shrink-0 mt-0.5" />
                        <span className="flex-1 min-w-0 text-sm text-foreground break-words">{m.nombre}</span>
                        <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">{m.cantidad ?? '-'}</span>
                    </li>
                ))}
            </ul>

            {guia.itemConFoto && (
                <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
                    {/* Abre la foto en otra pestaña. La URL que monday guarda en la
                        columna exige sesion de monday, asi que se pasa por
                        /api/monday/archivo, que resuelve la URL firmada con el
                        token del servidor y verifica el rol y la obra. */}
                    <button
                        type="button"
                        onClick={onVerFoto}
                        className={`inline-flex items-center gap-2 min-h-11 px-3 -mx-1 rounded-[var(--radius-md)] text-sm font-medium text-[var(--chart-2)] active:bg-[var(--surface-2)] transition-colors ${FOCUS_RING}`}
                    >
                        <ImageIcon className="w-4 h-4" />
                        Ver foto de la guía
                    </button>
                </div>
            )}
        </article>
    );
}

function DetalleChico({ label, value }) {
    return (
        <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[11px] uppercase tracking-wide text-[var(--fg-subtle)] shrink-0">{label}</span>
            <span className="text-sm text-foreground break-words">{value}</span>
        </div>
    );
}
