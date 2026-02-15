'use client';

import { useAppStore } from '@/stores/app-store';
import { validatePdfFile } from '@/lib/utils/file-helpers';

export function DropZone() {
  const addFiles = useAppStore((s) => s.addFiles);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const accepted: File[] = [];

    for (const file of files) {
      if (await validatePdfFile(file)) accepted.push(file);
    }

    if (accepted.length > 0) addFiles(accepted);
  };

  return (
    <label className="block rounded-lg border-2 border-dashed border-indigo-300 p-6 text-center">
      <span className="mb-2 block font-medium">Upload PDFs (up to 10 files, 50MB each)</span>
      <input aria-label="Upload PDF files" type="file" accept="application/pdf" multiple className="mx-auto" onChange={onChange} />
    </label>
  );
}
