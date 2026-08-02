import { describe, expect, it } from 'vitest';
import { toUrl } from './session.js';

describe('@openmate/browser — toUrl', () => {
  it('lascia gli URL completi', () => {
    expect(toUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(toUrl('http://foo.it')).toBe('http://foo.it');
  });
  it('aggiunge https:// ai domini nudi', () => {
    expect(toUrl('example.com')).toBe('https://example.com');
    expect(toUrl('www.giallozafferano.it/ricette')).toBe('https://www.giallozafferano.it/ricette');
  });
  it('trasforma il testo libero in una ricerca Google', () => {
    expect(toUrl('ricette per cena')).toBe('https://www.google.com/search?q=ricette%20per%20cena');
  });
  it('gestisce i percorsi locali come file://', () => {
    expect(toUrl('/tmp/x/pagina.html')).toBe('file:///tmp/x/pagina.html');
    expect(toUrl('file:///a/b.html')).toBe('file:///a/b.html');
  });
});
