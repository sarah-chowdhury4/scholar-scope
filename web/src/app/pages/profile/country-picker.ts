import { Component, computed, input, output, signal } from '@angular/core';

/**
 * Searchable country list, laid out like the team's profile design: search box, popular destinations,
 * then the selection as removable chips. Multi-select for interests and citizenship, single-select for
 * where someone lives. The label for the search box comes from the page (it matches `inputId`).
 */
@Component({
  selector: 'app-country-picker',
  template: `
    <div class="suggest">
      <input
        [id]="inputId()"
        type="text"
        role="combobox"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="inputId() + '-list'"
        [attr.aria-activedescendant]="open() && matches().length ? optionId(active()) : null"
        aria-autocomplete="list"
        autocomplete="off"
        [placeholder]="placeholder()"
        [value]="query()"
        (input)="onInput($event)"
        (focus)="open.set(true)"
        (blur)="open.set(false)"
        (keydown)="onKey($event)"
      />
      <ul [id]="inputId() + '-list'" [hidden]="!open()" role="listbox">
        @if (matches().length === 0) {
          <li class="none">No matching countries</li>
        } @else {
          @for (country of matches(); track country; let i = $index) {
            <li [id]="optionId(i)" role="option" [class.active]="i === active()" [attr.aria-selected]="i === active()" (mousedown)="$event.preventDefault()" (click)="pick(country)">
              {{ country }}
            </li>
          }
        }
      </ul>
    </div>

    @if (popular().length) {
      @if (headings()) {
        <h3>Popular destinations</h3>
      }
      <div class="chips" [class.spaced]="!headings()" role="group" aria-label="Popular countries">
        @for (country of popular(); track country) {
          <button type="button" class="chip" [class.on]="selected().includes(country)" [attr.aria-pressed]="selected().includes(country)" (click)="toggle(country)">
            {{ country }}
          </button>
        }
      </div>
    }

    @if (headings()) {
      <h3>Your selection</h3>
    }
    <div class="chips" [class.spaced]="!headings()">
      @for (country of selected(); track country) {
        <button type="button" class="chip picked" [attr.aria-label]="'Remove ' + country" (click)="remove(country)">
          {{ country }} <b aria-hidden="true">×</b>
        </button>
      }
      @if (showClear() && multiple() && selected().length) {
        <button type="button" class="link" (click)="clear()">Clear all</button>
      }
    </div>
    @if (headings() && selected().length === 0) {
      <p class="hint">{{ emptyText() }}</p>
    }
  `,
  styles: `
    .chips.spaced { margin-top: 10px; }
    .chips.spaced:empty { display: none; }
  `,
})
export class CountryPicker {
  readonly countries = input.required<string[]>();
  readonly popular = input<string[]>([]);
  readonly selected = input<string[]>([]);
  readonly multiple = input(true);
  readonly max = input(15);
  readonly inputId = input('country-search');
  readonly placeholder = input('Start typing a country');
  /** Show the "Popular destinations" / "Your selection" headings (the main countries card). */
  readonly headings = input(false);
  readonly showClear = input(true);
  readonly emptyText = input('No countries yet. Choose from the list above.');
  readonly selectedChange = output<string[]>();
  readonly limitHit = output<string>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const chosen = new Set(this.selected());
    return this.countries().filter((country) => !chosen.has(country) && (!q || country.toLowerCase().includes(q)));
  });

  /** Screen readers follow the highlighted option through aria-activedescendant (WCAG 4.1.2). */
  protected optionId(index: number): string {
    return `${this.inputId()}-opt-${index}`;
  }

  protected onInput(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
    this.open.set(true);
  }

  protected toggle(country: string) {
    if (this.selected().includes(country)) this.remove(country);
    else this.pick(country);
  }

  protected pick(country: string) {
    if (this.multiple()) {
      if (this.selected().includes(country)) return;
      if (this.selected().length >= this.max()) {
        this.limitHit.emit(`You can pick up to ${this.max()} countries.`);
        return;
      }
      this.selectedChange.emit([...this.selected(), country]);
    } else {
      this.selectedChange.emit([country]);
    }
    this.query.set('');
    this.active.set(0);
  }

  protected remove(country: string) {
    this.selectedChange.emit(this.selected().filter((item) => item !== country));
  }

  protected clear() {
    this.selectedChange.emit([]);
  }

  protected onKey(event: KeyboardEvent) {
    const items = this.matches();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      if (items.length) this.active.update((i) => (i + 1) % items.length);
      this.revealActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length) this.active.update((i) => (i - 1 + items.length) % items.length);
      this.revealActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const country = items[this.active()] ?? items[0];
      if (country) this.pick(country);
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  private revealActive() {
    setTimeout(() => document.getElementById(this.optionId(this.active()))?.scrollIntoView({ block: 'nearest' }));
  }
}
