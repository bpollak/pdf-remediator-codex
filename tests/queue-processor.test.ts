import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedPDF } from '@/lib/pdf/types';

const { parsePdfInWorker, readPdfPageCount, runTritonAiOcr, isLikelyScannedPdf, saveFileEntry, runAuditInWorker, remediatePdfInWorker, assessOcrTextGain } = vi.hoisted(() => ({
  // Never settles by default: simulates a long parse so the lock stays held.
  parsePdfInWorker: vi.fn((..._args: unknown[]): Promise<unknown> => new Promise(() => undefined)),
  readPdfPageCount: vi.fn((..._args: unknown[]): Promise<number> => Promise.reject(new Error('not a PDF'))),
  runTritonAiOcr: vi.fn((..._args: unknown[]): Promise<unknown> => new Promise(() => undefined)),
  isLikelyScannedPdf: vi.fn(() => false),
  runAuditInWorker: vi.fn(),
  remediatePdfInWorker: vi.fn(),
  assessOcrTextGain: vi.fn(),
  saveFileEntry: vi.fn((..._args: unknown[]) => Promise.resolve())
}));

vi.mock('@/lib/workers/client', () => ({
  parsePdfInWorker,
  runAuditInWorker,
  remediatePdfInWorker
}));
vi.mock('@/lib/client/page-count', () => ({ readPdfPageCount }));
vi.mock('@/lib/ocr/tritonai', () => ({ runTritonAiOcr }));
vi.mock('@/lib/ocr/detection', () => ({ isLikelyScannedPdf, assessOcrTextGain }));
vi.mock('@/lib/persistence/file-store', () => ({
  STORED_FILE_RETENTION_DAYS: 30,
  loadPersistedFiles: vi.fn(() => Promise.resolve({ files: [], droppedIds: [], expiredIds: [] })),
  loadPersistedFile: vi.fn(() => Promise.resolve(undefined)),
  saveFileEntry,
  deleteFileEntries: vi.fn(() => Promise.resolve()),
  clearAllStoredFiles: vi.fn(() => Promise.resolve()),
  loadAssetBytes: vi.fn(() => Promise.resolve(undefined))
}));

import { PARSE_TIMEOUT_MS, pumpQueue } from '@/components/upload/QueueProcessor';
import { useAppStore, type FileEntry } from '@/stores/app-store';
import { INTERRUPTED_MESSAGE } from '@/lib/client/error-copy';

function queued(id: string, overrides: Partial<FileEntry> = {}): FileEntry {
  return { id, name: `${id}.pdf`, size: 8, status: 'queued', progress: 0, uploadedBytes: new ArrayBuffer(8), ...overrides };
}

const scannedParse: ParsedPDF = {
  pageCount: 2,
  metadata: {},
  hasStructTree: false,
  tags: [],
  textItems: [],
  images: [],
  links: [],
  outlines: [],
  forms: []
};

const statuses = () => useAppStore.getState().files.map((file) => `${file.id}:${file.status}`);
const fileById = (id: string) => useAppStore.getState().files.find((file) => file.id === id);

