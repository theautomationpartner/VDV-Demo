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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
    >
      {/* Alto exacto de la pantalla y sin scroll propio: el unico que scrollea
          es <main>. Si <body> tambien pudiera, aparecerian DOS barras juntas -
          pasaba al abrir un desplegable cerca del fondo, porque esos menus se
          montan como hijos de <body> y estiraban el documento.

          svh y no vh ni dvh:
          - "vh" cuenta el alto con la barra de direcciones escondida, asi que
            en mobile tapaba parte del contenido.
          - "dvh" es el alto visible en cada momento, y el navegador lo recalcula
            solo: lo achica cuando aparece el teclado en pantalla o una ventana
            del sistema, y ahi el shell se encoge de golpe. Es lo que se veia al
            abrir el selector de archivos de Windows.
          - "svh" es el alto util y NO se mueve nunca. Es lo que necesita una
            aplicacion que ocupa la pantalla entera. */}
      <body data-app="shell" className="flex h-svh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <AuthGate>
          <AppSidebar />
          {/* pb-28 en mobile reserva espacio para el bottom nav fijo (h-16) + la
              tira de sub-nav (h-12) de AppSidebar, que no ocupan flujo normal;
              md:pb-0 porque ahi la navegacion vuelve a ser el rail lateral. */}
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-28 md:pb-0">{children}</main>
        </AuthGate>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
