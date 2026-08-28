import Phaser from 'phaser';
import { GestureConfigSchema } from '../../data/schemas';
import { parseData } from '../../data/load';
import { log } from '../../core/log';
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
    this.scene.start('Menu');
  }
}
