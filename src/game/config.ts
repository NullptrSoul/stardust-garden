/**
 * Tunable numbers (starting values from docs/game-design.md).
 * The dev tuning panel edits this object live.
 */
export const config = {
  // Player
  playerSpeed: 290,
  playerRadius: 24,
  /** Seconds of invulnerability after taking a hit. */
  invulnTime: 0.6,
  /** HP per second for each point of regen. */
  regenPerPoint: 0.12,
  /** Base distance at which star shards start flying to the player. */
  basePickup: 90,
  /** Weapons float this far outside the character's outline. */
  weaponOrbit: 16,
  /** Drag distance for full speed on the virtual joystick. */
  joystickRadius: 80,

  // Waves
  waveCount: 10,
  /** Seconds per wave; 0 means the wave lasts until the boss dies (waves 5, 8, 10). */
  waveDurations: [20, 25, 25, 30, 0, 35, 40, 0, 45, 0],
  /** Elite monsters appear from this wave on. */
  eliteFirstWave: 3,
  eliteChance: 0.04,
  /** Extra elite chance per wave after the first elite wave. */
  eliteChancePerWave: 0.012,
  spawnIntervalFirst: 1.4,
  spawnIntervalLast: 0.5,
  /** Seconds a spawn marker shows before the monster appears. */
  spawnTelegraph: 0.8,
  /** Monsters never spawn closer than this to the player. */
  spawnSafeDistance: 210,
  /** ...and never farther, so the fight stays around the player on a big map. */
  spawnMaxDistance: 650,
  maxEnemies: 120,
  /** Monster HP grows by this share each wave... */
  enemyHpGrowth: 0.3,
  /** ...plus this share times (wave - 1)², so late waves keep up with a grown build. */
  enemyHpQuad: 0.012,
  /** Monster damage grows by 1 every this many waves. */
  enemyDamageEvery: 3,

  // Active skill (energy fills to 100, then the skill can be cast)
  skillChargePerSec: 4,
  skillChargePerKill: 3,
  /** Energy at the start of each wave. */
  skillStartEnergy: 40,
  /** Skill damage grows by this share each wave so it stays useful late. */
  skillWaveScaling: 0.15,

  // Economy
  shopSize: 4,
  rerollBase: 2,
  /** Shop prices grow by this share each wave. */
  priceGrowth: 0.15,
  /** Shards for the next level: xpBase + xpPerLevel·(level-1) + xpQuad·(level-1)². */
  xpBase: 10,
  xpPerLevel: 5,
  xpQuad: 1,
  maxWeapons: 6,

  // Feel
  sound: true,
  /** Background music. */
  music: true,
  /** Screen shake and camera kick. */
  shake: true,
  /** Brief freeze frames on kills, crits and big hits. */
  hitStop: true,
  /** Red screen-edge flash when hurt or low on HP. */
  screenFlash: true,
  /**
   * Joystick ring follows the finger once it leaves the rim. Off by default:
   * playtesters found a ring that stays where the thumb landed more comfortable.
   */
  stickFollow: false,
  /** Inner dead zone of the joystick, as a share of its radius. */
  stickDeadZone: 0.12,
  /** Global multiplier on how far hits push monsters. */
  knockbackScale: 1.4,
};
