import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LandingPage } from './landing';

describe('LandingPage', () => {
  it('explains the product and links to sign up and sign in', async () => {
    await TestBed.configureTestingModule({ imports: [LandingPage], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('the sentence it came from');
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/login?mode=signup');
    expect(links).toContain('/login');
  });
});
