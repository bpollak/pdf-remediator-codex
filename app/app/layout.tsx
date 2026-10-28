import { AppStoreHydrator } from '@/components/app/AppStoreHydrator';
import { ProcessingNotice } from '@/components/upload/ProcessingNotice';
import { QueueProcessor } from '@/components/upload/QueueProcessor';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppStoreHydrator />
      {/* Mounted here so queued files keep processing while the user views results. */}
      <QueueProcessor />
      <section className="space-y-4">
        {/* Warns before closing the tab on every /app route while files are processing. */}
        <ProcessingNotice appWide />
        {children}
      </section>
    </>
  );
}
