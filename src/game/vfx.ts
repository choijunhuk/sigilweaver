import Phaser from 'phaser';

/**
 * Neon-occult VFX layer (§13): additive-blended glow sprites + transient
 * vector effects (lightning, shockwaves, explosions) drawn above the arena.
 * All effects are fire-and-forget; update(dt) ages and culls them.
 */

interface Lightning {
  kind: 'lightning';
  pts: { x: number; y: number }[];
  ttl: number;
  age: number;
  color: number;
}
interface Shockwave {
  kind: 'shockwave';
  x: number;
  y: number;
  r0: number;
  r1: number;
  ttl: number;
  age: number;
  color: number;
  width: number;
}
interface Flash {
  kind: 'flash';
  x: number;
  y: number;
  r: number;
  ttl: number;
  age: number;
  color: number;
}
type Effect = Lightning | Shockwave | Flash;

export class VfxSystem {
  private gfx: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private effects: Effect[] = [];

  constructor(scene: Phaser.Scene) {
    VfxSystem.ensureTextures(scene);

    // impact / trail glow puffs
    this.glow = scene.add.particles(0, 0, 'vfx-glow', {
      speed: { min: 10, max: 90 },
      lifespan: { min: 250, max: 500 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    // sharp hot sparks that shoot out and die fast
    this.embers = scene.add.particles(0, 0, 'vfx-spark', {
      speed: { min: 120, max: 340 },
      lifespan: { min: 180, max: 420 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      gravityY: 220,
      emitting: false,
    });
    this.gfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  static ensureTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists('vfx-glow')) {
      // soft radial glow — concentric alpha rings fake a gaussian falloff
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 8; i >= 1; i--) {
        g.fillStyle(0xffffff, 0.09 * (9 - i) / 8 + 0.02);
        g.fillCircle(16, 16, i * 2);
      }
      g.generateTexture('vfx-glow', 32, 32);
      g.destroy();
    }
    if (!scene.textures.exists('vfx-spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(3, 3, 3);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(3, 3, 5);
      g.generateTexture('vfx-spark', 10, 10);
      g.destroy();
    }
  }

  // ── emitters ─────────────────────────────────────────────────────────────
  impact(x: number, y: number, color: number, count = 4): void {
    this.glow.particleTint = color;
    this.glow.emitParticleAt(x, y, count);
  }

  burst(x: number, y: number, color: number, count = 16): void {
    this.embers.particleTint = color;
    this.embers.emitParticleAt(x, y, count);
    this.glow.particleTint = color;
    this.glow.emitParticleAt(x, y, 6);
    this.effects.push({ kind: 'flash', x, y, r: 46, ttl: 200, age: 0, color });
  }

  trail(x: number, y: number, color: number): void {
    this.glow.particleTint = color;
    this.glow.emitParticleAt(x, y, 1);
  }

  lightning(x1: number, y1: number, x2: number, y2: number, color = 0x9be8ff): void {
    const pts = [{ x: x1, y: y1 }];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = Math.max(4, Math.min(14, Math.floor(len / 46)));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const amp = len * 0.09 * Math.sin(Math.PI * t); // widest mid-bolt
      const off = (Math.random() * 2 - 1) * amp;
      pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
    }
    pts.push({ x: x2, y: y2 });
    this.effects.push({ kind: 'lightning', pts, ttl: 260, age: 0, color });
    this.impact(x2, y2, color, 5);
    this.embers.particleTint = color;
    this.embers.emitParticleAt(x2, y2, 5);
  }

  shockwave(x: number, y: number, radius: number, color = 0x7c6cff, width = 6): void {
    this.effects.push({
      kind: 'shockwave', x, y, r0: 24, r1: radius, ttl: 380, age: 0, color, width,
    });
  }

  explosion(x: number, y: number, radius: number, color = 0xff8c42): void {
    this.effects.push({ kind: 'flash', x, y, r: radius * 0.85, ttl: 280, age: 0, color });
    this.shockwave(x, y, radius * 1.25, color, 4);
    this.burst(x, y, color, 20);
  }

  /** enemy spawn telegraph: ring converges inward, then a soft pop */
  materialize(x: number, y: number, color: number, durationMs = 800): void {
    this.effects.push({
      kind: 'shockwave', x, y, r0: 90, r1: 8, ttl: durationMs, age: 0, color, width: 3,
    });
    this.effects.push({ kind: 'flash', x, y, r: 30, ttl: durationMs, age: 0, color });
    this.impact(x, y, color, 3);
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(dtMs: number): void {
    const g = this.gfx;
    g.clear();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dtMs;
      if (e.age >= e.ttl) {
        this.effects.splice(i, 1);
        continue;
      }
      const t = e.age / e.ttl; // 0..1
      if (e.kind === 'lightning') this.drawLightning(g, e, t);
      else if (e.kind === 'shockwave') this.drawShockwave(g, e, t);
      else this.drawFlash(g, e, t);
    }
  }

  private drawLightning(g: Phaser.GameObjects.Graphics, e: Lightning, t: number): void {
    const fade = 1 - t;
    // three passes: wide halo, colored core, white-hot center
    const passes: [number, number, number][] = [
      [11, e.color, 0.14 * fade],
      [4, e.color, 0.65 * fade],
      [1.6, 0xffffff, 0.95 * fade],
    ];
    for (const [w, color, alpha] of passes) {
      g.lineStyle(w, color, alpha);
      g.beginPath();
      g.moveTo(e.pts[0].x, e.pts[0].y);
      for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x, e.pts[i].y);
      g.strokePath();
    }
  }

  private drawShockwave(g: Phaser.GameObjects.Graphics, e: Shockwave, t: number): void {
    const ease = 1 - (1 - t) * (1 - t); // ease-out
    const r = e.r0 + (e.r1 - e.r0) * ease;
    const fade = 1 - t;
    g.lineStyle(e.width * (1 - t * 0.6), e.color, 0.55 * fade);
    g.strokeCircle(e.x, e.y, r);
    g.lineStyle(1.5, 0xffffff, 0.5 * fade);
    g.strokeCircle(e.x, e.y, r * 0.97);
  }

  private drawFlash(g: Phaser.GameObjects.Graphics, e: Flash, t: number): void {
    const fade = (1 - t) * (1 - t);
    g.fillStyle(e.color, 0.34 * fade);
    g.fillCircle(e.x, e.y, e.r * (0.7 + 0.5 * t));
    g.fillStyle(0xffffff, 0.25 * fade);
    g.fillCircle(e.x, e.y, e.r * 0.35 * (1 - t * 0.5));
  }
}
