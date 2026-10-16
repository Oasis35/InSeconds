/** Couleurs de la DA (terracotta, cyan, violet, orange, texte). */
const COLORS = ['#F0857A', '#00E5FF', '#A855F7', '#FF8A00', '#E8ECF4'];
const PIECES = 90;
const DURATION_MS = 2600;
/** Tirages par confetti (position, vitesses, taille, angle, rotation, couleur). */
const DRAWS = 7;

/**
 * Une courte pluie de confettis par-dessus tout l'écran (fenêtre comprise), sur un `<canvas>` ajouté au `body` puis retiré. Rien si le
 * mouvement réduit est demandé ou sous les E2E (classe `no-anim`). Rend la fonction qui l'arrête tout de suite.
 */
export function launchConfetti(document: Document): () => void {
  const window = document.defaultView;
  const reduced = window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (!window || reduced || document.documentElement.classList.contains('no-anim')) return () => undefined;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset['confetti'] = '';
  // Au-dessus du fond et de la fenêtre du CDK (z-index 1000), sans jamais capter un clic.
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1100';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => undefined;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = (canvas.width = window.innerWidth * ratio);
  const height = (canvas.height = window.innerHeight * ratio);
  // Des valeurs dans [0, 1) tirées d'un coup par `crypto.getRandomValues` (sans enjeu de sécurité ici, mais `Math.random` est signalé
  // par Sonar, règle S2245).
  const draws = Array.from(window.crypto.getRandomValues(new Uint32Array(PIECES * DRAWS)), v => v / 2 ** 32);
  const pieces = Array.from({ length: PIECES }, (_, i) => {
    const [x, vx, vy, size, angle, spin, color] = draws.slice(i * DRAWS, (i + 1) * DRAWS);
    return {
      x: width / 2 + (x - 0.5) * width * 0.3,
      y: height * 0.3,
      vx: (vx - 0.5) * 14 * ratio,
      vy: (-vy * 12 - 4) * ratio,
      size: (5 + size * 6) * ratio,
      angle: angle * 6,
      spin: (spin - 0.5) * 0.3,
      color: COLORS[Math.floor(color * COLORS.length)],
    };
  });

  let frame = 0;
  const stop = () => {
    window.cancelAnimationFrame(frame);
    canvas.remove();
  };
  const start = window.performance.now();
  const tick = (now: number) => {
    ctx.clearRect(0, 0, width, height);
    for (const p of pieces) {
      p.vy += 0.35 * ratio;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (now - start < DURATION_MS) frame = window.requestAnimationFrame(tick);
    else stop();
  };
  frame = window.requestAnimationFrame(tick);
  return stop;
}
