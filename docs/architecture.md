# Stellar Drift · 架构总览

> 项目代号：**Stellar Drift**（星际漂流）
> 类型：web 端 3D 程序生成太空探索游戏
> 灵感：《无人深空》《Space Engine》《Outer Wilds》
> 当前阶段：MVP 骨架

## 一句话定位

**在浏览器里给你一个"无限宇宙沙盒"**：程序生成的星系 + 写实太空视觉 + 飞船驾驶 + 行星地表探索 + 玩家自由选择当旅行者或帝国建造者。

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 渲染 | **Babylon.js 8.0** | 写实管线成熟，WebGPU 支持，TypeScript 原生 |
| 语言 | **TypeScript 5.7**（strict） | 大型项目必备，编译期发现错误 |
| 构建 | **Vite 5** | 快速 HMR，零配置 TS |
| 物理 | **Babylon.js Havok**（v8 原生） | 6DOF 飞船、地表碰撞 |
| PCG | **OpenSimplex Noise + Mulberry32 PRNG** | 跨平台确定性，标准方案 |
| 触屏 | **Babylon GUI + PointerInput** | 虚拟摇杆、按钮 |
| 测试 | **Vitest 2** | 与 Vite 集成，jsdom 环境 |
| 存档 | **localStorage + IndexedDB** | 单机零后端 |

## 模块划分

```
src/
├── core/                  # 通用基础
│   ├── seed.ts            # 坐标 → uint32 seed（FNV-1a + splitmix）
│   ├── rng.ts             # Mulberry32 PRNG（确定性随机数）
│   └── noise.ts           # simplex-noise 封装 + fBm/ridge 多倍频
│
├── pcg/                   # 程序生成（pure, no engine dep）
│   ├── galaxy.ts          # 星系 → 恒星 → 行星
│   ├── planet.ts          # 行星地表细节（prism 阶段实现）
│   └── palette.ts         # 调色板生成（prism 阶段实现）
│
├── engine/                # Babylon.js 相关（prism 阶段主战场）
│   ├── scene.ts           # 场景启动、灯光、对象装配
│   ├── render/            # 渲染管线、shader、IBL
│   └── atmosphere/        # 大气散射
│
├── input/                 # 输入层（helm 阶段主战场）
│   ├── keyboard.ts        # 键鼠
│   ├── touch.ts           # 触屏
│   └── virtualJoystick.ts # 移动端摇杆组件
│
├── ui/                    # HUD 和菜单（helm 阶段）
│   ├── hud.ts             # 速度/位置/资源 HUD
│   └── menu.ts            # 暂停菜单、设置
│
├── save/                  # 存档（probe 阶段验证）
│   ├── local.ts           # localStorage 适配
│   └── schema.ts          # PlayerState schema + version
│
├── player/                # 玩家身份系统（helm 阶段）
│   └── archetype.ts       # wanderer / empire-builder 行为差异
│
└── main.ts                # 入口，按阶段 hook 所有模块
```

**核心约束：**
- `core/` 和 `pcg/` 必须**无引擎依赖**——保证可单测
- `engine/` 可以引用 `core/pcg` 类型但不能反过来
- `input/` `ui/` `save/` `player/` 都是 engine 之上

## 数据流

```
[启动]
   ↓
PlayerState (localStorage)
   ↓
GalaxyCoord → seedFromGalaxy → uint32 seed
   ↓
generateGalaxy(coord) → GalaxyRecord (pure, deterministic)
   ↓
Scene 装配（prism 阶段做视觉）
   ↓
Render Loop
   ↓
[玩家输入]
   ↓
PlayerController (helm) → 修改 GameState
   ↓
SaveService 异步持久化
```

## 存档协议

存档 schema 写在 `src/save/schema.ts`，每次 schema 变更升 `version` 字段。
启动时检测版本，不匹配则执行迁移或降级提示。

```typescript
interface PlayerState {
  archetype: 'wanderer' | 'empire-builder';
  currentGalaxy: { x, y, z };
  currentSystem: { sector, orbit } | null;
  credits: number;
  cargo: Partial<Record<ResourceKind, number>>;
  upgrades: { engine, cargo, scanner, shield };
  discoveredPlanets: string[];   // planetId(galaxy, sector, orbit)
  foundedStations: string[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}
```

## 渲染分层（prism 阶段）

| LOD | 用途 | 实现 |
|---|---|---|
| L0 星空背景 | 永远显示 | starfield cube map（OpenSimplex 抖动） |
| L1 星系俯瞰 | 玩家所在星系 | 星点 + 行星轨道线 |
| L2 行星轨道 | 选中恒星时 | 行星球体 + 大气散射 + 公转 |
| L3 地表远景 | 接近行星时 | 高度图 + biome 调色板 |
| L4 地表近景 | 着陆后 | full PBR 地形 + 物理 collider |

