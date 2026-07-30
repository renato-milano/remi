import { join } from 'node:path';

export interface MemoryPaths {
  root: string;
  dbFile: string;
  memoryDir: string;
  notesDir: string;
  persona: string;
  userProfile: string;
  wikiIndex: string;
}

/** Layout di storage local-first (vedi docs/09). */
export function resolvePaths(root: string): MemoryPaths {
  const memoryDir = join(root, 'memory');
  return {
    root,
    dbFile: join(root, 'openmate.db'),
    memoryDir,
    notesDir: join(memoryDir, 'notes'),
    persona: join(memoryDir, 'persona.md'),
    userProfile: join(memoryDir, 'user-profile.md'),
    wikiIndex: join(memoryDir, 'WIKI.md'),
  };
}

export function notePath(notesDir: string, name: string): string {
  return join(notesDir, `${name}.md`);
}
