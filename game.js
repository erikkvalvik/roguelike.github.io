// ===================== ASHEN HOLLOW =====================
// Minimal bullet-hell roguelike prototype
// Pixel art drawn procedurally on canvas - no external assets needed

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width, H = canvas.height;

// World is larger than the viewport; camera follows the player
const WORLD_W = 2400;
const WORLD_H = 1600;
const camera = { x: 0, y: 0 };

// ---------------- Input ----------------
const keys = {};
const mouse = { x: W/2, y: H/2, down: false }; // screen-space mouse position
const mouseWorld = { x: 0, y: 0 };             // world-space mouse position

window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape') togglePause();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (W / rect.width);
  mouse.y = (e.clientY - rect.top) * (H / rect.height);
});
canvas.addEventListener('mousedown', () => mouse.down = true);
canvas.addEventListener('mouseup', () => mouse.down = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------------- Utility ----------------
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }

// ---------------- Palette (dark fantasy) ----------------
const PAL = {
  bg: '#15101f',
  bgGrid: '#1f1830',
  bone: '#d8c9a3',
  flesh: '#a3654a',
  blood: '#c4453d',
  bloodDark: '#7a1f2b',
  glowPurple: '#9a5cff',
  glowSick: '#7fff7a',
  shadow: '#0a0710',
  metal: '#8a8a9a',
  eye: '#ffe55c'
};

// ---------------- Pixel-art sprite drawer ----------------
// Draws a grid of colored pixels (each "pixel" is scaled up) centered at x,y
function drawSprite(grid, x, y, pxSize, flip = false) {
  const rows = grid.length;
  const cols = grid[0].length;
  const w = cols * pxSize;
  const h = rows * pxSize;
  const startX = x - w / 2;
  const startY = y - h / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = grid[r][c];
      if (!col) continue;
      const cx = flip ? (cols - 1 - c) : c;
      ctx.fillStyle = col;
      ctx.fillRect(
        Math.round(startX + cx * pxSize),
        Math.round(startY + r * pxSize),
        pxSize, pxSize
      );
    }
  }
}

// Enemy sprite: a skeletal husk (8x8 grid)
const ENEMY_SPRITE = [
  [0,0,'#5a3a3a','#5a3a3a','#5a3a3a','#5a3a3a',0,0],
  [0,'#5a3a3a',PAL.bone,PAL.bone,PAL.bone,PAL.bone,'#5a3a3a',0],
  [0,'#5a3a3a',PAL.eye,'#2a1010',PAL.eye,'#2a1010','#5a3a3a',0],
  [0,'#5a3a3a',PAL.bone,PAL.bone,PAL.bone,PAL.bone,'#5a3a3a',0],
  [0,0,'#5a3a3a','#3a2020','#3a2020','#5a3a3a',0,0],
  [0,'#5a3a3a','#3a2020',0,0,'#3a2020','#5a3a3a',0],
  [0,'#5a3a3a',0,0,0,0,'#5a3a3a',0],
  [0,0,'#3a2020',0,0,'#3a2020',0,0],
];

// Brute sprite: a hulking armored abomination (10x10 grid)
const BRUTE_SPRITE = [
  [0,0,'#3a3a4a','#3a3a4a','#3a3a4a','#3a3a4a','#3a3a4a','#3a3a4a',0,0],
  [0,'#3a3a4a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#3a3a4a',0],
  ['#3a3a4a','#5a5a6a',PAL.eye,'#2a1010',PAL.eye,PAL.eye,'#2a1010',PAL.eye,'#5a5a6a','#3a3a4a'],
  ['#3a3a4a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#5a5a6a','#3a3a4a'],
  ['#3a3a4a','#4a3a5a','#5a5a6a','#4a3a5a','#5a5a6a','#5a5a6a','#4a3a5a','#5a5a6a','#4a3a5a','#3a3a4a'],
  [0,'#3a3a4a','#4a3a5a','#4a3a5a','#4a3a5a','#4a3a5a','#4a3a5a','#4a3a5a','#3a3a4a',0],
  [0,'#3a3a4a','#5a5a6a','#5a5a6a',0,0,'#5a5a6a','#5a5a6a','#3a3a4a',0],
  [0,'#3a3a4a','#5a5a6a','#5a5a6a',0,0,'#5a5a6a','#5a5a6a','#3a3a4a',0],
  [0,'#3a3a4a','#3a3a4a',0,0,0,0,'#3a3a4a','#3a3a4a',0],
  [0,'#1f1f2a',0,0,0,0,0,0,'#1f1f2a',0],
];


