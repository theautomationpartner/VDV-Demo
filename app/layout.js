import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import { AuthGate } from "@/components/auth/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "VDV Suite",
  description: "OC Tracker, Vale Express y Portal Proveedor unificados",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} overflow-x-hidden antialiased`}
    >
      {/* LA PAGINA SCROLLEA, no un recuadro de adentro.

          Antes el <body> media la pantalla exacta y el scroll vivia en <main>.
          Se veia igual, pero para el navegador el contenido quedaba en una capa
          aparte, y cuando Chrome oculta la pestana - por ejemplo mientras esta
          abierto el cuadro de dialogo de archivos de Windows - suelta esa capa
          y la pagina se ve negra. Comprobado en dos computadoras: con scroll de
          pagina normal no pasa, con el recuadro si.

          El menu lateral se queda quieto con `sticky`, que no saca al elemento
          del flujo: la fila flex sigue igual y el ancho puede seguir animandose
          al plegarlo. */}
      <body data-app="shell" className="flex min-h-svh bg-[var(--background)] text-[var(--foreground)]">
        <AuthGate>
          <AppSidebar />
          {/* pb-28 en mobile reserva espacio para el bottom nav fijo (h-16) + la
              tira de sub-nav (h-12) de AppSidebar, que no ocupan flujo normal;
              md:pb-0 porque ahi la navegacion vuelve a ser el rail lateral. */}
          {/* Sin overflow-x aca: al pedir overflow en un eje el navegador
              convierte el otro en "auto", y <main> volveria a ser un contenedor
              de scroll - justo lo que queremos evitar. Lo ancho ya lo recorta
              el <html>. */}
          <main className="min-w-0 flex-1 pb-28 md:pb-0">{children}</main>
        </AuthGate>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
