import { TestBed } from '@angular/core/testing';
import { CountryPicker } from './country-picker';

describe('CountryPicker', () => {
  it('tells screen readers which option the arrow keys highlight', async () => {
    await TestBed.configureTestingModule({ imports: [CountryPicker] }).compileComponents();
    const fixture = TestBed.createComponent(CountryPicker);
    fixture.componentRef.setInput('countries', ['Canada', 'Chile', 'China']);
    fixture.componentRef.setInput('inputId', 'c');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;

    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    const id = input.getAttribute('aria-activedescendant');
    expect(id).toBe('c-opt-1');
    const option = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)!;
    expect(option.textContent?.trim()).toBe('Chile');
    expect(option.getAttribute('aria-selected')).toBe('true');
  });

  it('drops the reference when the list is closed', async () => {
    await TestBed.configureTestingModule({ imports: [CountryPicker] }).compileComponents();
    const fixture = TestBed.createComponent(CountryPicker);
    fixture.componentRef.setInput('countries', ['Canada']);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')!.hasAttribute('aria-activedescendant')).toBe(false);
  });
});
