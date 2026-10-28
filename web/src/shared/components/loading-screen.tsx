/** Layar penuh "Memuat…" saat rute atau sesi belum siap. */
export function LoadingScreen() {
  return (
    <p
      role="status"
      className="flex min-h-dvh items-center justify-center p-4 text-muted"
    >
      Memuat…
    </p>
  );
}
