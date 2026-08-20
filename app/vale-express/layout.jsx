export default function ValeExpressLayout({ children }) {
  return (
    <div data-app="vale-express" className="bg-[var(--background)] text-[var(--foreground)] min-h-full">
      {children}
    </div>
  );
}
