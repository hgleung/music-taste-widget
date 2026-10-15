import { SECTIONS, type WidgetData } from "./data.ts";
import { formatAgo, renderSection, renderWidget, type RenderOptions } from "./render.ts";

/*
 * <music-taste-widget src="/api/music-taste.json" sections="now" refresh="60">
 *
 * Fetches WidgetData JSON (see createHandler) and fills the matching sections.
 * Server-rendered markup from renderWidget() inside the element is kept and
 * patched section by section; without it the element renders from scratch.
 * Relative "8h ago" timestamps are kept current every minute.
 */

// Lets this module be imported during SSR, where HTMLElement doesn't exist.
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

export class MusicTasteWidget extends Base {
  #options: RenderOptions = {};
  #timers: number[] = [];

  connectedCallback() {
    let root = this.querySelector<HTMLElement>(".mtw");
    if (!root) {
      this.innerHTML = renderWidget({});
      root = this.querySelector<HTMLElement>(".mtw")!;
    }
    this.#options = JSON.parse(root.dataset.mtwOptions || "{}") as RenderOptions;

    void this.load();
    const refresh = Number(this.getAttribute("refresh"));
    if (refresh > 0) this.#timers.push(window.setInterval(() => void this.load(), refresh * 1000));
    this.#timers.push(
      window.setInterval(() => {
        for (const t of this.querySelectorAll<HTMLElement>("[data-mtw-ago]")) t.textContent = formatAgo(Number(t.dataset.mtwAgo));
      }, 60_000),
    );
  }

  disconnectedCallback() {
    this.#timers.forEach(clearInterval);
    this.#timers = [];
  }

  /** Fetches `src` (narrowed by the `sections` attribute) and applies the result. Failures leave the widget as is. */
  async load(): Promise<void> {
    const src = this.getAttribute("src");
    if (!src) return;
    const url = new URL(src, document.baseURI);
    const sections = this.getAttribute("sections");
    if (sections) url.searchParams.set("sections", sections);
    try {
      const res = await fetch(url);
      if (res.ok) this.update((await res.json()) as WidgetData);
    } catch {
      // Network errors keep whatever is already showing.
    }
  }

  /** Re-renders every section present in `data`. A null section only hides a slot that is still empty. */
  update(data: WidgetData): void {
    for (const s of SECTIONS) {
      if (!(s in data)) continue;
      const slot = this.querySelector<HTMLElement>(`[data-mtw-section="${s}"]`);
      if (!slot || (data[s] == null && !slot.hidden)) continue;
      slot.outerHTML = renderSection(s, data, this.#options);
    }
  }
}

if (globalThis.customElements && !customElements.get("music-taste-widget")) customElements.define("music-taste-widget", MusicTasteWidget);
