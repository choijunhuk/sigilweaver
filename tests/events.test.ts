import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';

describe('EventBus', () => {
  it('delivers payload to subscribers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('onGestureRecognized', handler);
    bus.emit('onGestureRecognized', { sigil: 'BOLT', confidence: 0.8, at: 100 });
    expect(handler).toHaveBeenCalledWith({ sigil: 'BOLT', confidence: 0.8, at: 100 });
  });

  it('unsubscribes via returned disposer and off()', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    const disposeA = bus.on('onSceneChanged', a);
    bus.on('onSceneChanged', b);
    disposeA();
    bus.off('onSceneChanged', b);
    bus.emit('onSceneChanged', { scene: 'Menu' });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no subscribers', () => {
    const bus = new EventBus();
    expect(() => bus.emit('onSceneChanged', { scene: 'Boot' })).not.toThrow();
  });
});
