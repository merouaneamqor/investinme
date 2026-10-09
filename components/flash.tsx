export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <p className={error ? "flash error" : "flash notice"} role="status">
      {error || notice}
    </p>
  );
}
