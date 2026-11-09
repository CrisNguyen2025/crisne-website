import { AgentAdapter, GeneratedOutput } from './adapter';
import { AgentConfig, KindId, KindModel } from './model';

export interface SyncResult {
  outputs: GeneratedOutput[];
  notes: string[];
}

function renderKind<K extends KindId>(
  adapter: AgentAdapter,
  kind: K,
  items: KindModel[K],
  notes: string[],
): GeneratedOutput[] {
  const handler = adapter.render[kind];
  if ('native' in handler) {
    notes.push(`${adapter.id}: ${kind} native (${handler.native})`);
    return [];
  }
  if ('unsupported' in handler) {
    notes.push(`${adapter.id}: ${kind} unsupported (${handler.unsupported})`);
    return [];
  }
  return handler(items);
}

export function sync(config: AgentConfig, adapterList: AgentAdapter[]): SyncResult {
  const outputs: GeneratedOutput[] = [];
  const notes: string[] = [];
  const pathOwner = new Map<string, string>();

  const kinds = Object.keys(config) as KindId[];

  for (const adapter of adapterList) {
    for (const kind of kinds) {
      const generated = renderKind(adapter, kind, config[kind], notes);
      for (const out of generated) {
        const existingOwner = pathOwner.get(out.path);
        if (existingOwner) {
          throw new Error(`Xung đột đường dẫn "${out.path}" giữa adapter "${existingOwner}" và "${adapter.id}"`);
        }
        pathOwner.set(out.path, adapter.id);
        outputs.push(out);
      }
    }
  }

  return { outputs, notes };
}
