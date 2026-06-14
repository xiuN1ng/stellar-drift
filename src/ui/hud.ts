/**
 * Heads-up display (HUD).
 */

import type { PlayerState, PlayerArchetype } from '@game-types/index';

export interface HudState {
  speed: number;
  position: { x: number; y: number; z: number };
  credits: number;
  cargoUsed: number;
  cargoCap: number;
  archetype: PlayerArchetype;
  nearestPlanetDistance: number | null;
  discoveredPlanets: number;
  foundedStations: number;
  reputation: number;
  reputationTier: string;
  cargoContents: Array<{ kind: string; amount: number }>;
  landingState: 'orbit' | 'landing' | 'landed' | 'taking-off';
  currentPlanetName?: string;
  /** Last mining result (for transient feedback). */
  lastMiningStatus?: string;
}

const MODE_LABELS: Record<HudState['landingState'], string> = {
  'orbit': '轨道',
  'landing': '着陆中',
  'landed': '已着陆',
  'taking-off': '起飞中',
};

export class Hud {
  readonly root: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly posEl: HTMLElement;
  private readonly creditsEl: HTMLElement;
  private readonly cargoEl: HTMLElement;
  private readonly archetypeEl: HTMLElement;
  private readonly landingEl: HTMLElement;
  private readonly controlsEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly cargoListEl: HTMLElement;
  private readonly miningFeedbackEl: HTMLElement;
  private readonly repEl: HTMLElement;
  private readonly stationsEl: HTMLElement;
  private lastMiningTimestamp = 0;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-corner hud-top-left">
        <div class="hud-stat" id="hud-speed">速度 0 u/s</div>
        <div class="hud-stat" id="hud-pos">0, 0, 0</div>
      </div>
      <div class="hud-corner hud-top-right">
        <div class="hud-stat" id="hud-mode">轨道</div>
        <div class="hud-stat" id="hud-archetype">旅行者</div>
        <div class="hud-stat" id="hud-credits">信用 0</div>
        <div class="hud-stat" id="hud-cargo">货舱 0 / 0</div>
        <div class="hud-stat" id="hud-discovered">已发现 0 颗行星</div>
        <div class="hud-stat" id="hud-rep">声望 0 (无名)</div>
        <div class="hud-stat" id="hud-stations">空间站 0</div>
      </div>
      <div class="hud-corner hud-bottom-center" id="hud-landing"></div>
      <div class="hud-corner hud-bottom-left" id="hud-controls">
        <div class="hud-title">操作</div>
        <div>WASD 推进/减速/左右移</div>
        <div>Space/Ctrl 上升/下降</div>
        <div>Q/E 翻滚</div>
        <div>Shift 加速 / B 刹车</div>
        <div>鼠标 瞄准</div>
        <div>L 着陆/起飞 / F 采集 / N 建站 / Esc 暂停</div>
      </div>
      <div class="hud-corner hud-mid-right" id="hud-cargo-panel">
        <div class="hud-title">货舱详情</div>
        <div id="hud-cargo-list">(空)</div>
      </div>
      <div class="hud-feedback" id="hud-mining-feedback"></div>
    `;
    parent.appendChild(this.root);
    this.speedEl = this.root.querySelector('#hud-speed')!;
    this.posEl = this.root.querySelector('#hud-pos')!;
    this.creditsEl = this.root.querySelector('#hud-credits')!;
    this.cargoEl = this.root.querySelector('#hud-cargo')!;
    this.archetypeEl = this.root.querySelector('#hud-archetype')!;
    this.landingEl = this.root.querySelector('#hud-landing')!;
    this.controlsEl = this.root.querySelector('#hud-controls')!;
    this.statsEl = this.root.querySelector('#hud-discovered')!;
    this.modeEl = this.root.querySelector('#hud-mode')!;
    this.cargoListEl = this.root.querySelector('#hud-cargo-list')!;
    this.miningFeedbackEl = this.root.querySelector('#hud-mining-feedback')!;
    this.repEl = this.root.querySelector('#hud-rep')!;
    this.stationsEl = this.root.querySelector('#hud-stations')!;
    this.injectStyles();
  }

  update(state: HudState): void {
    this.speedEl.textContent = `速度 ${state.speed.toFixed(1)} u/s`;
    const p = state.position;
    this.posEl.textContent = `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
    this.creditsEl.textContent = `信用 ${state.credits.toFixed(0)}`;
    this.cargoEl.textContent = `货舱 ${state.cargoUsed} / ${state.cargoCap}`;
    this.archetypeEl.textContent = state.archetype === 'wanderer' ? '旅行者' : '帝国建造者';
    this.statsEl.textContent = `已发现 ${state.discoveredPlanets} 颗行星`;
    this.repEl.textContent = `声望 ${state.reputation} (${state.reputationTier})`;
    this.stationsEl.textContent = `空间站 ${state.foundedStations}`;
    this.modeEl.textContent = MODE_LABELS[state.landingState];

