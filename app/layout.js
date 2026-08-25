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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      {/* min-h-dvh (no solo min-h-screen): en mobile, "100vh" salta cada vez que
          la barra de direcciones del navegador se oculta/muestra al scrollear -
          dvh se ajusta al viewport visible real en cada momento. */}
      <body data-app="shell" className="flex h-full min-h-dvh overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
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
