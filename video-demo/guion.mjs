/**
 * El guion, en un solo lugar.
 *
 * Lo leen los tres scripts -la voz, la grabacion y el montaje- para que no se
 * desincronicen: si aca se agrega una parte, las tres la ven.
 *
 * `texto` es lo que dice la voz. `accion` la hace Playwright. El zoom lo decide
 * la grabacion midiendo el elemento en pantalla, no se escribe a mano aca:
 * `zoom` dice QUE mirar, no en que pixeles esta.
 */
export const VOZ = "es-CL-CatalinaNeural";

export const HERRAMIENTA = {
  nombre: "Rotomartillo inalámbrico",
  codigo: "HRR-0145",
  obraDestino: "SELMAN",
  custodio: "Cristian Higueras",
  estadoSalida: "Buena",
};

export const PARTES = [
  {
    id: "01-apertura",
    texto: "Control de Herramientas, dentro de VDV Suite.",
    zoom: null,
    // La apertura es el titulo de HyperFrames: no se graba pantalla.
    soloTitulo: true,
  },
  {
    id: "02-inventario",
    texto:
      "Este es el inventario completo: ciento treinta y nueve unidades en ochenta y tres modelos. Los datos salen del tablero de monday; la aplicación no guarda una copia aparte.",
    zoom: "encabezado",
  },
  {
    id: "03-buscador",
    texto: "El buscador encuentra por nombre, por código, por marca o por modelo.",
    zoom: "buscador",
  },
  {
    id: "04-filtros",
    texto: "Y los filtros acotan por obra, por estado del inventario y por categoría.",
    zoom: "filtros",
  },
  {
    id: "05-abrir-ficha",
    texto: "Cada herramienta tiene su ficha.",
    zoom: "tarjeta",
  },
  {
    id: "06-estado",
    texto:
      "Arriba queda a la vista lo importante: en qué estado está, en qué obra, quién la tiene a cargo y cuál fue su último movimiento.",
    zoom: "bloqueEstado",
  },
  {
    id: "07-foto",
    texto:
      "La foto se saca con el teléfono desde la misma obra, y es la que después se ve como miniatura en el listado.",
    zoom: "panelFotos",
  },
  {
    id: "08-solapas",
    texto:
      "Abajo hay cuatro vistas: los datos, el mapa de dónde estuvo, la línea de tiempo con todo su historial, y la lista.",
    zoom: "solapas",
  },
  {
    id: "09-registrar",
    texto: "Cuando la herramienta se mueve, el movimiento se registra desde acá.",
    zoom: "botonSalida",
  },
  {
    id: "10-dialogo",
    texto:
      "La aplicación pide a qué obra va, quién queda a cargo y en qué estado sale. Las personas salen del tablero Equipo VDV: no se escribe un nombre a mano, siempre se elige a alguien del equipo.",
    zoom: "campoCustodio",
  },
  {
    id: "11-registrado",
    texto:
      "Al registrar, el movimiento se escribe en monday y la ficha queda actualizada, firmada con la persona que lo registró.",
    zoom: "bloqueEstado",
  },
  {
    id: "12-pendiente",
    texto:
      "Y como la herramienta cambió de manos, queda esperando que del otro lado confirmen que llegó. Ese aviso es lo que antes no existía.",
    zoom: "avisoPendiente",
  },
];