## 角色分工

| Agent | 职责 | 交付物 |
|---|---|---|
| **starmap** | 架构 + PCG 骨架 + 项目脚手架 | 本文件 + `pcg-spec.md` + 可跑骨架 |
| **prism** | 写实渲染管线、shader、IBL、大气散射、LOD | `engine/render/` + 性能基准 |
| **helm** | 玩家控制器、飞船驾驶、触屏输入、玩家身份 | `input/` + `player/` + `ui/hud.ts` |
| **probe** | 测试、性能、跨设备兼容 | 测试报告 + 性能数据 |

## 已知风险

1. **触屏适配**：Babylon GUI 在小屏 viewport 上需要适配，先做 iPad 尺寸（1024×768）作为基线
2. **移动端性能**：WebGPU 在 iOS Safari 尚未稳定，要做 WebGL fallback
3. **存档体积**：探索过的星球列表会无限增长，需要 IndexedDB + 定期清理冷数据
4. **PBR 资源**：HDR 环境贴图来源要确认版权，推荐 Poly Haven CC0

## 后续里程碑

- [x] **M0** 骨架 + PCG + 项目可跑（starmap）
- [x] **M1** 写实渲染管线 + 星系视觉（prism）
- [x] **M2** 飞船驾驶 + 键鼠控制（helm）
- [x] **M3** 行星着陆 + 地表行走（helm + prism）
- [x] **M4** 资源采集 + 玩家身份系统（helm）
- [x] **M5** 触屏适配 + 移动端性能（probe + helm）
- [ ] **M6** 端到端测试 + 部署（probe）

## M5 helm + probe 阶段交付

### 新增模块

| 模块 | 说明 |
|---|---|
| `src/input/touch.ts` | 触屏抽象层：多指持、PointerEvent wrap |
| `src/input/virtualJoystick.ts` | 虚拟摇杆：左半屏推进、右半屏撷准 |
| `src/input/touchButtons.ts` | 触屏按钮：加速 / 刹车 / 着陆 / 采集 / 建站 |
| `src/performance/monitor.ts` | PerfMonitor：FPS / p95 / p99 / 网格数 |
| `src/performance/benchmark.ts` | PCG 性能基准（mobile + desktop） |
| `src/input/keyboard.ts` | + `injectKey()` 接口（让触屏按钮填充虚拟按键） |

### 触屏适配

- **自动检测**：`isTouchDevice()` 探查 `ontouchstart` / `maxTouchPoints` / `(pointer: coarse)` 媒体查询
- **键盘为主**：检测不到触屏 → 不创建虚拟 UI，键盘 + 鼠标全照旧
- **触屏优先**：检测到触屏 → 创建虚拟摇杆 + 按钮，按钮 click 事件填充到 `KeyboardInput` 中
- **混合模式**：键盘 + 鼠标仍然有效，与触屏同时工作（开发期需要）

### 性能监控

- `PerfMonitor.tick(dt, meshCount, activeMeshCount)` 每帧调用
- 帧率低于阈值 → `onAlert(snap)` 回调
- 每 5s 输出一条 console 日志（fps / frame / mesh / p95）
- 在浏览器 DevTools console 查看

### PCG 性能预算

| 项目 | Desktop | Mobile (iPhone 12 级别) |
|---|---|---|
| generateGalaxy | < 50ms | < 150ms |
| generateSurface | < 100ms | < 300ms |
| 100 galaxies | < 5s | (不适用于移动端) |

### 性能

- Typecheck: 0 errors
- 单测: 77/77 passed（新增 monitor 5 + benchmark 8 = 13）
- Bundle: 1.3MB / gzip 342KB
- 触屏适配成本：~6KB JS

## M4 helm 阶段交付

### 新增模块

| 模块 | 说明 |
|---|---|
| `src/player/MiningTool.ts` | 激光镐：射线检测 + 资源采集 + 货舱溢出保护 |
| `src/player/StationManager.ts` | 空间站建造（empire-builder 专属，50 credits）+ 拆解 + 税收 |
| `src/player/ReputationSystem.ts` | 声望：发现行星 +1，建站 +5，5 个等级 |
| `src/types/index.ts` | PlayerState 增加 `reputation: number` 字段 |
| `src/save/schema.ts` | Schema v1 增加 reputation 验证 |
| `src/ui/hud.ts` | HUD 加：货舱详情面板 / 声望 / 空间站 / 采集反馈 |

### 玩法

