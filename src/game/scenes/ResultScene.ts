import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { loadSave } from '../../meta/save';

interface LastRun {
  kills: number;
  seconds: number;
  rooms: number;
  total: number;
  victory: boolean;
  runes: string[];
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    const mono = (size: number, color: string) => ({
      fontFamily: 'monospace', fontSize: `${size}px`, color,
    });
    const run = this.registry.get('lastRun') as LastRun | undefined;
    const victory = run?.victory ?? false;

    this.add
      .text(
        GAME_WIDTH / 2, GAME_HEIGHT * 0.24,
        victory ? '침묵이 걷혔다' : '인장이 흩어졌다',
        mono(52, victory ? '#f5c26b' : '#ff5d5d'),
      )
      .setOrigin(0.5);

    if (run) {
      this.add
        .text(
          GAME_WIDTH / 2, GAME_HEIGHT * 0.36,
          `방 ${run.rooms}/${run.total}   처치 ${run.kills}   ` +
            `${Math.floor(run.seconds / 60)}:${String(run.seconds % 60).padStart(2, '0')}`,
          mono(28, '#cdd6f4'),
        )
        .setOrigin(0.5);
      if (run.runes.length) {
        this.add
          .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.46, `룬: ${run.runes.join(', ')}`, {
            ...mono(20, '#8891ab'), wordWrap: { width: 620 }, align: 'center',
          })
          .setOrigin(0.5);
      }
    }

    const save = loadSave();
    this.add
      .text(
        GAME_WIDTH / 2, GAME_HEIGHT * 0.58,
        `최고 기록 — 방 ${save.bestRoom}/8, 처치 ${save.bestKills}`,
        mono(20, '#f5c26b'),
      )
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72, '화면을 눌러 계속', mono(24, '#8891ab'))
      .setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('Menu'));
  }
}
