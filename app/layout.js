import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Toaster } from "@/components/ui/sonner";

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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body data-app="shell" className="flex h-full min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
