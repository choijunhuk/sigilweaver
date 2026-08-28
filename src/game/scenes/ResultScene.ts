import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, '런 종료', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f5c26b',
      })
      .setOrigin(0.5);

    const run = this.registry.get('lastRun') as { kills: number; seconds: number } | undefined;
    if (run) {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT * 0.47,
          `처치 ${run.kills}   생존 ${Math.floor(run.seconds / 60)}:${String(run.seconds % 60).padStart(2, '0')}`,
          { fontFamily: 'monospace', fontSize: '28px', color: '#cdd6f4' },
        )
        .setOrigin(0.5);
    }

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, '화면을 눌러 메뉴로', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#cdd6f4',
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('Menu'));
  }
}
