# PCG 算法规范 · Procedural Content Generation

> 目标：用纯函数 + seed，让任意 `GalaxyCoord` 都生成一个**确定的、视觉丰富的、可重玩**的宇宙。
> 性能目标：单个星系生成 < 50ms；行星地表生成 < 100ms。

## 设计原则（来自《无人深空》的启示）

1. **多样性靠组合，不靠堆砌**：地形参数 × 水陆比例 × 地貌模板 × 调色板 → 几千种组合
2. **确定性优先**：同坐标永远同星系；这是存档、网络、bug 复现的基础
3. **分层生成**：星系 → 恒星 → 行星 → 地表，逐层用 parent seed 派生 child seed
4. **资产复用**：复用 noise / palette / template，而不是每个星球都手工造

## Seed 流水线

```
GalaxyCoord (int x,y,z)
   ↓ seedFromGalaxy (splitmix32)
GalaxySeed (uint32)
   ↓ Rng 实例化
   ↓ 决定: starCount, spiralArms, name
For each star (sector 0..N):
   ↓ Rng.child(sector)
   ↓ 决定: class, position, mass, planets
   ↓ For each planet:
        ↓ Rng.child(orbit)
        ↓ 决定: class, biomes, resources, radius
        ↓ PlanetSeed (uint32) — 留给地表层
```

**绝对不允许**在任何地方用 `Math.random()`。所有随机性必须来自 `Rng` 实例。

## 星系层（已实现）

- 星系数：180 ~ 420（中等密度）
- 旋臂数：2 ~ 4
- 恒星位置：logarithmic spiral with `armOffset + log(r) * 0.3`
- 盘面厚度：±8 单位

恒星类型权重：

| Class | Weight | Color | Luminosity |
|---|---|---|---|
| O | 0.001 | 蓝白 | 1.00 |
| B | 0.01 | 蓝白 | 0.90 |
| A | 0.04 | 白 | 0.80 |
| F | 0.07 | 黄白 | 0.70 |
| G | 0.10 | 黄 | 0.60 |
| K | 0.18 | 橙 | 0.45 |
| M | 0.55 | 红 | 0.20 |
| red-giant | 0.02 | 暗红 | 0.85 |
| white-dwarf | 0.015 | 白 | 0.30 |
| neutron | 0.008 | 青 | 0.90 |
| black-hole | 0.002 | 紫黑 | 0.00 |

## 行星层（已实现骨架）

- 行星数：恒星类决定（O/B: 0~1，G: 2~6，M: 2~7）
- 轨道距离：`30 + orbitIndex * 22 + jitter`
- 行星类映射：

| 轨道位置 | 类候选 |
|---|---|
| 0 ~ 0.15 | rocky-lava (25%) / rocky-desert |
| 0.15 ~ 0.45 | rocky-desert / rocky-ocean / rocky-ice |
| 0.45 ~ 0.75 | rocky-ocean (40%) / rocky-desert |
| 0.75 ~ 0.9 | ice-giant / gas-giant |
| 0.9 ~ 1.0 | ice-giant / moon |

- 生物群系（biome）由 planet class 派生
- 资源表（按 planet class 过滤）

## 地表层（prism 阶段实现）

**算法骨架（待实现）：**

```typescript
function generatePlanetSurface(seed: number, radius: number, biomes: Biome[]):
  HeightMap + BiomeMap + ResourceMap
{
  const noise = makeNoise3D(seed);
  const elevation = fbm3D(noise, octaves=6, lacunarity=2.0, gain=0.5);
  const moisture = fbm3D(noise.salt('moisture'), octaves=4);
  const biomeMap = classifyBiomes(elevation, moisture, biomes);
  const resources = scatterResources(elevation, biomeMap, seed);
  return { elevation, biomeMap, resources };
}
```

**视觉规则：**
- 山脊用 ridge noise（1 - |fbm|）²
- 海平面由"该行星平均海拔的 0.3 分位数"动态决定
- 资源点 scatter 在 elevation > 0.6 的山脊或 volcanic biomes

## 性能预算

| 操作 | 目标耗时 | 实测 |
|---|---|---|
| generateGalaxy | < 50ms | TBD |
| generatePlanetSurface | < 100ms | TBD |
| 200 stars × 4 planets = 800 planets in memory | < 200MB | TBD |

## 调色板（prism 阶段）

每个星球从 seed 派生 5 色 palette：
- deep-water / shallow-water / beach / lowland / highland / peak

调色板基于 HSL：在 base hue 上 ±30° 扰动，saturation 按 biome 加权。

## 命名

- 星系：从 syllable 池随机拼 2~4 个音节，首字母大写
- 恒星：`Stellar-NNNN`（按 sector）
- 行星：`Planet-N`（按 orbit index，0-based）

## 验证清单

- [x] 同坐标 → 同星系（galaxy.test.ts）
- [x] 不同坐标 → 不同星系
- [x] 行星轨道有序
- [x] 星系数在 [180, 420]
- [ ] 地表生成确定性
- [ ] 地表生成性能 < 100ms
- [ ] 视觉对比：连续 10 个星系不应有明显重复感

## 未来扩展（暂不做）

- 动态事件（外星舰队、商队、海盗）
- 文明系统（遗迹、NPC 派系）
- 多星系统（双星、三星）
- 行星环
- 小行星带
- 程序生成飞船/生物（模块拼装）