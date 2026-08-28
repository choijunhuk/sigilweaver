import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { CameraGestureSource } from '../../gesture/cameraSource';
import { ButtonGestureSource } from '../../gesture/source';
import type { GestureSource } from '../../gesture/source';
import type { GestureEvent } from '../../gesture/filter';
import type { GestureConfig, Sigil } from '../../gesture/types';
import { warn } from '../../core/log';

const SIGIL_LABEL: Record<Sigil, string> = {
  BOLT: '☝ BOLT', WARD: '✊ WARD', PULSE: '🖐 PULSE', ARC: '✌ ARC', FOCUS: '🤏 FOCUS', NONE: '',
};

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const SPLIT_Y = GAME_HEIGHT * (2 / 3); // §3: top 2/3 battlefield, bottom 1/3 feedback

/** Battlefield placeholder + live gesture feedback zone (§12 1차). */
export class GameScene extends Phaser.Scene {
  private camSource: CameraGestureSource | null = null;
  private buttonSource = new ButtonGestureSource();
  private feedbackGfx!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private castText!: Phaser.GameObjects.Text;
  private disposers: (() => void)[] = [];

  constructor() {
    super('Game');
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, SPLIT_Y, GAME_WIDTH, 2, 0x2a2f45);
    this.add
      .text(GAME_WIDTH / 2, SPLIT_Y * 0.45, '(전장 — Phase 3)', {
        fontFamily: 'monospace', fontSize: '24px', color: '#8891ab',
      })
      .setOrigin(0.5);

    this.castText = this.add
      .text(GAME_WIDTH / 2, SPLIT_Y * 0.75, '', {
        fontFamily: 'monospace', fontSize: '52px', color: '#7c6cff',
      })
      .setOrigin(0.5);

    this.feedbackGfx = this.add.graphics();
    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '카메라 준비 중…', {
        fontFamily: 'monospace', fontSize: '20px', color: '#8891ab',
      })
      .setOrigin(0.5);

    const cfg = this.registry.get('gestureConfig') as GestureConfig;
    this.camSource = new CameraGestureSource(cfg);
    this.wire(this.camSource);
    this.wire(this.buttonSource);
    this.camSource.start().catch((e) => {
      warn('cv', 'camera unavailable, button input only', e);
      this.camSource = null;
      this.statusText.setText('카메라 없음 — 키 1~5로 인장 발동 (디버그)');
    });

    // debug/assistive input: keys 1-5 (§17 Gesture Simulator)
    const sigils: Exclude<Sigil, 'NONE'>[] = ['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS'];
    sigils.forEach((sigil, i) => {
      this.input.keyboard?.on(`keydown-${'ONE TWO THREE FOUR FIVE'.split(' ')[i]}`, () =>
        this.buttonSource.press(sigil),
      );
    });

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Result'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private wire(source: GestureSource): void {
    this.disposers.push(source.onGesture((ev) => this.onCast(ev)));
  }

  private onCast(ev: GestureEvent): void {
    this.castText.setText(SIGIL_LABEL[ev.sigil]);
    this.cameras.main.flash(120, 124, 108, 255, false);
    this.time.delayedCall(700, () => {
      if (this.castText.text === SIGIL_LABEL[ev.sigil]) this.castText.setText('');
    });
  }

  update(): void {
    if (!this.camSource) return;
    const snap = this.camSource.snapshot;
    const g = this.feedbackGfx;
    g.clear();

    if (!snap.landmarks) {
      this.statusText.setText(snap.handSeen ? '' : '손을 보여주세요');
      return;
    }
    this.statusText.setText(
      snap.candidate !== 'NONE' ? SIGIL_LABEL[snap.candidate] : '',
    );

    // silhouette skeleton in the bottom-third zone, mirrored (selfie view)
    const zoneH = GAME_HEIGHT - SPLIT_Y;
    const px = (i: number) => (1 - snap.landmarks![i].x) * GAME_WIDTH;
    const py = (i: number) => SPLIT_Y + snap.landmarks![i].y * zoneH;

    g.lineStyle(3, 0x7c6cff, 0.9);
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      g.moveTo(px(a), py(a));
      g.lineTo(px(b), py(b));
    }
    g.strokePath();

    // stabilization gauge ring at wrist (§12 인식 게이지)
    if (snap.progress > 0) {
      g.lineStyle(5, 0xf5c26b, 1);
      g.beginPath();
      g.arc(px(0), py(0), 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * snap.progress);
      g.strokePath();
    }
  }

  private teardown(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.camSource?.stop();
    this.camSource = null;
  }
}
