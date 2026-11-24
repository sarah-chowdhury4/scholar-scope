import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

const IDLE_LIMIT_MS = 30 * 60 * 1000; // NFR-1.3

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly auth = getAuth(initializeApp(environment.firebase));
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  /** undefined = still loading, null = signed out */
  readonly user = signal<User | null | undefined>(undefined);
  readonly signedIn = computed(() => !!this.user());
  /**
   * True when the sign-in token carries the `admin` role. Only used to show the Admin link and page: the API
   * checks the same signed token on every admin request, so changing this in the browser opens nothing.
   */
  readonly isAdmin = signal(false);
  readonly ready: Promise<void>;

  constructor() {
    if (environment.useEmulators) {
      connectAuthEmulator(this.auth, 'http://localhost:9099', { disableWarnings: true });
    }
    this.ready = new Promise((resolve) => {
      onAuthStateChanged(this.auth, async (u) => {
        this.isAdmin.set(u ? await this.readAdmin(u) : false);
        this.user.set(u);
        resolve();
      });
    });
    for (const evt of ['click', 'keydown', 'pointermove', 'scroll'] as const) {
      window.addEventListener(evt, () => this.resetIdle(), { passive: true });
    }
    this.resetIdle();
  }

  async signIn(email: string, password: string) {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signUp(email: string, password: string) {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async signOut(reason?: 'idle') {
    await signOut(this.auth);
    await this.router.navigate(['/login'], { queryParams: reason ? { reason } : {} });
  }

  /** Fresh ID token for API calls (the SDK refreshes it automatically). */
  async token(): Promise<string | null> {
    return (await this.auth.currentUser?.getIdToken()) ?? null;
  }

  /** Force a new token after the sign-in email changes (and pick up a role an admin just gave). */
  async refreshToken(): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) return;
    await u.getIdToken(true);
    this.isAdmin.set(await this.readAdmin(u));
  }

  private async readAdmin(u: User): Promise<boolean> {
    try {
      return (await u.getIdTokenResult()).claims['admin'] === true;
    } catch {
      return false;
    }
  }

  private resetIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.auth.currentUser) void this.signOut('idle');
    }, IDLE_LIMIT_MS);
  }
}
