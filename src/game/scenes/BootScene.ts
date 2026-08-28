import Phaser from 'phaser';
import { GestureConfigSchema } from '../../data/schemas';
import { parseData } from '../../data/load';
import { log } from '../../core/log';
import { loadSave } from '../../meta/save';
import rawGestureCfg from '../../../data/config/gesture.json';
import type { GestureConfig } from '../../gesture/types';

/** Loads and validates data files, then hands off to Menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const gestureConfig: GestureConfig = parseData(
      GestureConfigSchema,
      rawGestureCfg,
      'data/config/gesture.json',
    );
    this.registry.set('gestureConfig', gestureConfig);
    log('game', 'boot complete, gesture config validated');
    // 첫 실행: 캘리브레이션부터 (§12 온보딩)
    this.scene.start(loadSave().calibrated ? 'Menu' : 'Calibration');
  }
}
