import { describe, expect, it } from 'vitest';
import { main } from './index.js';

describe('@openmate/cli', () => {
  it('espone un entrypoint main()', () => {
    expect(typeof main).toBe('function');
  });
});