describe('processing queue', () => {
  beforeEach(() => {
    saveFileEntry.mockClear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    useAppStore.setState({ files: [], hydrated: false });
    // Let the cancelled job from the test release the lock.
    await new Promise((resolve) => setTimeout(resolve, 0));
    parsePdfInWorker.mockReset().mockImplementation(() => new Promise(() => undefined));
    readPdfPageCount.mockReset().mockImplementation(() => Promise.reject(new Error('not a PDF')));
    isLikelyScannedPdf.mockReset().mockReturnValue(false);
    runTritonAiOcr.mockReset().mockImplementation(() => new Promise(() => undefined));
  });

  it('processes one file at a time however often it is pumped', async () => {
    useAppStore.setState({ files: [queued('a'), queued('b')], hydrated: true });

    pumpQueue();
    pumpQueue();
    await Promise.resolve();
    pumpQueue();

    expect(statuses()).toEqual(['a:parsing', 'b:queued']);
    await vi.waitFor(() => expect(parsePdfInWorker).toHaveBeenCalledTimes(1));
    pumpQueue();
    expect(statuses()).toEqual(['a:parsing', 'b:queued']);
    expect(parsePdfInWorker).toHaveBeenCalledTimes(1);
  });

  it('moves on when the running file is removed', async () => {
    useAppStore.setState({ files: [queued('c'), queued('d')], hydrated: true });
    pumpQueue();
    expect(statuses()).toEqual(['c:parsing', 'd:queued']);

    useAppStore.getState().removeFile('c');
    pumpQueue();

    expect(statuses()).toEqual(['d:parsing']);
  });

  it('saves the attempt marker before any heavy work starts', async () => {
    useAppStore.setState({ files: [queued('m', { processingAttempts: 1 })], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(parsePdfInWorker).toHaveBeenCalled());
    const firstSave = saveFileEntry.mock.calls[0]?.[0] as FileEntry;
    expect(firstSave).toMatchObject({ id: 'm', status: 'parsing', processingAttempts: 2 });
    expect(firstSave.processingStartedAt).toEqual(expect.any(String));
    expect(saveFileEntry.mock.invocationCallOrder[0]).toBeLessThan(parsePdfInWorker.mock.invocationCallOrder[0]!);
  });

  it('marks files left mid-processing by a closed tab as interrupted instead of restarting them', () => {
    useAppStore.setState({ files: [queued('x', { status: 'remediating', progress: 80 }), queued('y')], hydrated: true });
    pumpQueue();

    expect(fileById('x')).toMatchObject({ status: 'error', errorCode: 'interrupted', error: INTERRUPTED_MESSAGE });
    expect(fileById('y')?.status).toBe('parsing');
  });

  it('cancels the running job on Remove: in-flight OCR requests are aborted', async () => {
    parsePdfInWorker.mockResolvedValue(scannedParse);
    isLikelyScannedPdf.mockReturnValue(true);
    useAppStore.setState({ files: [queued('s'), queued('t')], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(runTritonAiOcr).toHaveBeenCalled());
    const options = runTritonAiOcr.mock.calls[0]?.[4] as { signal: AbortSignal };
    expect(options.signal.aborted).toBe(false);

    useAppStore.getState().removeFile('s');
    expect(options.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(fileById('t')?.status).toBe('ocr'));
  });

  it('refuses PDFs over the page limit before parsing them', async () => {
    readPdfPageCount.mockResolvedValue(301);
    useAppStore.setState({ files: [queued('big')], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(fileById('big')?.status).toBe('error'));
    expect(fileById('big')).toMatchObject({
      errorCode: 'too_many_pages',
      error: 'This PDF has 301 pages. The browser tool handles up to 300; split it into smaller files.'
    });
    expect(parsePdfInWorker).not.toHaveBeenCalled();
  });

  it('records the page count for long documents', async () => {
    readPdfPageCount.mockResolvedValue(150);
    useAppStore.setState({ files: [queued('long')], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(parsePdfInWorker).toHaveBeenCalled());
    expect(fileById('long')?.pageCount).toBe(150);
  });

  it('gives up on a stalled parse at its deadline and moves to the next file', async () => {
    vi.useFakeTimers();
    useAppStore.setState({ files: [queued('stall'), queued('next')], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(parsePdfInWorker).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(PARSE_TIMEOUT_MS + 1);

    expect(fileById('stall')).toMatchObject({ status: 'error', errorCode: 'timed_out' });
    await vi.waitFor(() => expect(parsePdfInWorker).toHaveBeenCalledTimes(2));
    expect(fileById('next')?.status).toBe('parsing');
  });

  it('shows plain-language copy and keeps the raw diagnostic for support', async () => {
    parsePdfInWorker.mockRejectedValue(new Error('Invalid PDF structure at offset 12'));
    useAppStore.setState({ files: [queued('bad')], hydrated: true });
    pumpQueue();

    await vi.waitFor(() => expect(fileById('bad')?.status).toBe('error'));
    expect(fileById('bad')?.error).toMatch(/^We couldn't read this PDF/);
    expect(fileById('bad')?.errorDetail).toBe('Invalid PDF structure at offset 12');
  });
  it('persists incomplete OCR coverage with the finished result', async () => {
    parsePdfInWorker.mockResolvedValue(scannedParse);
    isLikelyScannedPdf.mockReturnValue(true);
    assessOcrTextGain.mockReturnValue({ accepted: true });
    runAuditInWorker.mockResolvedValue({ score: 40, findings: [] });
    remediatePdfInWorker.mockResolvedValue(new ArrayBuffer(16));
    runTritonAiOcr.mockResolvedValue({ attempted: true, applied: true, parsed: scannedParse, pagesProcessed: 1, totalPages: 2, incompletePages: [2], reason: 'Page 2: text stopped early' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ attempted: false, reason: 'No verifier in this test.' }));
    useAppStore.setState({ files: [queued('partial-ocr')], hydrated: true });
    pumpQueue();
    await vi.waitFor(() => expect(fileById('partial-ocr')?.status).toBe('remediated'));
    expect(fileById('partial-ocr')).toMatchObject({ ocrApplied: true, ocrCoverage: { pagesProcessed: 1, totalPages: 2, incompletePages: [2] } });
    expect(fileById('partial-ocr')?.ocrReason).toContain('stopped early');
    expect(saveFileEntry).toHaveBeenCalledWith(expect.objectContaining({ status: 'remediated', ocrCoverage: { pagesProcessed: 1, totalPages: 2, incompletePages: [2] } }), expect.anything());
    fetchMock.mockRestore();
  });

});
