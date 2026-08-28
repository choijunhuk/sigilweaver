import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../main';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, '런 종료', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f5c26b',
      })
      .setOrigin(0.5);

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
