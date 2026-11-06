import type { StatMods } from '../stats';

export type Accessory = 'horns' | 'catEars' | 'headdress' | 'flower' | 'hat' | 'maid';

/** Rule-breaking passives that plain stat mods can't express. */
export type Special = 'lastStand' | 'bonusShards';

/**
 * sanctuary: heal, invulnerability, push nearby monsters away.
 * thunderstorm: a series of lightning strikes on nearby monsters.
 * judgment: one huge melee sweep all around.
 * fireRing: fireballs orbit the character for a few seconds.
 * gale: blow every monster on screen away, slow them, clear bullets.
 * whale: a whale crashes onto the densest crowd, and heals.
 */
export type SkillKind = 'sanctuary' | 'thunderstorm' | 'judgment' | 'fireRing' | 'gale' | 'whale';

export interface SkillDef {
  kind: SkillKind;
  name: string;
  desc: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  /** Signature color for cards and effects. */
  color: string;
  // Placeholder chibi colors, used until the character's image exists.
  hair: string;
  eyes: string;
  outfit: string;
  accessory: Accessory;
  startWeapon: string;
  mods: StatMods;
  special?: Special;
  passive: string;
  /** Active skill, cast with the skill button once energy is full. */
  skill: SkillDef;
}

/**
 * Original characters. Looks come from the user's own AI-generated art;
 * no company names, logos or logo-shaped props.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'bailan',
    name: '白澜',
    title: '白龙巫女',
    color: '#B9A2FF',
    hair: '#F4F1FF',
    eyes: '#A57CF2',
    outfit: '#FFFFFF',
    accessory: 'horns',
    startWeapon: 'staff',
    mods: { regen: 2, pickup: 40 },
    special: 'lastStand',
    passive: '生命回复 +2，拾取范围 +40\n每局一次，受到致命伤时保留 1 点生命',
    skill: { kind: 'sanctuary', name: '龙息圣光', desc: '回复 40% 生命，3 秒无敌，并震开周围的怪物' },
  },
  {
    id: 'ziling',
    name: '紫铃',
    title: '猫耳游侠',
    color: '#A57CF2',
    hair: '#8A63E0',
    eyes: '#FF8FB8',
    outfit: '#4F43A8',
    accessory: 'catEars',
    startWeapon: 'talisman',
    mods: { speed: 15, dodge: 10, maxHp: -3 },
    passive: '移速 +15%，闪避 +10%\n生命上限 -3',
    skill: { kind: 'thunderstorm', name: '猫步雷暴', desc: '召唤 10 道落雷，依次劈向附近的怪物' },
  },
  {
    id: 'jinti',
    name: '金缇',
    title: '断罪骑士',
    color: '#E2B65C',
    hair: '#FFD98A',
    eyes: '#4F74E3',
    outfit: '#3A2E50',
    accessory: 'headdress',
    startWeapon: 'crescent',
    mods: { meleeDamage: 30, crit: 10, rangedDamage: -30 },
    passive: '近战伤害 +30%，暴击 +10%\n远程伤害 -30%',
    skill: { kind: 'judgment', name: '断罪之戟', desc: '挥出一圈巨大的戟风，重创并击飞周围所有怪物' },
  },
  {
    id: 'juyan',
    name: '橘言',
    title: '书库贤者',
    color: '#FF9F5A',
    hair: '#FF9A4D',
    eyes: '#C9661E',
    outfit: '#FFF4E6',
    accessory: 'flower',
    startWeapon: 'tome',
    mods: { xpGain: 30, luck: 10, damage: -5 },
    passive: '经验 +30%，幸运 +10\n伤害 -5%',
    skill: { kind: 'fireRing', name: '焚书之环', desc: '8 颗火球绕身旋转 6 秒，烧伤碰到的怪物' },
  },
  {
    id: 'qinglan',
    name: '青岚',
    title: '风之歌姬',
    color: '#6C9BFF',
    hair: '#5B86F0',
    eyes: '#2F55C2',
    outfit: '#FFFFFF',
    accessory: 'hat',
    startWeapon: 'fan',
    mods: { range: 60, attackSpeed: 10 },
    passive: '范围 +60，攻速 +10%',
    skill: { kind: 'gale', name: '青岚扇舞', desc: '扇出狂风吹飞全屏怪物，减速 4 秒，并吹散子弹' },
  },
  {
    id: 'shenxi',
    name: '深汐',
    title: '深海女仆',
    color: '#4A62C4',
    hair: '#3A4FA6',
    eyes: '#6C9BFF',
    outfit: '#2E3B80',
    accessory: 'maid',
    startWeapon: 'bubble',
    mods: { armor: 3, maxHp: 8, speed: -8 },
    special: 'bonusShards',
    passive: '护甲 +3，生命上限 +8，移速 -8%\n每波结束额外获得 15% 星屑',
    skill: { kind: 'whale', name: '深海鲸歌', desc: '召唤巨鲸砸向怪物最多的地方，并回复 20% 生命' },
  },
];

export const chibiImagePath = (id: string): string => `characters/${id}/chibi.png`;
export const portraitImagePath = (id: string): string => `characters/${id}/portrait.png`;
export const avatarImagePath = (id: string): string => `characters/${id}/avatar.png`;
