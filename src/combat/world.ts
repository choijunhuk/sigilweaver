import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { EnemyDef, SpellConfig } from '../data/schemas';
import type { Sigil } from '../gesture/types';
import type { Enemy, Projectile, PlayerState, Vec2 } from './types';

export const FIELD_W = 720;
export const FIELD_H = 853;
const KNOCK_FRICTION = 6; // /s exponential decay
const STAGGER_MS = 900;

/**
 * Pure headless combat simulation (§14: knows nothing about rendering).
 * Fixed player position, enemies approach, spells fire on gesture events.
 * All timing uses internal world-time ms advanced by update(dtMs).
 */
export class CombatWorld {
  t = 0;
  player: PlayerState;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  kills = 0;
  /** spell cooldown expiry, world-time ms */
  private cooldowns = new Map<string, number>();
  private nextId = 1;
  /** runes can tune these (Phase 4) */
  mods = {
    boltPierce: 0,
    boltSplit: false,
    arcChains: 0, // extra chains
    wardReflect: false,
    burnExplode: false,
    shockOnExplosion: false,
    manaMaxBonus: 0,
    focusBonus: 0,
    damageMult: 1,
  };

  constructor(
    public spells: SpellConfig,
    private enemyDefs: Map<string, EnemyDef>,
    private rng: Rng,
    private bus: EventBus,
  ) {
    this.player = {
      x: FIELD_W / 2,
      y: FIELD_H - 130,
      hp: 100,
      maxHp: 100,
      mana: spells.mana.max,
      manaMax: spells.mana.max,
      wardUntil: 0,
      focusHeld: false,
      alive: true,
    };
  }

