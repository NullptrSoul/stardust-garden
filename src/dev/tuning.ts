import GUI from 'lil-gui';
import { config } from '../game/config';
import type { Game } from '../game/game';

/** Live tuning panel for playtesting. Web only; never shipped to WeChat. */
export function createTuningPanel(game: Game): void {
  const gui = new GUI({ title: '调参面板（原型）' });

  const player = gui.addFolder('角色');
  player.add(config, 'playerSpeed', 120, 600, 10).name('移动速度');
  player.add(config, 'invulnTime', 0, 2, 0.05).name('受伤无敌（秒）');
  player.add(config, 'basePickup', 20, 300, 5).name('基础拾取范围');
  player.add(config, 'joystickRadius', 40, 160, 5).name('摇杆半径');

  const waves = gui.addFolder('波次');
  waves.add(config, 'spawnIntervalFirst', 0.3, 4, 0.05).name('第 1 波刷怪间隔');
  waves.add(config, 'spawnIntervalLast', 0.1, 2, 0.05).name('第 10 波刷怪间隔');
  waves.add(config, 'spawnTelegraph', 0.2, 2, 0.05).name('刷怪预警（秒）');
  waves.add(config, 'enemyHpGrowth', 0, 1, 0.05).name('怪物每波加血');
  waves.add(config, 'maxEnemies', 20, 300, 10).name('同屏怪物上限');

  const skill = gui.addFolder('技能');
  skill.add(config, 'skillChargePerSec', 0, 30, 0.5).name('每秒充能');
  skill.add(config, 'skillChargePerKill', 0, 20, 0.5).name('每次击杀充能');
  skill.add(config, 'skillStartEnergy', 0, 100, 5).name('每波初始能量');
  skill.add(config, 'skillWaveScaling', 0, 0.5, 0.01).name('每波技能增伤');

  const economy = gui.addFolder('经济');
  economy.add(config, 'priceGrowth', 0, 0.5, 0.01).name('每波涨价');
  economy.add(config, 'rerollBase', 0, 20, 1).name('刷新基础价');
  economy.add(config, 'xpBase', 2, 40, 1).name('升级基础经验');
  economy.add(config, 'xpPerLevel', 0, 20, 1).name('每级多需经验');

  waves.add(config, 'eliteChance', 0, 0.5, 0.01).name('精英出现率');
  waves.add(config, 'spawnMaxDistance', 300, 1200, 10).name('刷怪最远距离');

  const feel = gui.addFolder('手感');
  feel.add(config, 'sound').name('音效');
  feel.add(config, 'shake').name('震动');
  feel.add(config, 'hitStop').name('顿帧');
  feel.add(config, 'screenFlash').name('受伤红边');
  feel.add(config, 'knockbackScale', 0, 3, 0.1).name('击退倍率');

  const actions = {
    endWave: () => game.debugEndWave(),
    shards: () => game.debugAddShards(50),
    skill: () => game.debugFillSkill(),
    king: () => game.debugJumpToWave(5),
    knight: () => game.debugJumpToWave(8),
    queen: () => game.debugJumpToWave(10),
  };
  gui.add(actions, 'endWave').name('直接结束这一波');
  gui.add(actions, 'shards').name('星屑 +50');
  gui.add(actions, 'skill').name('技能充满');
  gui.add(actions, 'king').name('跳到第 5 波 Boss');
  gui.add(actions, 'knight').name('跳到第 8 波 Boss');
  gui.add(actions, 'queen').name('跳到第 10 波 Boss');

  for (const folder of [waves, skill, economy, feel]) folder.close();
  if (window.innerWidth < 760) gui.close();
}