// ---------------- Weapon Definitions ----------------
// Each weapon defines base stats, a fire function, and its own upgrade pool.
const WEAPONS = {
  revolver: {
    id: 'revolver',
    name: 'Revolver',
    type: 'projectile',
    baseDamage: 18,
    baseFireRate: 0.45, // seconds between shots
    projectileSpeed: 620,
    projectileColor: PAL.glowPurple,
    projectileR: 4,
    pierce: 0,
    multiShot: 1,
    spreadAngle: 0.16,
    ricochet: 0, // extra targets bullets bounce to (level 20 special)
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    type: 'cone',
    baseDamagePerMs: 1,       // damage per millisecond of contact
    baseActiveTime: 1.0,      // seconds the cone is emitted
    baseCooldown: 4.0,        // seconds before it can fire again
    baseRange: 160,           // length of the cone
    coneAngle: 0.6,           // radians, total cone width
    color: '#ff6a2a',
    burnChance: 0,            // chance to apply burn debuff (level 20 special)
  },
};

// ---------------- Character Definitions ----------------
const CHARACTERS = {
  gunslinger: {
    id: 'gunslinger',
    name: 'Gunslinger',
    desc: 'A quick-draw outlaw, cursed to wander the hollow with revolver in hand.',
    weaponId: 'revolver',
    baseStats: {
      speed: 240,
      maxHp: 100,
    },
    sprite: [
      [0,0,0,'#3a2a4a','#3a2a4a',0,0,0],
      [0,0,'#3a2a4a','#3a2a4a','#3a2a4a','#3a2a4a',0,0],
      [0,0,'#2a1a3a',PAL.eye,PAL.eye,'#2a1a3a',0,0],
      [0,'#3a2a4a','#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a','#3a2a4a',0],
      [0,'#3a2a4a','#5a3a6a','#5a3a6a','#5a3a6a','#5a3a6a','#3a2a4a',0],
      [0,0,'#3a2a4a','#5a3a6a','#5a3a6a','#3a2a4a',0,0],
      [0,0,'#2a1a3a',0,0,'#2a1a3a',0,0],
      [0,'#1a0f2a',0,0,0,0,'#1a0f2a',0],
    ],
  },
};

let selectedCharacterId = 'gunslinger';

// ---------------- Background ----------------
function drawBackground() {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);

  // subtle grid of cracked stone tiles, aligned to world space
  const tile = 64;
  ctx.strokeStyle = PAL.bgGrid;
  ctx.lineWidth = 1;
  const startX = -((camera.x) % tile);
  const startY = -((camera.y) % tile);
  for (let x = startX; x < W; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = startY; y < H; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // world boundary walls (drawn in world space, offset by camera)
  ctx.strokeStyle = '#3a2a4a';
  ctx.lineWidth = 6;
  ctx.strokeRect(-camera.x, -camera.y, WORLD_W, WORLD_H);

  // vignette (screen space, always on top)
  const grad = ctx.createRadialGradient(W/2, H/2, H/3, W/2, H/2, H/0.9);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ---------------- Entities ----------------
// player and weapon runtime state are (re)initialized in startGame()
const player = {
  x: WORLD_W/2, y: WORLD_H/2, r: 14,
  speed: 240,
  hp: 100, maxHp: 100,
  invuln: 0,
  regen: 0,         // hp regenerated per second
  regenAccum: 0,
  level: 1,
  xp: 0,
  xpToNext: 20,
  characterId: 'gunslinger',
  sprite: CHARACTERS.gunslinger.sprite,
  lastMoveDir: { x: 1, y: 0 }, // for flamethrower facing direction
};

// playerWeapons: array of active weapon runtime instances.
// Each instance tracks its own level, cooldowns, and upgrade-modified stats.
let playerWeapons = [];

const WEAPON_LEVEL_CAP = 20;

// create a fresh runtime instance for a weapon id, using its base stats
function createWeaponInstance(weaponId) {
  const def = WEAPONS[weaponId];
  if (def.type === 'projectile') {
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      level: 1,
      maxedSpecialApplied: false,
      damage: def.baseDamage,
      fireRate: def.baseFireRate,
      fireCooldown: 0,
      projectileSpeed: def.projectileSpeed,
      projectileColor: def.projectileColor,
      projectileR: def.projectileR,
      pierce: def.pierce,
      multiShot: def.multiShot,
      spreadAngle: def.spreadAngle,
      ricochet: def.ricochet,
    };
  } else if (def.type === 'cone') {
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      level: 1,
      maxedSpecialApplied: false,
      damagePerMs: def.baseDamagePerMs,
      activeTime: def.baseActiveTime,
      cooldown: def.baseCooldown,
      range: def.baseRange,
      coneAngle: def.coneAngle,
      color: def.color,
      burnChance: def.burnChance,
      // runtime state
      cooldownTimer: 0,
      activeTimer: 0,
      firing: false,
    };
  }
}

// convenience getter for the player's first weapon (used by HUD/pause display)
function primaryWeapon() {
  return playerWeapons[0];
}

let bullets = [];      // player bullets
let enemyBullets = [];  // enemy bullets
let enemies = [];
let particles = [];
let xpOrbs = [];

let score = 0;
let wave = 1;
let waveTimer = 0;
let spawnTimer = 0;
let gameRunning = false;
let gamePaused = false;
let gameTime = 0;

