export default function HerramientasLayout({ children }) {
  return (
    <div data-app="herramientas" className="bg-[var(--background)] text-[var(--foreground)] min-h-full">
      {children}
    </div>
  );
}
