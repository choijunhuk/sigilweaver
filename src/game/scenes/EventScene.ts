import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import type { EventDef, EventEffect } from '../../data/schemas';
import { sfx } from '../../core/audio';

export interface EventData {
  event: EventDef;
  onPick: (effect: EventEffect) => void;
}

/** 이벤트 방 택1 선택지 (§9). Overlay on paused Game scene. */
export class EventScene extends Phaser.Scene {
  constructor() {
    super('Event');
  }

  create(data: EventData): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0e14, 0.88)
      .setInteractive();

    this.add
      .text(GAME_WIDTH / 2, 240, data.event.text, {
        fontFamily: 'monospace', fontSize: '28px', color: '#e0def4',
        wordWrap: { width: 600 }, align: 'center',
      })
      .setOrigin(0.5);

    data.event.choices.forEach((choice, i) => {
      const y = 480 + i * 220;
      const card = this.add
        .rectangle(GAME_WIDTH / 2, y, 580, 160, 0x141927)
        .setStrokeStyle(3, 0x7c6cff)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(GAME_WIDTH / 2, y, choice.label, {
          fontFamily: 'monospace', fontSize: '24px', color: '#cdd6f4',
          wordWrap: { width: 540 }, align: 'center',
        })
        .setOrigin(0.5);
      card.once('pointerdown', () => {
        sfx.uiPick();
        this.scene.stop();
        this.scene.resume('Game');
        data.onPick(choice.effect);
      });
    });
  }
}