// ---------------- Enemy Wave Schedule ----------------
// Initial scripted waves of the basic husk enemy, keyed by time played (seconds)
const SCHEDULED_WAVES = [
  { time: 0, count: 3 },
  { time: 5, count: 10 },
  { time: 15, count: 20 },
];
let nextScheduledWaveIndex = 0;
let recurringWaveTimer = 5; // countdown until next recurring wave after t=15s

// Brute wave schedule: 1 at 60s, 2 at 120s, then 1-6 every 60s from 120s onward
const BRUTE_SCHEDULED_WAVES = [
  { time: 60, count: 1 },
  { time: 120, count: 2 },
];
let nextBruteWaveIndex = 0;
let recurringBruteWaveTimer = 60; // countdown until next recurring brute wave after t=120s

// ---------------- Spawning ----------------
function spawnPositionOutsideView() {
  const edge = Math.floor(rand(0, 4));
  let x, y;
  const margin = 60;
  if (edge === 0) { x = rand(camera.x, camera.x + W); y = camera.y - margin; }
  else if (edge === 1) { x = rand(camera.x, camera.x + W); y = camera.y + H + margin; }
  else if (edge === 2) { x = camera.x - margin; y = rand(camera.y, camera.y + H); }
  else { x = camera.x + W + margin; y = rand(camera.y, camera.y + H); }

  x = clamp(x, 20, WORLD_W - 20);
  y = clamp(y, 20, WORLD_H - 20);
  return { x, y };
}

function spawnEnemy() {
  const { x, y } = spawnPositionOutsideView();
  const baseHp = 30 + wave * 6;
  enemies.push({
    type: 'husk',
    x, y, r: 16,
    hp: baseHp, maxHp: baseHp,
    speed: rand(40, 70) + wave * 2,
    contactDamage: 10,
    wobble: rand(0, Math.PI * 2),
    xpValue: 8 + wave,
  });
}

// Brute: large, slow, high HP. Stops, charges for 0.5s, then fires a slow homing projectile
// once the player is within its medium range.
const BRUTE_RANGE = 380;       // medium range - detection/firing range
const BRUTE_CHARGE_TIME = 0.5; // seconds to charge before firing
const BRUTE_FIRE_COOLDOWN = 2.5; // seconds between shots once in range
const BRUTE_PROJECTILE_SPEED = 110; // slow moving
const BRUTE_PROJECTILE_TURN_RATE = 2.2; // radians/sec the homing projectile can turn

function spawnBrute() {
  const { x, y } = spawnPositionOutsideView();
  const baseHp = 220 + wave * 25;
  enemies.push({
    type: 'brute',
    x, y, r: 28,
    hp: baseHp, maxHp: baseHp,
    speed: rand(18, 28),
    contactDamage: 22,
    wobble: rand(0, Math.PI * 2),
    xpValue: 60 + wave * 4,
    // brute-specific state
    state: 'approach', // 'approach' | 'charging' | 'cooldown'
    chargeTimer: 0,
    fireCooldown: 0,
  });
}

function spawnEnemyWave(count) {
  for (let i = 0; i < count; i++) {
    spawnEnemy();
  }
}

function spawnBruteWave(count) {
  for (let i = 0; i < count; i++) {
    spawnBrute();
  }
}

// ---------------- Particles (death/hit effects) ----------------
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(40, 160);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.3, 0.7),
      maxLife: 0.7,
      color,
      size: rand(2, 4),
    });
  }
}

// ---------------- XP / Leveling ----------------
function spawnXpOrb(x, y, value) {
  xpOrbs.push({
    x, y, r: 5,
    value,
    bob: rand(0, Math.PI * 2),
  });
}

// General upgrades apply to the player/character (not weapon-specific)
const GENERAL_UPGRADE_POOL = [
  {
    id: 'speed',
    name: 'Grave Step',
    desc: 'Movement speed +15%',
    apply: () => { player.speed *= 1.15; },
  },
  {
    id: 'maxhp',
    name: 'Bone Ward',
    desc: 'Max HP +25, heal 25',
    apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); },
  },
  {
    id: 'regen',
    name: 'Hollow Vigor',
    desc: 'Regenerate 1 HP/sec',
    apply: () => { player.regen += 1; },
  },
];

// Weapon-specific upgrade pools, keyed by weapon id.
// Each upgrade's apply() receives the weapon instance to modify.
const WEAPON_UPGRADE_POOLS = {
  revolver: [
    {
      id: 'damage',
      name: 'Wraith Edge',
      desc: 'Shots deal +6 damage',
      apply: (w) => { w.damage += 6; },
    },
    {
      id: 'firerate',
      name: 'Frenzied Hand',
      desc: 'Fire rate +18% faster',
      apply: (w) => { w.fireRate = Math.max(0.05, w.fireRate * 0.82); },
    },
    {
      id: 'multishot',
      name: 'Cursed Volley',
      desc: '+1 projectile per shot',
      apply: (w) => { w.multiShot += 1; },
    },
    {
      id: 'pierce',
      name: 'Soul Piercer',
      desc: 'Bullets pierce +1 enemy',
      apply: (w) => { w.pierce += 1; },
    },
  ],
  flamethrower: [
    {
      id: 'reload',
      name: 'Quickened Valve',
      desc: 'Cooldown -15%',
      apply: (w) => { w.cooldown = Math.max(0.3, w.cooldown * 0.85); },
    },
    {
      id: 'tank',
      name: 'Expanded Tank',
      desc: 'Active time +10%',
      apply: (w) => { w.activeTime *= 1.10; },
    },
    {
      id: 'fuel',
      name: 'Refined Fuel',
      desc: 'Range +5%',
      apply: (w) => { w.range *= 1.05; },
    },
  ],
};

