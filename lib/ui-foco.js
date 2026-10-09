/**
 * Como se marca el foco, en un solo lugar.
 *
 * Hay DOS estilos y no es un descuido: un campo y un boton se enfocan
 * distinto porque son cosas distintas.
 *
 * `FOCO_CAMPO` — para input, select y textarea. El borde que ya tiene el campo
 * se tiñe del color de acento y se le suma un halo de 1px muy bajo. Es lo que
 * usa el resto de la suite (Herramientas, Vale Express, Ingreso). Mateo pidio
 * esto el 09-oct-2026 mirando el alta de arriendos: el anillo macizo de 2px
 * sobre un campo que YA tiene borde se lee como un segundo borde encima del
 * primero, y al hacer click en cada campo el formulario parpadea.
 *
 * `FOCO_BOTON` — para botones, pestañas y cualquier cosa sin borde propio.
 * Ahi el anillo macizo SI corresponde: no hay borde que teñir, y si no se ve
 * algo claro quien navega con Tab se pierde.
 *
 * Los dos van sin `ring-offset`: el offset pinta una banda del color de
 * `--background`, que NO es el color de la superficie sobre la que estan estos
 * controles (`--surface-1`). Medido el 09-oct: #141316 contra #1d1b20. Se veia
 * como un reborde gris alrededor del anillo.
 */

export const FOCO_CAMPO =
  "focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors";

export const FOCO_BOTON =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
