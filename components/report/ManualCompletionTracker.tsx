'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  getManualReviewDrafts,
  summarizeManualCompletion,
  summarizeManualReviewState
} from '@/lib/report/manual-review';
import { useAppStore } from '@/stores/app-store';
import type { ManualCustomElementCategory } from '@/types/file-entry';

const categoryLabels: Record<ManualCustomElementCategory, string> = {
  'alt-text': 'Alt text',
  structure: 'Structure',
  'reading-order': 'Reading order',
  table: 'Table',
  'form-field': 'Form field',
  metadata: 'Metadata',
  other: 'Other'
};

const categoryOptions = Object.entries(categoryLabels) as Array<[ManualCustomElementCategory, string]>;

export function ManualCompletionTracker({ fileId, embedded = false }: { fileId: string; embedded?: boolean }) {
  const file = useAppStore((state) => state.files.find((entry) => entry.id === fileId));
  const addManualCustomElement = useAppStore((state) => state.addManualCustomElement);
  const updateManualCustomElement = useAppStore((state) => state.updateManualCustomElement);
  const removeManualCustomElement = useAppStore((state) => state.removeManualCustomElement);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ManualCustomElementCategory>('structure');
  const [note, setNote] = useState('');

  const completion = summarizeManualCompletion(file);
  const review = summarizeManualReviewState(file);
  const customElements = getManualReviewDrafts(file).customElements;
  const remaining = Math.max(completion.total - completion.completed, 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addManualCustomElement(fileId, { title, category, note });
    setTitle('');
    setCategory('structure');
    setNote('');
  }

  return (
    <section className={embedded ? 'space-y-4' : 'space-y-4 rounded border border-[rgba(24,43,73,0.2)] bg-white p-4 shadow-sm'}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <h2>Manual completion</h2>
          <p className="mt-1 text-sm text-[var(--ucsd-text)]">
            Track the items that still need hands-on remediation before you upload the revised PDF for validation.
          </p>
        </div>
        <div className="rounded border border-[rgba(24,43,73,0.14)] bg-slate-50 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[var(--ucsd-navy)]">Completion</p>
            <p className="text-2xl font-semibold text-[var(--ucsd-navy)]">{completion.percent}%</p>
          </div>
          <div
            className="mt-2 h-2 rounded-full bg-white"
            role="progressbar"
            aria-label="Manual remediation completion"
            aria-valuenow={completion.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-2 rounded-full bg-[var(--ucsd-blue)]"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--ucsd-text)]">
            {completion.completed} of {completion.total} tracked items complete
            {remaining > 0 ? `, ${remaining} remaining` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-[rgba(24,43,73,0.12)] p-3 text-sm">
          <p className="font-medium text-[var(--ucsd-navy)]">Alt text</p>
          <p className="mt-1 text-[var(--ucsd-text)]">
            {completion.altText.completed} of {completion.altText.total} images covered
          </p>
        </div>
        <div className="rounded border border-[rgba(24,43,73,0.12)] p-3 text-sm">
          <p className="font-medium text-[var(--ucsd-navy)]">Tables</p>
          <p className="mt-1 text-[var(--ucsd-text)]">
            {completion.tables.completed} of {completion.tables.total} detected tables reviewed
          </p>
        </div>
        <div className="rounded border border-[rgba(24,43,73,0.12)] p-3 text-sm">
          <p className="font-medium text-[var(--ucsd-navy)]">Custom items</p>
          <p className="mt-1 text-[var(--ucsd-text)]">
            {completion.customElements.completed} of {completion.customElements.total} added items complete
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded border border-[rgba(24,43,73,0.12)] p-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="text-sm font-medium text-[var(--ucsd-navy)]">
          Add manual item
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: Fix reading order on page 2"
            className="mt-1 block w-full rounded border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
          />
        </label>
        <label className="text-sm font-medium text-[var(--ucsd-navy)]">
          Type
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ManualCustomElementCategory)}
            className="mt-1 block w-full rounded border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
          >
            {categoryOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--ucsd-navy)] md:col-span-2">
          Notes
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Location, required tag, or reviewer guidance"
            className="mt-1 block w-full rounded border border-[rgba(24,43,73,0.2)] px-3 py-2 text-sm font-normal text-[var(--ucsd-text)]"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex rounded-md bg-[var(--ucsd-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ucsd-navy)] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Add item
          </button>
        </div>
      </form>

      {customElements.length > 0 ? (
        <div className="space-y-2">
          {customElements.map((item) => (
            <article key={item.id} className="rounded border border-[rgba(24,43,73,0.12)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.status === 'done'}
                    onChange={(event) =>
                      updateManualCustomElement(fileId, item.id, {
                        status: event.target.checked ? 'done' : 'todo'
                      })
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block break-words font-medium text-[var(--ucsd-navy)]">{item.title}</span>
                    <span className="mt-1 block text-xs text-[var(--ucsd-text)]">
                      {categoryLabels[item.category]} · {item.status === 'done' ? 'Complete' : 'Remaining'}
                    </span>
                    {item.note ? (
                      <span className="mt-2 block break-words text-sm text-[var(--ucsd-text)]">{item.note}</span>
                    ) : null}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => removeManualCustomElement(fileId, item.id)}
                  className="rounded border border-[rgba(24,43,73,0.2)] px-2.5 py-1 text-xs text-[var(--ucsd-text)] hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded border border-[rgba(24,43,73,0.12)] bg-slate-50 p-3 text-sm text-[var(--ucsd-text)]">
          Add custom items for anything the automated workflow did not detect, such as reading order, form labels, metadata, or specific tag repairs.
        </p>
      )}

      {review.pendingRevalidation ? (
        <p className="text-sm text-amber-900">
          Saved manual work is waiting for re-validation after you apply it to the PDF.
        </p>
      ) : null}
    </section>
  );
}
