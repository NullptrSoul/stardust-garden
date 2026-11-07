# 星屑庭院（暂定名）

竖屏动作肉鸽：操控二次元少女走位，武器自动攻击一波波萌系怪物，波次之间升级、逛商店。

**在线试玩：https://nullptrsoul.github.io/stardust-garden/** （手机、电脑浏览器都能打开）

- 玩法设计：[docs/game-design.md](docs/game-design.md)
- 角色图片出图要求：[docs/art-spec.md](docs/art-spec.md)

- 参考笔记（土豆兄弟等同类游戏）：[docs/reference-notes.md](docs/reference-notes.md)
- 优化路线（按优先级）：[docs/roadmap.md](docs/roadmap.md)

当前进度：**可玩原型**。镜头跟随的漂浮花园岛场景，6 个角色（Q 版小人、头像、立绘，各有一个主动技能），6 种武器，15 个道具，8 种怪物外加精英和 Boss，星屑、回血糖果和宝箱，升级选卡，商店（购买、刷新、锁定、合成、卖武器），暂停和属性页，10 波完整流程，失败复活和通关。角色图是从参考图裁出来的临时素材，见 [docs/art-spec.md](docs/art-spec.md)。

## 运行

第一次运行先装依赖：

```bash
npm install
```

启动开发版（改代码后浏览器会自动刷新）：

```bash
npm run dev
```

然后打开 http://localhost:5173 。

**用手机试玩**：手机和电脑连同一个 Wi-Fi，打开终端里 `Network:` 后面的地址。

## 操作

- 手机：手指按住屏幕任意位置拖动，角色往那个方向走；能量满了点右下角放技能。
- 电脑：鼠标拖动，或者用 WASD / 方向键；空格或 E 放技能；Esc 或 P 暂停。
- 武器全自动攻击。

## 调参面板

开发版右上角有调参面板，可以实时改移动速度、刷怪频率、怪物成长、物价等，还能直接结束当前这一波、加星屑。部署后的网页在地址后面加 `?tune` 也能打开。

## 其他命令

```bash
npm test
```

```bash
npm run build
```

## 发布

推送到 GitHub 的 `main` 分支后，GitHub Actions（`.github/workflows/deploy.yml`）会自动跑测试、打包，并更新上面的试玩网页，一般一两分钟生效。

## 代码结构

```
src/
  platform/     浏览器相关的代码（以后加一个微信版实现同一套接口）
  engine/       通用工具：随机数、数学、画布按钮
  game/
    data/       角色、武器、道具、怪物、升级卡的数据
    art/        代码绘制的怪物、占位角色、图标、场地
    run.ts      一局的状态：属性、经验、商店、武器合成
    world.ts    一波战斗：移动、刷怪、武器、子弹、拾取
    game.ts     场景流程和操作
    render.ts   画面
  dev/          只在网页版用的调参面板
public/
  characters/   角色图片放这里（见 docs/art-spec.md）
tools/          处理素材的脚本（从参考图裁角色）
art-source/     参考原图，只在本地，不提交
```
