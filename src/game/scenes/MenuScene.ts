import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35, 'SIGILWEAVER', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#7c6cff',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, '화면을 눌러 시작', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#cdd6f4',
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
