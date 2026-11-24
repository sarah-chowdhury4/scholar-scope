import { Injectable, signal } from '@angular/core';

export type Toast = { id: number; message: string; error: boolean };

/** Short confirmations in the top corner (team design). Errors about one field stay next to that field. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private next = 1;

  show(message: string, error = false, ms = error ? 6000 : 3500): void {
    const id = this.next++;
    this.items.update((items) => [...items, { id, message, error }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}
