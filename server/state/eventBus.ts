import { EventEmitter } from 'node:events';

export interface NovaEventMap {
  'state:updated': { section?: string; timestamp: string };
  'audit:appended': { id: string; type: string; message: string };
  'telegram:notify': { text: string };
  'mission:progress': { missionId: string; status: string };
  'nightshift:completed': { runId: string; cardId: string; ok: boolean };
}

class TypedEventBus extends EventEmitter {
  emitEvent<K extends keyof NovaEventMap>(event: K, payload: NovaEventMap[K]): boolean {
    return this.emit(event, payload);
  }
  onEvent<K extends keyof NovaEventMap>(event: K, listener: (payload: NovaEventMap[K]) => void): this {
    return this.on(event, listener);
  }
}

export const novaBus = new TypedEventBus();
novaBus.setMaxListeners(50);
