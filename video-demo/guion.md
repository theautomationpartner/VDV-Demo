# Guion — Control de Herramientas (video demo para VDV)

Un video, ~2:10. Voz en off, sin música, sin subtítulos. Herramienta elegida:
**Rotomartillo inalámbrico · HRR-0145**, que está DISPONIBLE en M388, tiene foto
y permite mostrar el flujo completo de salida a obra.

Todos los textos de la columna "pantalla" están copiados de la app real.

| # | Pantalla y acción | Zoom sobre | Voz |
|---|---|---|---|
| 1 | Apertura: título animado sobre fondo violeta, logo VDV, funde a la grabación | — | Control de Herramientas, dentro de VDV Suite. |
| 2 | Listado ya cargado. Encabezado "Inventario de Herramientas · 139 unidades en 83 modelos · 18 agrupados · sin bajas" | El encabezado y el contador | Este es el inventario completo: ciento treinta y nueve unidades en ochenta y tres modelos. Los datos salen del tablero de monday; la aplicación no guarda una copia aparte. |
| 3 | Se escribe "rotomartillo" en el buscador y la lista se achica | La barra de búsqueda | El buscador encuentra por nombre, por código, por marca o por modelo. |
| 4 | Se abre y cierra el filtro de obras; quedan a la vista los tres filtros | Los tres desplegables | Y los filtros acotan por obra, por estado del inventario y por categoría. |
| 5 | Clic en la tarjeta del Rotomartillo. Abre la ficha | La tarjeta, antes del clic | Cada herramienta tiene su ficha. |
| 6 | Bloque superior: DISPONIBLE · NUEVO · BODEGA · Rotomartillo / M388 / Claudio Leyton / Último movimiento: Alta del 22-09-2026 | El bloque de estado | Arriba queda a la vista lo importante: en qué estado está, en qué obra, quién la tiene a cargo y cuál fue su último movimiento. |
| 7 | Panel "Fotos de la herramienta", con la foto del rotomartillo | La foto y los botones Tomar foto / Galería | La foto se saca con el teléfono desde la misma obra, y es la que después se ve como miniatura en el listado. |
| 8 | Scroll a las solapas. Clic en "Línea de tiempo" y se ve el historial | La fila de solapas y el historial | Abajo hay cuatro vistas: los datos, el mapa de dónde estuvo, la línea de tiempo con todo su historial, y la lista. |
| 9 | Scroll arriba. Clic en "Registrar salida" | El botón | Cuando la herramienta se mueve, el movimiento se registra desde acá. |
| 10 | Diálogo "Salida a obra". Se elige obra (SELMAN), custodio (Cristian Higueras) y estado (Buena) | El desplegable "¿Quién queda a cargo?" abierto | La aplicación pide a qué obra va, quién queda a cargo y en qué estado sale. Las personas salen del tablero Equipo VDV: no se escribe un nombre a mano, siempre se elige a alguien del equipo. |
| 11 | Clic en "Registrar". El diálogo cierra y la ficha se actualiza: EN USO, SELMAN, Cristian Higueras | El bloque de estado ya cambiado | Al registrar, el movimiento se escribe en monday y la ficha queda actualizada, firmada con la persona que lo registró. |
| 12 | Aviso "Hay 1 movimiento sin confirmar" arriba, y en la línea de tiempo "Falta confirmar que llegó" con el botón Confirmar | El aviso y la marca de pendiente | Y como la herramienta cambió de manos, queda esperando que del otro lado confirmen que llegó. Ese aviso es lo que antes no existía. |
| 13 | Funde a negro | — | — |

## Lo que se simula (nada llega a monday)

El paso 11 es el único que escribiría. Durante la grabación se corta la llamada
a `/api/herramientas/movimiento` y se le devuelve a la pantalla el resultado que
daría monday si hubiera salido bien, para que los pasos 11 y 12 se vean de
verdad. El tablero no se toca: no se crea el movimiento ni se modifica la ficha
del rotomartillo.

Lo demás —el inventario, la ficha, la foto, el historial— es lectura real del
monday de VDV.

## Datos que aparecen en pantalla

Son los reales del tablero: nombres de obras (M388, SELMAN, PL 46-50, VIK,
SAMOA, IVA), personas del Equipo VDV (Claudio Leyton, Cristian Higueras) y
valores referenciales. Es a propósito: el video es para VDV y tienen que
reconocer lo suyo.

## Pendiente de definir

- **La voz.** El pedido dice `es-AR-ElenaNeural` (argentina). Para un cliente
  chileno queda mejor `es-CL-CatalinaNeural`. Falta elegir.
