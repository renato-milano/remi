import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@openmate/llm', () => {
  it('espone il nome del package', () => {
    expect(PACKAGE_NAME).toBe('@openmate/llm');
  });
});
