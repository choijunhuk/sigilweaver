import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { loadSave, updateSave } from '../../meta/save';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const mono = (size: number, color: string) => ({
      fontFamily: 'monospace', fontSize: `${size}px`, color,
    });
    const save = loadSave();

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28, 'SIGILWEAVER', mono(72, '#7c6cff'))
      .setOrigin(0.5);
    this.tweens.add({
      targets: title, alpha: 0.75, duration: 1600, yoyo: true, repeat: -1, ease: 'sine.inout',
    });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35, '손으로 인장을 맺어 시전하는 마법', mono(22, '#8891ab'))
      .setOrigin(0.5);

    if (save.bestRoom > 0) {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT * 0.42,
          `최고 기록 — 방 ${save.bestRoom}/8, 처치 ${save.bestKills}${save.cleared ? '  ★ 클리어' : ''}`,
          mono(20, '#f5c26b'),
        )
        .setOrigin(0.5);
    }

    const start = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, '▶  시  작', mono(44, '#e0def4'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    start.once('pointerdown', () => this.scene.start('Game'));

    const relaxLabel = () =>
      `여유로운 손: ${loadSave().settings.relaxedHands ? 'ON' : 'OFF'}`;
    const relax = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.66, relaxLabel(), mono(24, '#8891ab'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    relax.on('pointerdown', () => {
      updateSave((s) => { s.settings.relaxedHands = !s.settings.relaxedHands; });
      relax.setText(relaxLabel());
    });

    const hapticLabel = () => `햅틱: ${loadSave().settings.haptics ? 'ON' : 'OFF'}`;
    const haptic = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72, hapticLabel(), mono(24, '#8891ab'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    haptic.on('pointerdown', () => {
      updateSave((s) => { s.settings.haptics = !s.settings.haptics; });
      haptic.setText(hapticLabel());
    });

    const calib = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.78, '캘리브레이션 다시 하기', mono(24, '#8891ab'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    calib.once('pointerdown', () => this.scene.start('Calibration'));

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '카메라 영상은 저장·전송되지 않는다', mono(16, '#5a6178'))
      .setOrigin(0.5);
  }
}