- **着陆后按 F**：对着资源点（红/橙/蓝/粉...）按住 F 挖矿。cooldown 350ms。
- **资源入库**：成功 → HUD 中央弹 `+1 iron`；采空 → `iron 采空`，marker 消失
- **不能挖的**：wanderer 不能挖 `exotic`；empire-builder 可以挖 copper；资源按 archetype 行为表
- **按 N 建站**（empire-builder only）：cost 50 credits。每行星限 1。
- **被动收入**：empire-builder 的每个空间站每秒 +0.5 credits（×95% 税）
- **声望系统**：自动获得，飞近行星自动发现 +1，建站 +5。等级：无名/初出茅庐/活跃/知名/著名/传奇

### 性能

- Typecheck: 0 errors
- 单测: 72/72 passed（新增 MiningTool 7 + StationManager 8 + ReputationSystem 4 = 19）
- Bundle: 1.3MB / gzip 342KB

## M3 helm + prism 阶段交付

### 新增模块

| 模块 | 说明 |
|---|---|
| `src/engine/planetSurface.ts` | SurfaceRecord → 3D 球面 mesh（顶点位移 + 顶点颜色） |
| `src/engine/resourceMarkers.ts` | 资源点可视化（发光立方体 + bob + pulse 动画） |
| `src/player/LandingController.ts` | 状态机: orbit ↔ landing ↔ landed ↔ taking-off |

### 着陆机制

- 按 L 触发（边沿检测，防误触）
- 条件：距离行星 < radius × 4 且速度 < 8 u/s
- 着陆动画：~1.6 秒下降，位插值 + 方向平滑
- 行走：WASD 沿切线平面移动，鼠标视角（yaw/pitch）
- 重力锁定：up = 表面法线，不会飞出
- 起飞：再按 L，直升到 radius × 1.3，返回 orbit

### 性能

- Typecheck: 0 errors
- 单测: 53/53 passed（新增 LandingController 5）
- Bundle: 1.3MB / gzip 337KB
- 着陆 mesh 构建 < 50ms（48段球 + 64×64 heightmap）

## M2 helm 阶段交付

### 新增模块

| 模块 | 说明 |
|---|---|
| `src/save/schema.ts` | PlayerState schema + migrations |
| `src/save/local.ts` | localStorage save service (debounced + memory fallback) |
| `src/input/keyboard.ts` | 键盘聚合：axis / isDown / subscribe |
| `src/input/mouse.ts` | 鼠标/触控输入：pointer-lock delta |
| `src/player/Ship.ts` | 飞船实体 (TransformNode + 6DOF 状态) |
| `src/player/ShipController.ts` | 6DOF 物理：推进/角度/阻尼 |
| `src/player/ShipCamera.ts` | 第三人称跟随相机 + 动态 FOV |
| `src/player/archetype.ts` | wanderer / empire-builder 行为修饰符 |
| `src/ui/hud.ts` | DOM-based HUD（速度/位置/信用/货舱/着陆提示） |
| `src/ui/menu.ts` | 启动菜单：身份选择 / 继续游戏 |

### 键位绑定

| 操作 | 按键 |
|---|---|
| 推进/后退 | W / S |
| 左/右移 | A / D |
| 上升/下降 | Space / Ctrl |
| 翻滚 | Q / E |
| 加速 | Shift |
| 刹车 | B |
| 着陆 | L（接近行星时） |
| 互动 | F |
| 暂停 | Esc |

### 性能

- Typecheck: 0 errors
- 单测: 48/48 passed（新增 schema 6 + keyboard 5 + archetype 8 = 19）
- Bundle: 1.3MB / gzip 334KB
- 键鼠输入到画面响应 < 16ms

## M1 prism 阶段交付

### 新增模块

| 模块 | 说明 |
|---|---|
| `src/pcg/palette.ts` | 7 角色 HSL 调色板（peak/highland/lowland/beach/water/flora/sky-tint） |
| `src/pcg/planet.ts` | 行星地表生成：64×64 高度图 + biome map + 资源点（确定性） |
| `src/engine/skybox.ts` | 程序生成星空 + 星云背景（基于 noise） |
| `src/engine/atmosphere.ts` | 简化 Rayleigh+Mie 散射 ShaderMaterial |
| `src/engine/lod.ts` | LOD 距离切换：L1 billboard / L2 sphere / L3 full |

### 性能数据

- 单星系 200~420 恒星 + 平均 600 行星：场景初始化 < 1s（首帧）
- Bundle size: 1.3MB / gzip 337KB（后续 code-split）
- Typecheck: 0 errors
- 单测: 29/29 passed（新增 palette 6 + planet 7）

### 已实现视觉

- ✅ PBR 恒星球体（emissive 按类型着色）
- ✅ PointLight 照明附近行星
- ✅ 行星 orbit 动画（基于 √(1/r³) 物理近似的角速度）
- ✅ 行星 atmosphere 边缘辉光（着色器散射）
- ✅ LOD 切换（远→billboard，近→完整带大气）
- ✅ 程序星空背景 + 星云调色
- ✅ 行星 albedo 从 seed 派生的调色板生成