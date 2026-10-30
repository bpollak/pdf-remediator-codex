import { AppStoreHydrator } from '@/components/app/AppStoreHydrator';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppStoreHydrator />
      {/* Mounted here so queued files keep processing while the user views results. */}
      <QueueProcessor />
      <section className="space-y-4">
        {children}
      </section>
    </>
  );
}
