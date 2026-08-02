import type { BrowserContext, Page } from 'playwright-core';
import type { BrowserEngine } from './engine.js';

type PW = typeof import('playwright-core');
let pwPromise: Promise<PW> | undefined;
function loadPw(): Promise<PW> {
  pwPromise ??= import('playwright-core');
  return pwPromise;
}

export interface BrowserOptions {
  /** Cartella profilo persistente (login riusati). */
  profileDir: string;
  headless?: boolean;
  /** Se presente, si CONNETTE a un Chrome esistente via CDP (fase 2: estensione). */
  cdpUrl?: string;
}

/** Elemento interattivo con un riferimento stabile per la sessione. */
export interface UiEl {
  ref: number;
  role: string;
  name: string;
  value?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: UiEl[];
  text: string;
}

/** Normalizza l'input di navigazione: URL diretto o ricerca su Google. */
export function toUrl(input: string): string {
  const s = input.trim();
  if (/^(https?|file):\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `file://${s}`; // percorso assoluto → file locale
  if (/^[^\s]+\.[^\s]{2,}(\/|$)/.test(s)) return `https://${s}`; // sembra un dominio
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

const sel = (ref: number) => `[data-om-ref="${ref}"]`;

/** Sessione browser su Playwright: lancia il Chrome installato (channel 'chrome')
 *  o si connette a uno esistente via CDP. Espone snapshot testuali (DOM) così
 *  anche un modello senza vision può navigare. */
export class BrowserSession implements BrowserEngine {
  private ctx?: BrowserContext;
  private page?: Page;

  constructor(private readonly opts: BrowserOptions) {}

  private async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const { chromium } = await loadPw();
    if (this.opts.cdpUrl) {
      const browser = await chromium.connectOverCDP(this.opts.cdpUrl);
      this.ctx = browser.contexts()[0] ?? (await browser.newContext());
    } else {
      this.ctx = await chromium.launchPersistentContext(this.opts.profileDir, {
        channel: 'chrome',
        headless: this.opts.headless ?? false,
        viewport: { width: 1280, height: 900 },
      });
    }
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    return this.page;
  }

  async open(input: string): Promise<PageSnapshot> {
    const page = await this.ensure();
    await page.goto(toUrl(input), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    return this.snapshot();
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = await this.ensure();
    // biome-ignore lint/suspicious/noExplicitAny: codice eseguito nel browser
    const data = (await page.evaluate(() => {
      const out: { ref: number; role: string; name: string; value?: string }[] = [];
      const q = 'a,button,input,textarea,select,[role=button],[role=link],[role=textbox],[onclick]';
      let i = 0;
      for (const el of Array.from(document.querySelectorAll(q))) {
        // biome-ignore lint/suspicious/noExplicitAny: DOM generico
        const e = el as any;
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        if (r.width < 1 || r.height < 1 || st.visibility === 'hidden' || st.display === 'none') continue;
        if (i >= 80) break;
        e.setAttribute('data-om-ref', String(i));
        const role = e.getAttribute('role') || e.tagName.toLowerCase();
        const name = String(
          e.getAttribute('aria-label') || e.placeholder || e.innerText || e.value || e.name || e.alt || '',
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);
        const value = e.value ? String(e.value).slice(0, 40) : undefined;
        out.push({ ref: i, role, name, value });
        i++;
      }
      return {
        title: document.title,
        url: location.href,
        elements: out,
        text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
      };
      // biome-ignore lint/suspicious/noExplicitAny: risultato page.evaluate
    })) as any;
    return data as PageSnapshot;
  }

  async click(ref: number): Promise<PageSnapshot> {
    const page = await this.ensure();
    await page.click(sel(ref), { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    return this.snapshot();
  }

  async type(ref: number, text: string, submit = false): Promise<PageSnapshot> {
    const page = await this.ensure();
    await page.fill(sel(ref), text, { timeout: 10_000 });
    if (submit) {
      await page.press(sel(ref), 'Enter');
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    return this.snapshot();
  }

  async read(): Promise<string> {
    const page = await this.ensure();
    const t = await page.evaluate(() => document.body?.innerText || '');
    return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
  }

  async back(): Promise<PageSnapshot> {
    const page = await this.ensure();
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    return this.snapshot();
  }

  async close(): Promise<void> {
    await this.ctx?.close().catch(() => {});
    this.ctx = undefined;
    this.page = undefined;
  }
}