// Level-20 special upgrades, keyed by weapon id.
// Granted automatically (not via random roll) the first time a weapon reaches level 20.
const WEAPON_SPECIAL_UPGRADES = {
  revolver: {
    name: 'Ricochet Rounds',
    desc: 'Bullets ricochet to 2 extra targets',
    apply: (w) => { w.ricochet += 2; },
  },
  flamethrower: {
    name: 'Searing Catalyst',
    desc: '20% chance to ignite enemies, burning for 10-30 damage over 3s',
    apply: (w) => { w.burnChance = 0.20; },
  },
};

// pick `count` unique random upgrades from the combined general + active weapon pools.
// Also may include a "discover new weapon" option if one is available.
function rollUpgrades(count) {
  const pool = [];

  // general upgrades always available
  for (const u of GENERAL_UPGRADE_POOL) {
    pool.push({ ...u, displayName: u.name, kind: 'general' });
  }

  // weapon-specific upgrades for each owned weapon, only if below level cap
  for (const w of playerWeapons) {
    if (w.level < WEAPON_LEVEL_CAP) {
      const weaponPool = WEAPON_UPGRADE_POOLS[w.id] || [];
      for (const u of weaponPool) {
        pool.push({
          ...u,
          displayName: `${u.name} (${w.name})`,
          kind: 'weapon',
          weaponInstance: w,
        });
      }
    }
  }

  // discoverable new weapons (not yet owned)
  for (const weaponId in WEAPONS) {
    if (!playerWeapons.some(w => w.id === weaponId)) {
      const def = WEAPONS[weaponId];
      pool.push({
        id: `discover_${weaponId}`,
        name: def.name,
        displayName: `New Weapon: ${def.name}`,
        desc: weaponDiscoveryDesc(weaponId),
        kind: 'discover',
        apply: () => { playerWeapons.push(createWeaponInstance(weaponId)); },
      });
    }
  }

  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand(0, pool.length));
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

function weaponDiscoveryDesc(weaponId) {
  if (weaponId === 'flamethrower') {
    return 'Wield a flamethrower, scorching foes in a cone before you';
  }
  if (weaponId === 'revolver') {
    return 'Wield a trusty revolver';
  }
  return 'A new weapon';
}

// level up a specific weapon instance, applying its level-20 special if reached
function levelUpWeapon(w) {
  w.level += 1;
  if (w.level >= WEAPON_LEVEL_CAP && !w.maxedSpecialApplied) {
    const special = WEAPON_SPECIAL_UPGRADES[w.id];
    if (special) {
      special.apply(w);
      w.maxedSpecialApplied = true;
      // queue a notification so the player knows they got the special
      pendingSpecialNotice = { weaponName: w.name, name: special.name, desc: special.desc };
    }
  }
}

let pendingSpecialNotice = null;

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.35 + 10);
    triggerLevelUp();
  }
}

function triggerLevelUp() {
  gamePaused = true;
  const choices = rollUpgrades(3);
  const overlay = document.getElementById('levelUp');
  const optionsDiv = document.getElementById('upgradeOptions');
  optionsDiv.innerHTML = '';
  document.getElementById('levelUpTitle').textContent = `Level ${player.level} - Choose a Blessing`;
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.className = 'upgradeBtn';
    btn.innerHTML = `<div class="upgradeName">${choice.displayName}</div><div class="upgradeDesc">${choice.desc}</div>`;
    btn.addEventListener('click', () => {
      if (choice.kind === 'weapon') {
        choice.apply(choice.weaponInstance);
        levelUpWeapon(choice.weaponInstance);
      } else {
        choice.apply();
      }
      overlay.style.display = 'none';
      gamePaused = false;
      lastTime = performance.now();
      requestAnimationFrame(loop);

      // show a special-upgrade notice if one was just granted
      if (pendingSpecialNotice) {
        showSpecialNotice(pendingSpecialNotice);
        pendingSpecialNotice = null;
      }
    });
    optionsDiv.appendChild(btn);
  }
  overlay.style.display = 'block';
}

// brief overlay shown when a weapon reaches its level-20 special upgrade
function showSpecialNotice(notice) {
  gamePaused = true;
  const overlay = document.getElementById('levelUp');
  const optionsDiv = document.getElementById('upgradeOptions');
  optionsDiv.innerHTML = '';
  document.getElementById('levelUpTitle').textContent = `${notice.weaponName} Mastered!`;
  const btn = document.createElement('button');
  btn.className = 'upgradeBtn';
  btn.innerHTML = `<div class="upgradeName">${notice.name}</div><div class="upgradeDesc">${notice.desc}</div>`;
  btn.addEventListener('click', () => {
    overlay.style.display = 'none';
    gamePaused = false;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });
  optionsDiv.appendChild(btn);
  overlay.style.display = 'block';
}

