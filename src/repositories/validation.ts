import type { EntryInput } from './types';

export function validateEntry(input: Pick<EntryInput, 'startAt' | 'endAt'>): void {
  if (input.endAt !== null && input.endAt <= input.startAt) {
    throw new Error('Das Ende muss nach dem Start liegen.');
  }
}
