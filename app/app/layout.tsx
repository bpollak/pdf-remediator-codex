import { AppStoreHydrator } from '@/components/app/AppStoreHydrator';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppStoreHydrator />
      <section className="space-y-4">{children}</section>
    </>
  );
}
