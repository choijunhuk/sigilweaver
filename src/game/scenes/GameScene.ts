import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../main';

/** Placeholder battlefield — gesture input and combat arrive in Phase 2–3. */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    // battlefield: top 2/3, hand feedback zone: bottom 1/3 (§3)
    const split = GAME_HEIGHT * (2 / 3);
    this.add.rectangle(GAME_WIDTH / 2, split, GAME_WIDTH, 2, 0x2a2f45);

    this.add
      .text(GAME_WIDTH / 2, split / 2, '(전장 — Phase 3)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#8891ab',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, split + (GAME_HEIGHT - split) / 2, '(손 인식 피드백 — Phase 2)', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#8891ab',
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('Result'));
  }
}