// ---------------- Update ----------------
// Applies flamethrower cone damage to enemies within range/angle of the player's facing direction.
// Called every frame the flamethrower is actively firing.
function applyFlameCone(w, dt) {
  const dirX = player.lastMoveDir.x;
  const dirY = player.lastMoveDir.y;
  const facingAngle = Math.atan2(dirY, dirX);
  const halfCone = w.coneAngle / 2;
  const dmgThisFrame = w.damagePerMs * (dt * 1000); // damage per ms * ms elapsed

  for (const e of enemies) {
    const toEnemyAngle = Math.atan2(e.y - player.y, e.x - player.x);
    let angleDiff = toEnemyAngle - facingAngle;
    // normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const d = dist(e, player);
    if (d <= w.range + e.r && Math.abs(angleDiff) <= halfCone) {
      e.hp -= dmgThisFrame;
      // light particle feedback occasionally (not every frame, to avoid overload)
      if (Math.random() < 0.15) {
        spawnParticles(e.x, e.y, w.color, 1);
      }
      // chance to apply burn debuff (level-20 special)
      if (w.burnChance > 0 && !e.burning && Math.random() < w.burnChance * dt * 10) {
        e.burning = {
          totalDamage: rand(10, 30),
          duration: 3,
          elapsed: 0,
        };
      }
      if (e.hp <= 0) {
        spawnParticles(e.x, e.y, PAL.bone, 14);
        score += 10 + wave;
        spawnXpOrb(e.x, e.y, e.xpValue);
        const idx = enemies.indexOf(e);
        if (idx >= 0) enemies.splice(idx, 1);
      }
    }
  }
}

