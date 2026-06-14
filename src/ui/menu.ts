/**
 * Startup menu and archetype selection overlay.
 *
 * Flow:
 *  1. On first launch: show archetype picker, await user choice.
 *  2. On resume: show "Continue / New Game" prompt.
 *
 * DOM-based, blocks game render until resolved.
 */

import { ARCHETYPE_LIST } from '@save/schema.js';
import type { PlayerArchetype } from '@game-types/index';

export interface MenuResult {
  archetype: PlayerArchetype;
  isNewGame: boolean;
}

export class StartupMenu {
  private resolveFn: ((r: MenuResult) => void) | null = null;

  show(hasSave: boolean): Promise<MenuResult> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.render(hasSave);
    });
  }

  private render(hasSave: boolean): void {
    const root = document.createElement('div');
    root.id = 'startup-menu';
    root.innerHTML = `
      <div class="menu-bg">
        <div class="menu-panel">
          <h1 class="menu-title">STELLAR DRIFT</h1>
          <div class="menu-subtitle">星际漂流 · M2 里程碑演示</div>

          ${hasSave ? `
            <button class="menu-btn" data-action="continue">继续旅程</button>
            <button class="menu-btn menu-btn-secondary" data-action="new">新游戏</button>
          ` : `
            <div class="menu-section-title">选择你的身份</div>
            <div class="menu-archetypes">
              ${ARCHETYPE_LIST.map((a) => `
                <button class="menu-arch" data-archetype="${a.id}">
                  <div class="menu-arch-title">${a.title}</div>
                  <div class="menu-arch-desc">${a.desc}</div>
                </button>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
    document.body.appendChild(root);
    this.injectStyles();

    if (hasSave) {
      root.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
        const saved = this.loadSaved();
        this.close(root, saved ?? 'wanderer', false);
      });
      root.querySelector('[data-action="new"]')?.addEventListener('click', () => {
        // New game: clear save, then show archetype picker.
        root.remove();
        this.render(false);
      });
    } else {
      root.querySelectorAll('[data-archetype]').forEach((btn: Element) => {
        btn.addEventListener('click', (e: Event) => {
          const arch = (e.currentTarget as HTMLElement).dataset.archetype as PlayerArchetype;
          this.close(root, arch, true);
        });
      });
    }
  }

  private loadSaved(): PlayerArchetype | null {
    const raw = localStorage.getItem('stellar-drift:save');
    if (!raw) return null;
    try {
      const env = JSON.parse(raw);
      if (env?.payload?.archetype) return env.payload.archetype;
    } catch { /* ignore */ }
    return null;
  }

  private close(root: HTMLElement, archetype: PlayerArchetype, isNewGame: boolean): void {
    root.remove();
    if (this.resolveFn) {
      this.resolveFn({ archetype, isNewGame });
      this.resolveFn = null;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('startup-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'startup-menu-styles';
    style.textContent = `
      #startup-menu {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, #0a0a30 0%, #000010 100%);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e0e8ff;
        animation: fadeIn 0.6s ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .menu-panel {
        text-align: center;
        max-width: 720px;
        padding: 40px;
      }
      .menu-title {
        font-size: 56px;
        letter-spacing: 12px;
        margin: 0 0 8px;
        background: linear-gradient(90deg, #8ab4ff, #ffffff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        font-weight: 200;
      }
      .menu-subtitle {
        font-size: 13px;
        opacity: 0.6;
        letter-spacing: 3px;
        margin-bottom: 40px;
      }
      .menu-section-title {
        font-size: 14px;
        letter-spacing: 4px;
        opacity: 0.7;
        margin: 30px 0 20px;
      }
      .menu-archetypes {
        display: flex;
        gap: 20px;
        justify-content: center;
      }
      .menu-arch {
        background: rgba(20, 30, 60, 0.5);
        border: 1px solid rgba(140, 180, 255, 0.25);
        color: #e0e8ff;
        padding: 24px 32px;
        border-radius: 12px;
        cursor: pointer;
        min-width: 220px;
        text-align: left;
        transition: all 0.2s;
        font-family: inherit;
      }
      .menu-arch:hover {
        background: rgba(40, 60, 120, 0.7);
        border-color: rgba(140, 180, 255, 0.6);
        transform: translateY(-2px);
      }
      .menu-arch-title {
        font-size: 22px;
        letter-spacing: 3px;
        margin-bottom: 8px;
        color: #b0d0ff;
      }
      .menu-arch-desc {
        font-size: 13px;
        opacity: 0.7;
        line-height: 1.5;
      }
      .menu-btn {
        background: rgba(80, 120, 220, 0.4);
        border: 1px solid rgba(160, 200, 255, 0.5);
        color: #ffffff;
        padding: 14px 36px;
        margin: 0 8px 12px;
        border-radius: 8px;
        font-size: 16px;
        letter-spacing: 3px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s;
      }
      .menu-btn:hover {
        background: rgba(120, 160, 255, 0.5);
        transform: translateY(-1px);
      }
      .menu-btn-secondary {
        background: rgba(40, 50, 80, 0.3);
        font-size: 13px;
        letter-spacing: 2px;
      }
    `;
    document.head.appendChild(style);
  }
}