import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import type { RuneDef } from '../../data/schemas';
import { sfx } from '../../core/audio';

export interface RewardData {
  runes: RuneDef[];
  onPick: (rune: RuneDef) => void;
}

/** 룬 3택1 overlay (§7). Launched on top of a paused Game scene. */
export class RewardScene extends Phaser.Scene {
  constructor() {
    super('Reward');
  }

  create(data: RewardData): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0e14, 0.86)
      .setInteractive(); // swallow taps outside cards

    this.add
      .text(GAME_WIDTH / 2, 170, '룬을 선택하라', {
        fontFamily: 'monospace', fontSize: '40px', color: '#f5c26b',
      })
      .setOrigin(0.5);

    data.runes.forEach((rune, i) => {
      const y = 330 + i * 250;
      const rare = rune.rarity === 'rare';
      const border = rare ? 0xf5c26b : 0x7c6cff;
      const card = this.add
        .rectangle(GAME_WIDTH / 2, y, 560, 200, 0x141927)
        .setStrokeStyle(3, border)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(GAME_WIDTH / 2, y - 50, rune.name + (rare ? ' ◆' : ''), {
          fontFamily: 'monospace', fontSize: '32px', color: rare ? '#f5c26b' : '#cdd6f4',
        })
        .setOrigin(0.5);
      this.add
        .text(GAME_WIDTH / 2, y + 20, rune.desc, {
          fontFamily: 'monospace', fontSize: '22px', color: '#8891ab',
          wordWrap: { width: 520 }, align: 'center',
        })
        .setOrigin(0.5);

      card.once('pointerdown', () => {
        sfx.uiPick();
        this.scene.stop();
        this.scene.resume('Game');
        data.onPick(rune);
      });
    });
  }
}