function update(dt) {
  gameTime += dt;

  // ---- Player movement ----
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    player.x += (dx/len) * player.speed * dt;
    player.y += (dy/len) * player.speed * dt;
    player.lastMoveDir.x = dx / len;
    player.lastMoveDir.y = dy / len;
  }
  player.x = clamp(player.x, player.r, WORLD_W - player.r);
  player.y = clamp(player.y, player.r, WORLD_H - player.r);

  // ---- Camera follows player, clamped to world bounds ----
  camera.x = clamp(player.x - W/2, 0, WORLD_W - W);
  camera.y = clamp(player.y - H/2, 0, WORLD_H - H);

  // ---- World-space mouse position ----
  mouseWorld.x = mouse.x + camera.x;
  mouseWorld.y = mouse.y + camera.y;

  if (player.invuln > 0) player.invuln -= dt;

  // ---- Player weapon firing ----
  for (const w of playerWeapons) {
    if (w.type === 'projectile') {
      w.fireCooldown -= dt;
      if (mouse.down && w.fireCooldown <= 0) {
        const baseAngle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
        const n = w.multiShot;
        const spread = w.spreadAngle;
        const startOffset = -((n - 1) / 2) * spread;
        for (let i = 0; i < n; i++) {
          const angle = baseAngle + startOffset + i * spread;
          bullets.push({
            x: player.x + Math.cos(angle) * 18,
            y: player.y + Math.sin(angle) * 18,
            vx: Math.cos(angle) * w.projectileSpeed,
            vy: Math.sin(angle) * w.projectileSpeed,
            r: w.projectileR,
            color: w.projectileColor,
            life: 1.5,
            damage: w.damage,
            pierceLeft: w.pierce,
            ricochetLeft: w.ricochet,
            hitSet: new Set(),
          });
        }
        w.fireCooldown = w.fireRate;
      }
    } else if (w.type === 'cone') {
      if (w.firing) {
        w.activeTimer -= dt;
        if (w.activeTimer <= 0) {
          w.firing = false;
          w.cooldownTimer = w.cooldown;
        }
      } else {
        w.cooldownTimer -= dt;
        if (w.cooldownTimer <= 0) {
          w.firing = true;
          w.activeTimer = w.activeTime;
        }
      }
      if (w.firing) {
        applyFlameCone(w, dt);
      }
    }
  }

  // ---- HP regen ----
  if (player.regen > 0 && player.hp < player.maxHp) {
    player.regenAccum += player.regen * dt;
    if (player.regenAccum >= 1) {
      const heal = Math.floor(player.regenAccum);
      player.hp = Math.min(player.maxHp, player.hp + heal);
      player.regenAccum -= heal;
    }
  }

  // ---- Player bullets ----
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > WORLD_W+20 || b.y < -20 || b.y > WORLD_H+20) {
      bullets.splice(i, 1);
      continue;
    }
    // check collision with enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.hitSet.has(e) || dist(b, e) >= b.r + e.r) continue;
      e.hp -= b.damage;
      spawnParticles(b.x, b.y, PAL.blood, 4);
      b.hitSet.add(e);
      if (e.hp <= 0) {
        spawnParticles(e.x, e.y, PAL.bone, 14);
        score += 10 + wave;
        spawnXpOrb(e.x, e.y, e.xpValue);
        enemies.splice(j, 1);
      }
      if (b.pierceLeft > 0) {
        b.pierceLeft -= 1;
      } else if (b.ricochetLeft > 0) {
        // ricochet: redirect toward the nearest enemy not already hit
        let target = null;
        let bestDist = Infinity;
        for (const other of enemies) {
          if (b.hitSet.has(other)) continue;
          const dd = dist(b, other);
          if (dd < bestDist) { bestDist = dd; target = other; }
        }
        if (target) {
          const a = Math.atan2(target.y - b.y, target.x - b.x);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(a) * speed;
          b.vy = Math.sin(a) * speed;
          b.ricochetLeft -= 1;
        } else {
          bullets.splice(i, 1);
        }
      } else {
        bullets.splice(i, 1);
        break;
      }
    }
  }

  // ---- Enemy Wave Spawning ----
  // Scheduled waves: time (seconds played) -> enemy count
  // wave 1: 0s -> 3, wave 2: 5s -> 10, wave 3: 15s -> 20
  // from 15s onward: every 5s, a wave of random size 10-30
  while (nextScheduledWaveIndex < SCHEDULED_WAVES.length &&
         gameTime >= SCHEDULED_WAVES[nextScheduledWaveIndex].time) {
    spawnEnemyWave(SCHEDULED_WAVES[nextScheduledWaveIndex].count);
    nextScheduledWaveIndex++;
  }
  if (gameTime >= 15) {
    recurringWaveTimer -= dt;
    if (recurringWaveTimer <= 0) {
      spawnEnemyWave(Math.floor(rand(10, 31)));
      recurringWaveTimer = 5;
    }
  }

  // Brute waves: 1 at 60s, 2 at 120s, then 1-6 every 60s from 120s onward
  while (nextBruteWaveIndex < BRUTE_SCHEDULED_WAVES.length &&
         gameTime >= BRUTE_SCHEDULED_WAVES[nextBruteWaveIndex].time) {
    spawnBruteWave(BRUTE_SCHEDULED_WAVES[nextBruteWaveIndex].count);
    nextBruteWaveIndex++;
  }
  if (gameTime >= 120) {
    recurringBruteWaveTimer -= dt;
    if (recurringBruteWaveTimer <= 0) {
      spawnBruteWave(Math.floor(rand(1, 7)));
      recurringBruteWaveTimer = 60;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.wobble += dt * 4;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    const d = dist(e, player);

    if (e.type === 'brute') {
      if (e.state === 'approach') {
        if (d <= BRUTE_RANGE) {
          e.state = 'charging';
          e.chargeTimer = BRUTE_CHARGE_TIME;
        } else {
          e.x += Math.cos(angle) * e.speed * dt;
          e.y += Math.sin(angle) * e.speed * dt;
        }
      } else if (e.state === 'charging') {
        e.chargeTimer -= dt;
        // brief telegraph particles while charging
        if (Math.random() < 0.3) {
          spawnParticles(e.x, e.y, PAL.eye, 1);
        }
        if (e.chargeTimer <= 0) {
          // fire a slow homing projectile toward the player
          enemyBullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(angle) * BRUTE_PROJECTILE_SPEED,
            vy: Math.sin(angle) * BRUTE_PROJECTILE_SPEED,
            r: 8,
            life: 8,
            homing: true,
            damage: 18,
          });
          e.state = 'cooldown';
          e.fireCooldown = BRUTE_FIRE_COOLDOWN;
        }
      } else if (e.state === 'cooldown') {
        e.fireCooldown -= dt;
        // slowly reposition while on cooldown
        if (d > BRUTE_RANGE * 0.6) {
          e.x += Math.cos(angle) * e.speed * dt;
          e.y += Math.sin(angle) * e.speed * dt;
        }
        if (e.fireCooldown <= 0) {
          e.state = (d <= BRUTE_RANGE) ? 'charging' : 'approach';
          if (e.state === 'charging') e.chargeTimer = BRUTE_CHARGE_TIME;
        }
      }
    } else {
      // husk: simple chase with wobble
      const wob = Math.sin(e.wobble) * 0.4;
      e.x += Math.cos(angle + wob) * e.speed * dt;
      e.y += Math.sin(angle + wob) * e.speed * dt;
    }

    // burn debuff (damage over time from flamethrower special)
    if (e.burning) {
      const b = e.burning;
      const dps = b.totalDamage / b.duration;
      e.hp -= dps * dt;
      b.elapsed += dt;
      if (Math.random() < 0.2) {
        spawnParticles(e.x, e.y, '#ff6a2a', 1);
      }
      if (b.elapsed >= b.duration) {
        e.burning = null;
      }
      if (e.hp <= 0) {
        spawnParticles(e.x, e.y, PAL.bone, 14);
        score += 10 + wave;
        spawnXpOrb(e.x, e.y, e.xpValue);
        enemies.splice(i, 1);
        continue;
      }
    }

    // collision with player (contact damage)
    if (dist(e, player) < e.r + player.r && player.invuln <= 0) {
      player.hp -= e.contactDamage;
      player.invuln = 0.6;
      spawnParticles(player.x, player.y, PAL.blood, 10);
      // knockback
      const a2 = Math.atan2(player.y - e.y, player.x - e.x);
      player.x += Math.cos(a2) * 20;
      player.y += Math.sin(a2) * 20;
    }
  }

  // ---- Enemy bullets ----
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];

    // homing projectiles slowly steer toward the player
    if (b.homing) {
      const currentAngle = Math.atan2(b.vy, b.vx);
      const targetAngle = Math.atan2(player.y - b.y, player.x - b.x);
      let diff = targetAngle - currentAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = BRUTE_PROJECTILE_TURN_RATE * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      const newAngle = currentAngle + turn;
      const speed = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(newAngle) * speed;
      b.vy = Math.sin(newAngle) * speed;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > WORLD_W+20 || b.y < -20 || b.y > WORLD_H+20) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (dist(b, player) < b.r + player.r && player.invuln <= 0) {
      player.hp -= (b.damage || 8);
      player.invuln = 0.6;
      spawnParticles(player.x, player.y, PAL.bloodDark, 8);
      enemyBullets.splice(i, 1);
    }
  }

  // ---- Particles ----
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ---- XP orbs ----
  for (let i = xpOrbs.length - 1; i >= 0; i--) {
    const o = xpOrbs[i];
    o.bob += dt * 6;
    const d = dist(o, player);
    const magnetRange = 110;
    if (d < magnetRange) {
      const a = Math.atan2(player.y - o.y, player.x - o.x);
      const pull = (1 - d / magnetRange) * 420 + 60;
      o.x += Math.cos(a) * pull * dt;
      o.y += Math.sin(a) * pull * dt;
    }
    if (d < player.r + o.r + 4) {
      gainXp(o.value);
      xpOrbs.splice(i, 1);
    }
  }

  // ---- Wave progression ----
  waveTimer += dt;
  if (waveTimer > 25) {
    wave++;
    waveTimer = 0;
  }

  // ---- Game over ----
  if (player.hp <= 0) {
    endGame();
  }

  // ---- UI ----
  document.getElementById('score').textContent = `Souls: ${score}`;
  document.getElementById('wave').textContent = `Depth: ${wave}`;
  document.getElementById('hpBarFill').style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;
  document.getElementById('level').textContent = `Level: ${player.level}`;
  document.getElementById('xpBarFill').style.width = `${clamp(player.xp / player.xpToNext * 100, 0, 100)}%`;
}

