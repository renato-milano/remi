import { describe, expect, it } from 'vitest';
import { PanelStream, type PanelStreamEvent } from './panel-stream.js';

/** Alimenta il parser a pezzi di `size` caratteri, come lo stream del modello. */
function run(text: string, size: number) {
  const p = new PanelStream();
  let plain = '';
  const events: PanelStreamEvent[] = [];
  for (let i = 0; i < text.length; i += size) {
    const r = p.feed(text.slice(i, i + size));
    plain += r.text;
    events.push(...r.events);
  }
  const r = p.end();
  plain += r.text;
  events.push(...r.events);
  return { plain, events, spoken: p.spoken };
}

const SAMPLE =
  'Ecco: <panel title="Come vola">\n' +
  '<step><say>Il motore spinge giù.</say><svg><rect x="10" y="10" width="50" height="20"/></svg></step>\n' +
  "<step><say>L'aereo sale.</say><svg><path d=\"M0 0 L10 10\" marker-end=\"url(#arrow)\"/></svg></step>\n" +
  '</panel> fine.';

describe('@openmate/core — PanelStream', () => {
  for (const size of [1, 7, 1000]) {
    it(`emette i passi appena completi (pezzi da ${size})`, () => {
      const { plain, events, spoken } = run(SAMPLE, size);
      expect(plain).toBe('Ecco:  fine.');
      expect(events.map((e) => e.op)).toEqual(['start', 'say', 'step', 'say', 'step', 'end']);
      expect(events[0]).toEqual({ op: 'start', title: 'Come vola' });
      expect(events[1]).toEqual({ op: 'say', index: 0, say: 'Il motore spinge giù.' });
      expect(events[2]).toMatchObject({
        op: 'step',
        index: 0,
        say: 'Il motore spinge giù.',
        svg: '<rect x="10" y="10" width="50" height="20"/>',
      });
      expect(spoken).toBe("Il motore spinge giù. L'aereo sale.");
    });
  }

  it('la frase esce prima che il modello scriva il disegno del passo', () => {
    const p = new PanelStream();
    expect(p.feed('<panel title="T"><step><say>Uno.</say><svg><rect').events).toEqual([
      { op: 'start', title: 'T' },
      { op: 'say', index: 0, say: 'Uno.' },
    ]);
    expect(p.feed(' x="1"/></svg></step><step><say>Du').events.map((e) => e.op)).toEqual(['step']);
  });

  it('salva l\'ultimo passo di un pannello troncato', () => {
    const { events } = run('<panel title="T"><step><say>Uno.</say><svg><circle r="3"/>', 5);
    expect(events.map((e) => e.op)).toEqual(['start', 'say', 'step', 'end']);
  });

  it('estrae i <mark> del passo (zone dello schermo) fuori dall\'svg', () => {
    const { events } = run(
      '<panel title="T"><step><say>Qui.</say><mark x="420" y="310" w="80" h="40" label="la chat"/><mark x="1" y="2"/>' +
        '<svg><rect x="1" y="1" width="5" height="5"/></svg></step></panel>',
      9,
    );
    const step = events.find((e) => e.op === 'step');
    expect(step).toMatchObject({ marks: [{ x: 420, y: 310, w: 80, h: 40, label: 'la chat' }], svg: '<rect x="1" y="1" width="5" height="5"/>' });
  });

  it('senza <svg> il disegno è il resto del passo', () => {
    const { events } = run('<panel title="T"><step><say>A.</say><mark x="1" y="1" w="2" h="2"/><box at="1,1">X</box></step></panel>', 4);
    expect(events.find((e) => e.op === 'step')).toMatchObject({ svg: '<box at="1,1">X</box>', marks: [{ x: 1, y: 1, w: 2, h: 2 }] });
  });

  it('legge la griglia dichiarata in apertura', () => {
    const { events } = run('<panel title="T" rows="5" cols="4"><step><say>A.</say><svg></svg></step></panel>', 6);
    expect(events[0]).toEqual({ op: 'start', title: 'T', rows: 5, cols: 4 });
    expect(run('<panel title="T" colors="own"></panel>', 50).events[0]).toEqual({ op: 'start', title: 'T', ownColors: true });
    expect(run('<panel title="T" rows="99"></panel>', 50).events[0]).toEqual({ op: 'start', title: 'T' });
  });

  it('testo senza pannello resta testo', () => {
    expect(run('Solo una risposta < 3 righe.', 4).plain).toBe('Solo una risposta < 3 righe.');
  });
});