  get aliveEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.alive);
  }

  spawn(kind: string, x?: number, y?: number, materializeMs = 0): Enemy {
    const def = this.enemyDefs.get(kind);
    if (!def) throw new Error(`unknown enemy kind: ${kind}`);
    let enemy = this.enemies.find((e) => !e.alive);
    if (!enemy) {
      enemy = {} as Enemy;
      this.enemies.push(enemy);
    }
    Object.assign(enemy, {
      id: this.nextId++,
      def,
      x: x ?? 40 + this.rng.next() * (FIELD_W - 80),
      y: y ?? -30,
      hp: def.hp,
      // materializing enemies hold still briefly — spawn telegraph (§4)
      state: materializeMs > 0 ? 'stagger' : 'move',
      stateUntil: this.t + materializeMs,
      attackReadyAt: 0,
      knockX: 0,
      knockY: 0,
      statuses: new Map(),
      shieldUp: !!def.frontShield,
      alive: true,
    } satisfies Partial<Enemy> as Enemy);
    this.bus.emit('onEnemySpawn', { kind, enemyId: enemy.id, x: enemy.x, y: enemy.y });
    return enemy;
  }

  cast(sigil: Sigil): boolean {
    if (!this.player.alive || sigil === 'NONE' || sigil === 'FOCUS') return false;
    const cdKey = sigil;
    if ((this.cooldowns.get(cdKey) ?? 0) > this.t) return false;

    switch (sigil) {
      case 'BOLT': {
        const target = this.nearestEnemy(this.player);
        const dir = target
          ? norm(target.x - this.player.x, target.y - this.player.y)
          : { x: 0, y: -1 };
        this.fireBolt(dir);
        if (this.mods.boltSplit) {
          this.fireBolt(rotate(dir, 0.35));
          this.fireBolt(rotate(dir, -0.35));
        }
        this.cooldowns.set(cdKey, this.t + this.spells.bolt.cooldownMs);
        break;
      }
      case 'WARD':
        this.player.wardUntil = this.t + this.spells.ward.durationMs;
        this.cooldowns.set(cdKey, this.t + this.spells.ward.cooldownMs);
        break;
      case 'PULSE': {
        const p = this.spells.pulse;
        for (const e of this.aliveEnemies) {
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const d = Math.hypot(dx, dy);
          if (d > p.radius) continue;
          const dir = norm(dx, dy);
          e.knockX += dir.x * p.knockback;
          e.knockY += dir.y * p.knockback;
          this.stagger(e);
          this.damage(e, p.damage, ['pulse'], this.player);
        }
        this.cooldowns.set(cdKey, this.t + p.cooldownMs);
        break;
      }
      case 'ARC': {
        const a = this.spells.arc;
        if (this.player.mana < a.manaCost) return false;
        const first = this.nearestEnemy(this.player);
        if (!first) return false;
        this.player.mana -= a.manaCost;
        this.emitMana();
        let current: Enemy | null = first;
        let from: Vec2 = this.player;
        const hit = new Set<number>();
        const totalChains = a.chains + this.mods.arcChains;
        for (let i = 0; i <= totalChains && current; i++) {
          hit.add(current.id);
          this.bus.emit('onLightning', { x1: from.x, y1: from.y, x2: current.x, y2: current.y });
          const dmg = current.statuses.has('shock') ? a.damage * 2 : a.damage;
          this.damage(current, dmg, ['arc', 'lightning'], this.player);
          from = current;
          current = this.nearestEnemy(from, (e) => !hit.has(e.id), a.chainRange);
        }
        this.cooldowns.set(cdKey, this.t + a.cooldownMs);
        break;
      }
    }
    this.bus.emit('onSpellCast', { sigil, x: this.player.x, y: this.player.y });
    return true;
  }

  private fireBolt(dir: Vec2): void {
    const b = this.spells.bolt;
    this.spawnProjectile({
      x: this.player.x,
      y: this.player.y,
      vx: dir.x * b.speed,
      vy: dir.y * b.speed,
      damage: b.damage,
      radius: b.radius,
      friendly: true,
      pierce: this.mods.boltPierce,
      tags: ['bolt', 'fire'],
    });
  }

  spawnProjectile(init: Omit<Projectile, 'id' | 'alive'>): Projectile {
    let p = this.projectiles.find((x) => !x.alive);
    if (!p) {
      p = {} as Projectile;
      this.projectiles.push(p);
    }
    Object.assign(p, init, { id: this.nextId++, alive: true });
    return p;
  }

  setFocusHeld(held: boolean): void {
    this.player.focusHeld = held;
  }

  update(dtMs: number): void {
    if (!this.player.alive) return;
    this.t += dtMs;
    const dt = dtMs / 1000;

    // mana
    const regen =
      this.spells.mana.regenPerSec +
      (this.player.focusHeld ? this.spells.focus.manaPerSec + this.mods.focusBonus : 0);
    const before = this.player.mana;
    this.player.mana = Math.min(this.player.manaMax, this.player.mana + regen * dt);
    if (Math.floor(before) !== Math.floor(this.player.mana)) this.emitMana();

    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    for (const p of this.projectiles) if (p.alive) this.updateProjectile(p, dt);

    // scheduled effects (thunderstorm strikes etc.)
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (this.t >= this.scheduled[i].at) {
        const fn = this.scheduled[i].fn;
        this.scheduled.splice(i, 1);
        fn();
      }
    }
  }

  private scheduled: { at: number; fn: () => void }[] = [];

  schedule(delayMs: number, fn: () => void): void {
    this.scheduled.push({ at: this.t + delayMs, fn });
  }

  /** §6: phrase magic fires as a bonus on top of the single sigil cast. */
  castPhrase(phraseId: string, manaCost: number): boolean {
    if (this.player.mana < manaCost) return false;
    this.player.mana -= manaCost;
    this.emitMana();

    switch (phraseId) {
      case 'chain_surge': {
        // instant 3-chain lightning from nearest
        let current = this.nearestEnemy(this.player);
        let from: Vec2 = this.player;
        const hit = new Set<number>();
        for (let i = 0; i < 3 && current; i++) {
          hit.add(current.id);
          this.bus.emit('onLightning', { x1: from.x, y1: from.y, x2: current.x, y2: current.y });
          const dmg = current.statuses.has('shock') ? 24 : 12;
          this.damage(current, dmg, ['arc', 'lightning', 'phrase'], this.player);
          from = current;
          current = this.nearestEnemy(from, (e) => !hit.has(e.id), 260);
        }
        break;
      }
      case 'fire_lance': {
        // piercing great lance upward through the field + burn
        const target = this.nearestEnemy(this.player);
        const dir = target
          ? norm(target.x - this.player.x, target.y - this.player.y)
          : { x: 0, y: -1 };
        this.spawnProjectile({
          x: this.player.x,
          y: this.player.y,
          vx: dir.x * 700,
          vy: dir.y * 700,
          damage: 30,
          radius: 24,
          friendly: true,
          pierce: 99,
          tags: ['fire', 'lance', 'phrase'],
          applyStatus: { status: 'burn', durationMs: 3000, dps: 4 },
        });
        break;
      }
      case 'thunderstorm': {
        // 3s of field-wide strikes (§6)
        for (let i = 0; i < 8; i++) {
          this.schedule(i * 375, () => {
            const targets = this.aliveEnemies;
            if (!targets.length) return;
            const e = targets[this.rngInt(targets.length)];
            this.bus.emit('onLightning', { x1: e.x, y1: -40, x2: e.x, y2: e.y });
            this.damage(e, 12, ['arc', 'lightning', 'phrase'], null);
          });
        }
        break;
      }
      default:
        return false;
    }
    this.bus.emit('onPhraseCompleted', { phraseId });
    return true;
  }

  private rngInt(n: number): number {
    return Math.min(n - 1, Math.floor(this.rng.next() * n));
  }

  private updateEnemy(e: Enemy, dt: number): void {
    // statuses
    for (const [name, st] of e.statuses) {
      if (st.dps) this.damage(e, st.dps * dt, [name, 'status'], null, true);
      if (!e.alive) return;
      if (this.t >= st.until) e.statuses.delete(name);
    }

    // knockback decay
    e.x += e.knockX * dt;
    e.y += e.knockY * dt;
    const f = Math.exp(-KNOCK_FRICTION * dt);
    e.knockX *= f;
    e.knockY *= f;
    e.x = Math.max(20, Math.min(FIELD_W - 20, e.x));
    if (e.y < -60) e.y = -60;

    if (e.state === 'stagger' || e.state === 'recover') {
      if (this.t >= e.stateUntil) {
        e.state = 'move';
        if (e.def.frontShield) e.shieldUp = true;
      }
      return;
    }

    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (e.state === 'windup') {
      if (this.t < e.stateUntil) return;
      // strike lands
      e.state = 'recover';
      e.stateUntil = this.t + e.def.attackCooldownMs;
      if (dist <= e.def.touchRange * 1.4) this.hitPlayer(e.def.attackDamage, e);
      return;
    }

    // ranged behavior (lobber)
    if (e.def.ranged && dist <= e.def.ranged.range) {
      if (this.t >= e.attackReadyAt) {
        const r = e.def.ranged;
        this.spawnProjectile({
          x: e.x,
          y: e.y,
          vx: 0,
          vy: 0,
          damage: r.projectileDamage,
          radius: 8,
          friendly: false,
          pierce: 0,
          tags: ['lob'],
          aoe: { tx: this.player.x, ty: this.player.y, at: this.t + r.telegraphMs, radius: r.aoeRadius },
        });
        e.attackReadyAt = this.t + r.cooldownMs;
      }
      return; // hold position at range
    }

    // move toward player
    if (dist > e.def.touchRange) {
      const dir = norm(dx, dy);
      e.x += dir.x * e.def.speed * dt;
      e.y += dir.y * e.def.speed * dt;
      return;
    }

    // in melee range: telegraphed windup (§4: 1.5s+)
    if (this.t >= e.attackReadyAt) {
      e.state = 'windup';
      e.stateUntil = this.t + e.def.windupMs;
      e.attackReadyAt = this.t + e.def.windupMs + e.def.attackCooldownMs;
    }
  }

  private updateProjectile(p: Projectile, dt: number): void {
    if (p.aoe) {
      // telegraphed ground AOE: detonates at fixed point/time
      if (this.t >= p.aoe.at) {
        this.bus.emit('onExplosion', { x: p.aoe.tx, y: p.aoe.ty, radius: p.aoe.radius });
        const d = Math.hypot(this.player.x - p.aoe.tx, this.player.y - p.aoe.ty);
        if (d <= p.aoe.radius) this.hitPlayer(p.damage, null);
        p.alive = false;
      }
      return;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < -50 || p.x > FIELD_W + 50 || p.y < -80 || p.y > FIELD_H + 50) {
      p.alive = false;
      return;
    }

    if (p.friendly) {
      for (const e of this.aliveEnemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > e.def.radius + p.radius) continue;
        // shellback front shield: blocks projectiles coming from below/front
        if (e.shieldUp && p.vy < 0) {
          p.alive = false;
          this.bus.emit('onWardBlock', { x: p.x, y: p.y });
          return;
        }
        this.damage(e, p.damage, p.tags, { x: p.x, y: p.y });
        if (e.alive && p.applyStatus) {
          this.applyStatus(e, p.applyStatus.status, p.applyStatus.durationMs, p.applyStatus.dps);
        }
        if (p.pierce > 0) p.pierce--;
        else {
          p.alive = false;
          return;
        }
      }
    } else {
      const d = Math.hypot(this.player.x - p.x, this.player.y - p.y);
      if (d < 26 + p.radius) {
        this.hitPlayer(p.damage, null);
        p.alive = false;
      }
    }
  }

  stagger(e: Enemy): void {
    e.state = 'stagger';
    e.stateUntil = this.t + STAGGER_MS;
    if (e.def.frontShield) e.shieldUp = false; // §8: pulse breaks shellback stance
  }

  damage(
    e: Enemy,
    amount: number,
    tags: string[],
    from: Vec2 | null,
    silent = false,
  ): void {
    if (!e.alive) return;
    if (e.shieldUp && from && from.y > e.y && !tags.includes('status')) {
      this.bus.emit('onWardBlock', { x: e.x, y: e.y + e.def.radius });
      return;
    }
    let dealt = amount * this.mods.damageMult;
    if (e.statuses.has('vulnerable')) dealt *= 2;
    e.hp -= dealt;
    if (!silent) {
      this.bus.emit('onSpellHit', {
        spellTags: tags,
        enemyId: e.id,
        x: e.x,
        y: e.y,
        damage: dealt,
      });
    }
    if (e.hp <= 0) {
      e.alive = false;
      e.state = 'dead';
      this.kills++;
      this.bus.emit('onEnemyDeath', { kind: e.def.id, enemyId: e.id, x: e.x, y: e.y });
    }
  }

  applyStatus(e: Enemy, status: string, durationMs: number, dps?: number): void {
    if (!e.alive) return;
    e.statuses.set(status, { until: this.t + durationMs, dps });
    this.bus.emit('onStatusApplied', { status, enemyId: e.id });
  }

  explode(x: number, y: number, radius: number, dmg: number, tags: string[]): void {
    this.bus.emit('onExplosion', { x, y, radius });
    for (const e of this.aliveEnemies) {
      if (Math.hypot(e.x - x, e.y - y) <= radius + e.def.radius) {
        this.damage(e, dmg, tags, null);
        if (e.alive && this.mods.shockOnExplosion) this.applyStatus(e, 'shock', 4000);
      }
    }
  }

  /** field-wide boss blast — blockable by a well-timed ward (§8 봉인 실패) */
  bossBlast(dmg: number): void {
    this.hitPlayer(dmg, null);
  }

  private hitPlayer(dmg: number, attacker: Enemy | null): void {
    if (this.t < this.player.wardUntil) {
      this.bus.emit('onWardBlock', { x: this.player.x, y: this.player.y - 40 });
      if (this.mods.wardReflect && attacker) {
        this.damage(attacker, dmg, ['reflect'], this.player);
      }
      return;
    }
    this.player.hp -= dmg;
    this.bus.emit('onPlayerHit', { damage: dmg, hp: this.player.hp });
    if (this.player.hp <= 0) {
      this.player.alive = false;
      this.bus.emit('onPlayerDeath', {});
    }
  }

  nearestEnemy(
    from: Vec2,
    filter?: (e: Enemy) => boolean,
    maxDist = Infinity,
  ): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.aliveEnemies) {
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private emitMana(): void {
    this.bus.emit('onManaChanged', { mana: this.player.mana, max: this.player.manaMax });
  }
}

function norm(x: number, y: number): Vec2 {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
