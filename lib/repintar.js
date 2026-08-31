/**
 * Obliga al navegador a volver a dibujar la pagina.
 *
 * POR QUE HACE FALTA:
 *
 * Mientras el cuadro de dialogo de archivos de Windows esta abierto, Chrome
 * deja de dibujar la pagina que quedo atras. Comprobado: con el dialogo
 * abierto, las medidas del layout siguen perfectas (la ventana, el alto del
 * shell y el del contenido dan todos iguales) pero la foto de la pantalla sale
 * en negro. No es que la pagina se rompa: es que no se repinta.
 *
 * Al cerrar el dialogo no siempre vuelve a pintarse sola. Se ve rota hasta que
 * algo cambia en pantalla - por ejemplo cambiar de pestana en el recuadro de
 * firma, que fue como se recupero la primera vez que paso.
 *
 * COMO:
 *
 * Se le aplica al <body> una transformacion nula durante dos cuadros. No mueve
 * nada ni se ve, pero invalida el dibujo de toda la pagina y obliga a
 * repintarla. Se quita enseguida porque `transform` cambia como se posicionan
 * los elementos fijos, y no queremos eso mas alla de esos milisegundos.
 */
export function repintarPagina() {
  if (typeof document === "undefined") return;
  const cuerpo = document.body;
  if (!cuerpo) return;

  const anterior = cuerpo.style.transform;
  cuerpo.style.transform = "translateZ(0)";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cuerpo.style.transform = anterior;
    });
  });
}

/**
 * Repinta la pagina la proxima vez que la ventana recupere el foco.
 *
 * Se usa al abrir el selector de archivos: el foco se va al dialogo del sistema
 * y vuelve cuando el usuario elige un archivo o cancela. Es de una sola vez: el
 * oyente se saca solo.
 */
export function repintarAlVolverElFoco() {
  if (typeof window === "undefined") return;

  const alVolver = () => {
    window.removeEventListener("focus", alVolver);
    repintarPagina();
  };
  window.addEventListener("focus", alVolver);
}
