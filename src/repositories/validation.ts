import type { EntryInput } from './types';

export function validateEntry(input: Pick<EntryInput, 'startAt' | 'endAt'> & { quantity?: number | null }): void {
  if (input.endAt !== null && input.endAt <= input.startAt) {
    throw new Error('Das Ende muss nach dem Start liegen.');
  }
  validateQuantity(input.quantity);
}

export function validateQuantity(quantity: number | null | undefined): void {
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 0)) {
    throw new Error('Die Stückzahl muss eine ganze Zahl ab 0 sein.');
  }
}

export function normalizeArticleNumber(number: string): string {
  const trimmed = number.trim();
  if (!trimmed) throw new Error('Bitte eine Artikelnummer angeben.');
  return trimmed;
}

export function duplicateArticleError(number: string): Error {
  return new Error(`Artikelnummer ${number} gibt es bereits.`);
}
