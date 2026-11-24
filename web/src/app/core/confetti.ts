/**
 * Lightweight confetti on a full-screen canvas (no library). The canvas ignores clicks and removes itself
 * when the pieces have fallen. Nothing runs for people who ask for reduced motion.
 */
export type ConfettiOptions = {
  /** Number of pieces. */
  count?: number;
  /** Where the burst starts, as fractions of the viewport (0–1). */
  origin?: { x: number; y: number };
  /** Spread of the burst in degrees (around straight up). */
  spread?: number;
  /** Launch speed in px per frame. */
  speed?: number;
  /** Direction of the burst in degrees: -90 is straight up, -60 up and to the right. */
  direction?: number;
};

const COLORS = ['#234f3a', '#3f8a52', '#9cc46b', '#d9ebc0', '#f2c14e', '#e07a5f', '#5b7a45'];

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; angle: number; spin: number; color: string; round: boolean };

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function confetti(options: ConfettiOptions = {}): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  const { count = 60, origin = { x: 0.5, y: 0.9 }, spread = 70, speed = 13, direction = -90 } = options;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '70' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = ((direction + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const v = speed * (0.55 + Math.random() * 0.6);
    return {
      x: origin.x * window.innerWidth,
      y: origin.y * window.innerHeight,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      round: Math.random() < 0.25,
    };
  });

  const started = performance.now();
  const frame = (now: number) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = 0;
    for (const p of pieces) {
      p.vy += 0.32; // gravity
      p.vx *= 0.985; // air
      p.vy *= 0.985;
      p.x += p.vx + Math.sin((now - started) / 300 + p.angle) * 0.6; // flutter
      p.y += p.vy;
      p.angle += p.spin;
      if (p.y < window.innerHeight + 30) alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.angle * 2)) + 2); // tumbling
      }
      ctx.restore();
    }
    if (alive > 0 && now - started < 6000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** The big one for 100%: bursts from both lower corners and the middle, a few times. */
export function celebrate(): void {
  if (prefersReducedMotion()) return;
  const wave = (delay: number) =>
    setTimeout(() => {
      confetti({ count: 90, origin: { x: 0.05, y: 0.95 }, spread: 45, speed: 21, direction: -62 });
      confetti({ count: 90, origin: { x: 0.95, y: 0.95 }, spread: 45, speed: 21, direction: -118 });
      confetti({ count: 70, origin: { x: 0.5, y: 0.95 }, spread: 90, speed: 17 });
    }, delay);
  wave(0);
  wave(450);
  wave(900);
}
