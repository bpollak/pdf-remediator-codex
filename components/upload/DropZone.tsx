'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MAX_FILES_PER_UPLOAD, useAppStore } from '@/stores/app-store';
import { formatBytes, validatePdfFile } from '@/lib/utils/file-helpers';
import { planUploadsForStorage } from '@/lib/persistence/storage-quota';
import { UPLOAD_INPUT_ID } from './FileQueue';

function listNames(names: string[]): string {
  return names.join(', ');
}

export function DropZone() {
  const addFiles = useAppStore((s) => s.addFiles);
  const files = useAppStore((s) => s.files);
  // Until saved files are restored, a revised upload can't find the review it belongs to.
  const hydrated = useAppStore((s) => s.hydrated);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const revalidateFor = searchParams.get('revalidateFor');
  const baseFile = revalidateFor ? files.find((file) => file.id === revalidateFor) : undefined;

  const processFiles = useCallback(async (fileList: File[]) => {
    setValidationErrors([]);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of fileList) {
      const result = await validatePdfFile(file);
      if (result.ok) {
        accepted.push(file);
      } else {
        rejected.push(`${file.name}: ${result.reason ?? 'Invalid file.'}`);
      }
    }

    // Check browser storage before reading files in, so a full disk is
    // reported up front rather than as a save error after processing.
    const storagePlan = await planUploadsForStorage(accepted);
    if (storagePlan.refused.length > 0) {
      rejected.push(
        `There isn't enough storage space left in this browser for ${listNames(storagePlan.refused.map((file) => file.name))}` +
          `${typeof storagePlan.availableBytes === 'number' ? ` (about ${formatBytes(storagePlan.availableBytes)} free)` : ''}. ` +
          'Remove older files from the list below, or free up space on this computer, then add them again.'
      );
    }

    if (storagePlan.accepted.length > 0) {
      try {
        const { skippedNames } = await addFiles(
          storagePlan.accepted,
          baseFile
            ? {
                uploadIntent: 'revalidation',
                derivedFromFileId: baseFile.id
              }
            : undefined
        );
        if (skippedNames.length > 0) {
          const skipped = skippedNames.length;
          rejected.push(
            `Only ${MAX_FILES_PER_UPLOAD} files can be added at a time, so ${skipped === 1 ? 'this file was' : 'these files were'} not added: ${listNames(skippedNames)}. Add ${skipped === 1 ? 'it' : 'them'} after these finish.`
          );
        }
        if (baseFile) {
          router.replace('/app#upload-revised-pdf');
        }
      } catch {
        rejected.push('Unable to load selected file(s) in the browser. Try a smaller file.');
      }
    }

    if (rejected.length > 0) {
      setValidationErrors(rejected);
    }
  }, [addFiles, baseFile, router]);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!hydrated) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await processFiles(droppedFiles);
    }
  }, [hydrated, processFiles]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <label
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`group block cursor-pointer rounded-lg border-2 border-dashed py-10 px-6 text-center shadow-sm transition focus-within:border-[var(--ucsd-blue)] focus-within:ring-2 focus-within:ring-[var(--ucsd-blue)] focus-within:ring-offset-2 ${isDragOver ? 'border-[var(--ucsd-blue)] bg-blue-50' : 'border-gray-300 bg-white hover:border-[var(--ucsd-blue)] hover:bg-gray-50'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-8 w-8 text-gray-400 transition group-hover:text-[var(--ucsd-blue)]" aria-hidden="true">
          <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
        </svg>
        <span className="block font-medium text-[var(--ucsd-navy)]">
          {baseFile ? `Upload a revised PDF for ${baseFile.name}` : 'Drop PDFs here or browse'}
        </span>
        <span className="mt-1 block text-sm text-gray-500">
          {!hydrated
            ? 'Loading saved files...'
            : baseFile
              ? 'This upload will stay linked to the earlier review for re-validation.'
              : `Up to ${MAX_FILES_PER_UPLOAD} files, 50 MB each`}
        </span>
        <input id={UPLOAD_INPUT_ID} aria-label="Upload PDF files" type="file" accept="application/pdf" multiple disabled={!hydrated} className="mx-auto mt-3 text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200" onChange={onChange} />
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