    // Cargo detail panel.
    if (state.cargoContents.length === 0) {
      this.cargoListEl.textContent = '(空)';
    } else {
      this.cargoListEl.innerHTML = state.cargoContents
        .filter((c) => c.amount > 0)
        .map((c) => `<div class="hud-cargo-row">${c.kind} × ${c.amount}</div>`)
        .join('') || '(空)';
    }

    // Bottom-center landing prompt.
    if (state.landingState === 'orbit' &&
        state.nearestPlanetDistance !== null &&
        state.nearestPlanetDistance < 8) {
      this.landingEl.textContent = `[L] 着陆  距离 ${state.nearestPlanetDistance.toFixed(1)}`;
      this.landingEl.style.opacity = '1';
    } else if (state.landingState === 'landed') {
      this.landingEl.textContent = `[L] 起飞 — 已着陆 ${state.currentPlanetName ?? ''}  [F] 采集  [N] 建站`;
      this.landingEl.style.opacity = '1';
    } else {
      this.landingEl.textContent = '';
      this.landingEl.style.opacity = '0';
    }

    // Mining feedback (transient, fade after 2s).
    if (state.lastMiningStatus) {
      this.miningFeedbackEl.textContent = state.lastMiningStatus;
      this.miningFeedbackEl.style.opacity = '1';
      this.lastMiningTimestamp = performance.now();
    } else if (performance.now() - this.lastMiningTimestamp > 2000) {
      this.miningFeedbackEl.style.opacity = '0';
    }
  }

  setControlsVisible(v: boolean): void {
    this.controlsEl.style.opacity = v ? '0.7' : '0';
  }

  dispose(): void {
    this.root.remove();
  }

  private injectStyles(): void {
    if (document.getElementById('hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      #hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 50;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #d8e0ff;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.7);
        user-select: none;
      }
      .hud-corner {
        position: absolute;
        padding: 12px 16px;
        background: rgba(10, 14, 30, 0.45);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-radius: 8px;
        border: 1px solid rgba(140, 180, 255, 0.15);
        font-size: 13px;
        letter-spacing: 0.5px;
        line-height: 1.7;
      }
      .hud-top-left { top: 16px; left: 16px; }
      .hud-top-right { top: 16px; right: 16px; text-align: right; }
      .hud-mid-right {
        top: 50%;
        right: 16px;
        transform: translateY(-50%);
        max-height: 240px;
        overflow-y: auto;
        min-width: 160px;
      }
      .hud-bottom-center {
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 22px;
        font-size: 14px;
        letter-spacing: 2px;
        background: rgba(120, 200, 255, 0.15);
        border-color: rgba(180, 220, 255, 0.4);
        opacity: 0;
        transition: opacity 0.4s ease-out;
      }
      .hud-bottom-left {
        bottom: 16px;
        left: 16px;
        opacity: 0.7;
        transition: opacity 0.4s ease-out;
      }
      .hud-feedback {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 14px 24px;
        background: rgba(140, 220, 255, 0.2);
        border: 1px solid rgba(180, 230, 255, 0.5);
        border-radius: 8px;
        font-size: 18px;
        letter-spacing: 4px;
        opacity: 0;
        transition: opacity 0.4s ease-out;
        pointer-events: none;
        z-index: 51;
      }
      .hud-stat { white-space: nowrap; }
      .hud-cargo-row { opacity: 0.85; }
      .hud-title {
        font-size: 11px;
        letter-spacing: 3px;
        color: #a8c0ff;
        margin-bottom: 6px;
        text-transform: uppercase;
      }
    `;
    document.head.appendChild(style);
  }
}

/** Snapshot HUD-relevant values from the running game. */
export function hudStateFromPlayer(
  state: PlayerState,
  speed: number,
  position: { x: number; y: number; z: number },
  cargoUsed: number,
  cargoCap: number,
  nearestPlanetDistance: number | null,
  landingState: HudState['landingState'],
  currentPlanetName: string | undefined,
  reputationTier: string,
  lastMiningStatus?: string,
): HudState {
  return {
    speed,
    position,
    credits: state.credits,
    cargoUsed,
    cargoCap,
    archetype: state.archetype,
    nearestPlanetDistance,
    discoveredPlanets: state.discoveredPlanets.length,
    foundedStations: state.foundedStations.length,
    reputation: state.reputation ?? 0,
    reputationTier,
    cargoContents: Object.entries(state.cargo)
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k, v]) => ({ kind: k, amount: v ?? 0 })),
    landingState,
    currentPlanetName,
    lastMiningStatus,
  };
}