export function SideBySide({ fileId }: { fileId: string }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded border p-4 dark:border-slate-700">Original preview for {fileId}</div>
      <div className="rounded border p-4 dark:border-slate-700">Remediated preview for {fileId}</div>
    </section>
  );
}
