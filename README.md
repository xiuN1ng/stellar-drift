# Stellar Drift · 星际漂流

> 一个 web 端的程序生成太空探索游戏，灵感来自《无人深空》《Space Engine》《Outer Wilds》。

## 简介

**Stellar Drift** 想在浏览器里给你一个"无限宇宙沙盒"：

- 🪐 程序生成的星系（基于坐标的确定性 seed，理论上无限）
- 🚀 飞船驾驶：太空惯性、WASD + 鼠标瞄准、6DOF
- 🌍 行星着陆：从轨道无缝切入地表
- ⛏️ 资源采集：挖矿、入背包、用资源升级飞船
- 🏛️ 玩家身份：自由旅行者 **OR** 宇宙帝国建造者
- 📱 跨设备：PC 键鼠 + 移动触屏

## 当前状态

**M0~M5 全部完成 ✅** — 跨平台可玩的游戏闭环已通。

| 里程碑 | 状态 | 主要交付 |
|---|---|---|
| **M0 starmap** | ✅ | Vite + TS + Babylon.js 9 + PCG 核心（seed/rng/noise/galaxy） |
| **M1 prism** | ✅ | 写实渲染管线、大气散射 shader、LOD、星空背景 |
| **M2 helm** | ✅ | 飞船 6DOF 控制、键鼠输入、跟随相机、HUD、启动菜单 |
| **M3 着陆** | ✅ | 着陆状态机、地表行走、地形 mesh、行星地表生成 |
| **M4 采集+身份** | ✅ | 激光镐、空间站建造、声望系统、税收机制 |
| **M5 触屏+性能** | ✅ | 虚拟摇杆、触屏按钮、PerfMonitor、PCG 基准 |
| **M6 E2E+部署** | ⏳ | 端到端测试 + 部署脚本（待办） |

## 快速开始

```bash
npm install
npm run dev      # 启动开发服务器 http://localhost:5173
npm test         # 跑单测 (77+ tests)
npm run typecheck
npm run build    # 生产构建到 dist/
npm run preview  # 本地预览生产构建
```

## 文档

- [`docs/architecture.md`](docs/architecture.md) — 架构总览
- [`docs/pcg-spec.md`](docs/pcg-spec.md) — PCG 算法规范
- [`docs/agents/`](docs/agents/) — 4 个 Agent 角色 prompt
  - [`starmap.md`](docs/agents/starmap.md) — 架构师
  - [`prism.md`](docs/agents/prism.md) — 渲染工程师
  - [`helm.md`](docs/agents/helm.md) — 玩法工程师
  - [`probe.md`](docs/agents/probe.md) — 测试工程师

## 项目结构

```
src/
├── core/         # 纯函数：seed / rng / noise
├── pcg/          # 程序生成：galaxy / planet / palette
├── engine/       # Babylon.js 场景和渲染（skybox / atmosphere / LOD / planetSurface）
├── input/        # 键鼠 / 触屏 / 虚拟摇杆
├── ui/           # HUD / 启动菜单
├── save/         # 存档 schema + localStorage
├── player/       # Ship / ShipController / LandingController / Mining / Station / Reputation
├── performance/  # PerfMonitor + PCG 基准
├── types/        # 共享类型
└── main.ts       # 入口
```

## 技术栈

- **渲染**：Babylon.js 9.12（WebGPU + WebGL2）
- **语言**：TypeScript 5.7（strict）
- **构建**：Vite 5
- **PCG**：OpenSimplex Noise + Mulberry32 PRNG
- **测试**：Vitest 2
- **存档**：localStorage

## 路线图

- [x] **M0** 骨架 + PCG 算法（starmap）
- [x] **M1** 写实渲染管线（prism）
- [x] **M2** 飞船驾驶 + 键鼠（helm）
- [x] **M3** 行星着陆 + 地表（helm + prism）
- [x] **M4** 资源采集 + 玩家身份（helm）
- [x] **M5** 触屏适配 + 移动性能（probe + helm）
- [ ] **M6** 端到端测试 + 部署（probe）

---

## 🚀 部署到 GitHub Pages

项目已经准备好 `GitHub Actions` 工作流，每次 push main 分支自动部署到 GitHub Pages。

### 第一次部署步骤

1. **在 GitHub 上新建仓库**
   - 访问 https://github.com/new
   - 名字建议：`stellar-drift`（或你喜欢的）
   - **不要**勾选 "Add a README"（我们本地已经有了）
   - 选择 Public（GitHub Pages 免费版需要 public）
   - 点 "Create repository"

2. **添加 remote 并 push**
   ```bash
   cd /workspace
   git remote add origin https://github.com/<你的用户名>/stellar-drift.git
   git push -u origin main
   ```

3. **启用 GitHub Pages**
   - 仓库页面 → Settings → Pages
   - Source: **GitHub Actions**（不是 "Deploy from a branch"）
   - 等待 Action 完成第一次部署

4. **访问你的游戏**
   - URL 形如：`https://<你的用户名>.github.io/stellar-drift/`
   - 注意 vite 用了 `base: '/stellar-drift/'` 配置

### 后续更新

```bash
git add .
git commit -m "describe your change"
git push  # 自动触发部署
```

### 自定义域名

在 `Settings → Pages → Custom domain` 设置，DNS 加 CNAME 指向 `<用户名>.github.io.`

## 替代部署方案

不只是 GitHub Pages，你也可以：

- **Vercel**：`vercel deploy` （零配置）
- **Netlify**：拖拽 `dist/` 到 netlify.com/drop
- **Cloudflare Pages**：连 GitHub repo 自动部署
- **任意静态服务器**：`npm run build` 后把 `dist/` 整个目录传上去

## 许可证

TBD