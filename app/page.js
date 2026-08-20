export default function Home() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-xl font-semibold">VDV Suite</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Elegí una app en el sidebar para empezar.
        </p>
      </div>
    </div>
  );
}