// ---------------- Draw ----------------
function draw() {
  drawBackground();

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // particles (behind entities)
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // enemy bullets
  for (const b of enemyBullets) {
    ctx.fillStyle = PAL.glowSick;
    ctx.shadowColor = PAL.glowSick;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // player bullets
  for (const b of bullets) {
    ctx.fillStyle = b.color || PAL.glowPurple;
    ctx.shadowColor = b.color || PAL.glowPurple;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // xp orbs
  for (const o of xpOrbs) {
    const bobY = Math.sin(o.bob) * 2;
    ctx.fillStyle = '#ffd23c';
    ctx.shadowColor = '#ffd23c';
    ctx.shadowBlur = 6;
    ctx.fillRect(o.x - o.r/2, o.y - o.r/2 + bobY, o.r, o.r);
    ctx.shadowBlur = 0;
  }

  // enemies
  for (const e of enemies) {
    if (e.type === 'brute') {
      drawSprite(BRUTE_SPRITE, e.x, e.y, 6);
      // charging telegraph ring
      if (e.state === 'charging') {
        ctx.strokeStyle = PAL.eye;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else {
      drawSprite(ENEMY_SPRITE, e.x, e.y, 4);
    }
    // hp bar
    if (e.hp < e.maxHp) {
      const barW = e.type === 'brute' ? 50 : 30;
      ctx.fillStyle = '#1a0f0f';
      ctx.fillRect(e.x - barW/2, e.y - e.r - 10, barW, 4);
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(e.x - barW/2, e.y - e.r - 10, barW * (e.hp/e.maxHp), 4);
    }
  }

  // flamethrower cone
  for (const w of playerWeapons) {
    if (w.type === 'cone' && w.firing) {
      const facingAngle = Math.atan2(player.lastMoveDir.y, player.lastMoveDir.x);
      const halfCone = w.coneAngle / 2;
      const flicker = 0.7 + Math.random() * 0.3;
      ctx.globalAlpha = 0.55 * flicker;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, w.range, facingAngle - halfCone, facingAngle + halfCone);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // player (flicker if invulnerable)
  if (!(player.invuln > 0 && Math.floor(gameTime * 20) % 2 === 0)) {
    const angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    const flip = Math.cos(angle) < 0;
    drawSprite(player.sprite, player.x, player.y, 4, flip);
  }

  // aim indicator line
  ctx.strokeStyle = 'rgba(154, 92, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(mouseWorld.x, mouseWorld.y);
  ctx.stroke();

  ctx.restore();
}

// ---------------- Pause Menu ----------------
function togglePause() {
  if (!gameRunning) return; // no effect on main menu
  // don't allow pausing while a level-up choice or game-over is showing
  if (document.getElementById('levelUp').style.display === 'block') return;
  if (document.getElementById('gameOver').style.display === 'block') return;

  if (gamePaused) {
    // resume
    gamePaused = false;
    document.getElementById('pauseMenu').style.display = 'none';
    lastTime = performance.now();
    requestAnimationFrame(loop);
  } else {
    // pause
    gamePaused = true;
    renderPauseStats();
    document.getElementById('pauseMenu').style.display = 'block';
  }
}

function renderPauseStats() {
  const div = document.getElementById('pauseStats');
  let weaponLines = '';
  for (const w of playerWeapons) {
    if (w.type === 'projectile') {
      weaponLines += `
        <div class="stat">${w.name} (Lv ${w.level}${w.level >= WEAPON_LEVEL_CAP ? ' MAX' : ''})</div>
        <div class="stat">&nbsp;&nbsp;Damage: ${w.damage} &nbsp; Fire Rate: ${w.fireRate.toFixed(2)}s</div>
        <div class="stat">&nbsp;&nbsp;Multishot: ${w.multiShot} &nbsp; Pierce: ${w.pierce} &nbsp; Ricochet: ${w.ricochet}</div>
      `;
    } else if (w.type === 'cone') {
      weaponLines += `
        <div class="stat">${w.name} (Lv ${w.level}${w.level >= WEAPON_LEVEL_CAP ? ' MAX' : ''})</div>
        <div class="stat">&nbsp;&nbsp;Active: ${w.activeTime.toFixed(2)}s &nbsp; Cooldown: ${w.cooldown.toFixed(2)}s</div>
        <div class="stat">&nbsp;&nbsp;Range: ${Math.round(w.range)} &nbsp; Burn Chance: ${Math.round(w.burnChance * 100)}%</div>
      `;
    }
  }
  div.innerHTML = `
    <div class="stat">Character: ${CHARACTERS[player.characterId].name}</div>
    <div class="stat">Level: ${player.level}</div>
    <div class="stat">Souls: ${score}</div>
    <div class="stat">Depth: ${wave}</div>
    <div class="stat">Move Speed: ${Math.round(player.speed)} &nbsp; Regen: ${player.regen}/s</div>
    ${weaponLines}
  `;
}

// ---------------- Main Menu / Character Select ----------------
function renderCharSelect() {
  const div = document.getElementById('charSelect');
  div.innerHTML = '';
  for (const charId in CHARACTERS) {
    const c = CHARACTERS[charId];
    const card = document.createElement('div');
    card.className = 'charCard' + (charId === selectedCharacterId ? ' selected' : '');
    card.innerHTML = `
      <div class="charName">${c.name}</div>
      <div class="charWeapon">${WEAPONS[c.weaponId].name}</div>
      <div class="charDesc">${c.desc}</div>
    `;
    card.addEventListener('click', () => {
      selectedCharacterId = charId;
      renderCharSelect();
    });
    div.appendChild(card);
  }
}

// ---------------- Game Loop ----------------
let lastTime = 0;
function loop(timestamp) {
  if (!gameRunning || gamePaused) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05) || 0;
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ---------------- Start / Reset / End ----------------
function startGame() {
  const character = CHARACTERS[selectedCharacterId];

  player.characterId = character.id;
  player.sprite = character.sprite;
  player.x = WORLD_W/2; player.y = WORLD_H/2;
  player.speed = character.baseStats.speed;
  player.maxHp = character.baseStats.maxHp;
  player.hp = player.maxHp;
  player.invuln = 0;
  player.regen = 0;
  player.regenAccum = 0;
  player.level = 1;
  player.xp = 0;
  player.xpToNext = 20;

  playerWeapons = [createWeaponInstance(character.weaponId)];

  bullets = []; enemyBullets = []; enemies = []; particles = []; xpOrbs = [];
  score = 0; wave = 1; waveTimer = 0; spawnTimer = 0; gameTime = 0;
  nextScheduledWaveIndex = 0;
  recurringWaveTimer = 5;
  nextBruteWaveIndex = 0;
  recurringBruteWaveTimer = 60;
  gamePaused = false;

  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('levelUp').style.display = 'none';
  document.getElementById('pauseMenu').style.display = 'none';
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  gameRunning = false;
  gamePaused = false;
  document.getElementById('finalScore').textContent = `Souls collected: ${score}`;
  document.getElementById('gameOver').style.display = 'block';
}

function quitToMenu() {
  gameRunning = false;
  gamePaused = false;
  document.getElementById('pauseMenu').style.display = 'none';
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('levelUp').style.display = 'none';
  document.getElementById('mainMenu').style.display = 'block';
  drawBackground();
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('quitBtn').addEventListener('click', quitToMenu);

// initial setup
renderCharSelect();
drawBackground();
