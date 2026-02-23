'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { validatePdfFile } from '@/lib/utils/file-helpers';

export function DropZone() {
  const addFiles = useAppStore((s) => s.addFiles);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setValidationErrors([]);
    const files = Array.from(event.target.files ?? []);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const result = await validatePdfFile(file);
      if (result.ok) {
        accepted.push(file);
      } else {
        rejected.push(`${file.name}: ${result.reason ?? 'Invalid file.'}`);
      }
    }

    if (accepted.length > 0) {
      try {
        await addFiles(accepted);
      } catch {
        rejected.push('Unable to load selected file(s) in the browser. Try a smaller file.');
      }
    }

    if (rejected.length > 0) {
      setValidationErrors(rejected);
    }

    event.target.value = '';
  };

  return (
    <div className="space-y-3">
      <label className="group block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-white py-10 px-6 text-center shadow-sm transition hover:border-[var(--ucsd-blue)] hover:bg-gray-50 focus-within:border-[var(--ucsd-blue)] focus-within:ring-2 focus-within:ring-[var(--ucsd-blue)] focus-within:ring-offset-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-8 w-8 text-gray-400 transition group-hover:text-[var(--ucsd-blue)]" aria-hidden="true">
          <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
        </svg>
        <span className="block font-medium text-[var(--ucsd-navy)]">Drop PDFs here or browse</span>
        <span className="mt-1 block text-sm text-gray-500">Up to 10 files, 50 MB each</span>
        <input aria-label="Upload PDF files" type="file" accept="application/pdf" multiple className="mx-auto mt-3 text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200" onChange={onChange} />
      </label>

      {validationErrors.length > 0 ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" aria-live="polite">
          {validationErrors.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
