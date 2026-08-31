export default function GeneradorOcLayout({ children }) {
  return (
    <div
      data-app="generador-oc"
      className="min-h-full bg-[var(--background)] text-[var(--foreground)]"
    >
      {children}
    </div>
  );
}
