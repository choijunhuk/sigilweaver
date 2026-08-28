import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { CameraGestureSource } from '../../gesture/cameraSource';
import type { GestureConfig, Sigil } from '../../gesture/types';
import { updateSave } from '../../meta/save';
import { initAudio, sfx } from '../../core/audio';
import { warn } from '../../core/log';

const ORDER: Exclude<Sigil, 'NONE'>[] = ['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS'];
const ICON: Record<string, string> = {
  BOLT: '☝', WARD: '✊', PULSE: '🖐', ARC: '✌', FOCUS: '🤏',
};
const NAME: Record<string, string> = {
  BOLT: '검지만 펴기', WARD: '주먹 쥐기', PULSE: '손바닥 펴기',
  ARC: '검지+중지 V', FOCUS: '엄지+검지 핀치',
};

/** 첫 실행 캘리브레이션 (§12): 5개 인장 각 1회 성공 확인. */
export class CalibrationScene extends Phaser.Scene {
  private source: CameraGestureSource | null = null;
  private step = 0;
  private iconText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private progText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('Calibration');
  }

  create(): void {
    initAudio();
    this.step = 0;
    const mono = (size: number, color: string) => ({
      fontFamily: 'monospace', fontSize: `${size}px`, color,
    });

    this.add.text(GAME_WIDTH / 2, 180, '손 캘리브레이션', mono(40, '#7c6cff')).setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 250, '카메라 40~80cm 앞에서\n아래 손 모양을 따라해 보라', {
        ...mono(22, '#8891ab'), align: 'center',
      })
      .setOrigin(0.5);
    this.iconText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, '', mono(140, '#e0def4')).setOrigin(0.5);
    this.nameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.56, '', mono(30, '#cdd6f4')).setOrigin(0.5);
    this.progText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.64, '', mono(26, '#f5c26b')).setOrigin(0.5);
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72, '카메라 준비 중…', mono(20, '#8891ab')).setOrigin(0.5);

    const skip = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 110, '[ 건너뛰기 ]', mono(24, '#8891ab'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => this.finish(false));

    this.showStep();

    const cfg = this.registry.get('gestureConfig') as GestureConfig;
    this.source = new CameraGestureSource({ ...cfg });
    this.source.onGesture((ev) => {
      if (ev.sigil === ORDER[this.step]) {
        sfx.cast(ev.sigil);
        if (navigator.vibrate) navigator.vibrate(20);
        this.step++;
        if (this.step >= ORDER.length) this.finish(true);
        else this.showStep();
      }
    });
    this.source
      .start()
      .then(() => this.statusText.setText(''))
      .catch((e) => {
        warn('cv', 'calibration camera failed', e);
        this.statusText.setText('카메라를 열 수 없음 — 건너뛰기를 누르라');
      });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.source?.stop();
      this.source = null;
    });
  }

  private showStep(): void {
    const sigil = ORDER[this.step];
    this.iconText.setText(ICON[sigil]);
    this.nameText.setText(NAME[sigil]);
    this.progText.setText(`${this.step}/${ORDER.length} 완료`);
  }

  private finish(_completed: boolean): void {
    // skipping also counts as "seen" — redo anytime from the menu
    updateSave((s) => { s.calibrated = true; });
    this.scene.start('Menu');
  }
}
