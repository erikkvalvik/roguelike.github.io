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

// ---------------- Weapon Definitions ----------------
// Each weapon defines base stats, a fire function, and its own upgrade pool.
const WEAPONS = {
  revolver: {
    id: 'revolver',
    name: 'Revolver',
    baseDamage: 18,
    baseFireRate: 0.45, // seconds between shots
    projectileSpeed: 620,
    projectileColor: PAL.glowPurple,
    projectileR: 4,
    pierce: 0,
    multiShot: 1,
    spreadAngle: 0.16,
    // weapon-specific upgrade pool (added in a future iteration)
    upgrades: [],
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
};

// active weapon runtime state (stats can be modified by upgrades)
let weapon = {
  id: 'revolver',
  name: 'Revolver',
  damage: 18,
  fireRate: 0.45,
  fireCooldown: 0,
  projectileSpeed: 620,
  projectileColor: PAL.glowPurple,
  projectileR: 4,
  pierce: 0,
  multiShot: 1,
  spreadAngle: 0.16,
};

function initWeaponFromDef(weaponId) {
  const def = WEAPONS[weaponId];
  weapon = {
    id: def.id,
    name: def.name,
    damage: def.baseDamage,
    fireRate: def.baseFireRate,
    fireCooldown: 0,
    projectileSpeed: def.projectileSpeed,
    projectileColor: def.projectileColor,
    projectileR: def.projectileR,
    pierce: def.pierce,
    multiShot: def.multiShot,
    spreadAngle: def.spreadAngle,
  };
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

// ---------------- Spawning ----------------
function spawnEnemy() {
  // spawn just outside the camera view, within world bounds
  const edge = Math.floor(rand(0, 4));
  let x, y;
  const margin = 60;
  if (edge === 0) { x = rand(camera.x, camera.x + W); y = camera.y - margin; }
  else if (edge === 1) { x = rand(camera.x, camera.x + W); y = camera.y + H + margin; }
  else if (edge === 2) { x = camera.x - margin; y = rand(camera.y, camera.y + H); }
  else { x = camera.x + W + margin; y = rand(camera.y, camera.y + H); }

  x = clamp(x, 20, WORLD_W - 20);
  y = clamp(y, 20, WORLD_H - 20);

  const baseHp = 30 + wave * 6;
  enemies.push({
    x, y, r: 16,
    hp: baseHp, maxHp: baseHp,
    speed: rand(40, 70) + wave * 2,
    contactDamage: 10,
    wobble: rand(0, Math.PI * 2),
  });
}

function spawnEnemyWave(count) {
  for (let i = 0; i < count; i++) {
    spawnEnemy();
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
// Revolver upgrades will be added in a future iteration.
const WEAPON_UPGRADE_POOLS = {
  revolver: [
    {
      id: 'damage',
      name: 'Wraith Edge',
      desc: 'Shots deal +6 damage',
      apply: () => { weapon.damage += 6; },
    },
    {
      id: 'firerate',
      name: 'Frenzied Hand',
      desc: 'Fire rate +18% faster',
      apply: () => { weapon.fireRate = Math.max(0.05, weapon.fireRate * 0.82); },
    },
    {
      id: 'multishot',
      name: 'Cursed Volley',
      desc: '+1 projectile per shot',
      apply: () => { weapon.multiShot += 1; },
    },
    {
      id: 'pierce',
      name: 'Soul Piercer',
      desc: 'Bullets pierce +1 enemy',
      apply: () => { weapon.pierce += 1; },
    },
  ],
};

// pick `count` unique random upgrades from the combined general + active weapon pools
function rollUpgrades(count) {
  const weaponPool = (WEAPON_UPGRADE_POOLS[weapon.id] || []).map(u => ({
    ...u,
    displayName: `${u.name} (${weapon.name})`,
  }));
  const generalPool = GENERAL_UPGRADE_POOL.map(u => ({
    ...u,
    displayName: u.name,
  }));
  const pool = [...generalPool, ...weaponPool];
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand(0, pool.length));
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

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
      choice.apply();
      overlay.style.display = 'none';
      gamePaused = false;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    });
    optionsDiv.appendChild(btn);
  }
  overlay.style.display = 'block';
}

// ---------------- Update ----------------
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

  // ---- Player firing ----
  weapon.fireCooldown -= dt;
  if (mouse.down && weapon.fireCooldown <= 0) {
    const baseAngle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    const n = weapon.multiShot;
    const spread = weapon.spreadAngle;
    const startOffset = -((n - 1) / 2) * spread;
    for (let i = 0; i < n; i++) {
      const angle = baseAngle + startOffset + i * spread;
      bullets.push({
        x: player.x + Math.cos(angle) * 18,
        y: player.y + Math.sin(angle) * 18,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        r: weapon.projectileR,
        color: weapon.projectileColor,
        life: 1.5,
        pierceLeft: weapon.pierce,
        hitSet: new Set(),
      });
    }
    weapon.fireCooldown = weapon.fireRate;
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
      e.hp -= weapon.damage;
      spawnParticles(b.x, b.y, PAL.blood, 4);
      b.hitSet.add(e);
      if (e.hp <= 0) {
        spawnParticles(e.x, e.y, PAL.bone, 14);
        score += 10 + wave;
        spawnXpOrb(e.x, e.y, 8 + wave);
        enemies.splice(j, 1);
      }
      if (b.pierceLeft > 0) {
        b.pierceLeft -= 1;
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

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.wobble += dt * 4;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    const wob = Math.sin(e.wobble) * 0.4;
    e.x += Math.cos(angle + wob) * e.speed * dt;
    e.y += Math.sin(angle + wob) * e.speed * dt;

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
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > WORLD_W+20 || b.y < -20 || b.y > WORLD_H+20) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (dist(b, player) < b.r + player.r && player.invuln <= 0) {
      player.hp -= 8;
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
    drawSprite(ENEMY_SPRITE, e.x, e.y, 4);
    // hp bar
    if (e.hp < e.maxHp) {
      const barW = 30;
      ctx.fillStyle = '#1a0f0f';
      ctx.fillRect(e.x - barW/2, e.y - e.r - 10, barW, 4);
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(e.x - barW/2, e.y - e.r - 10, barW * (e.hp/e.maxHp), 4);
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
  div.innerHTML = `
    <div class="stat">Character: ${CHARACTERS[player.characterId].name}</div>
    <div class="stat">Weapon: ${weapon.name}</div>
    <div class="stat">Level: ${player.level}</div>
    <div class="stat">Souls: ${score}</div>
    <div class="stat">Depth: ${wave}</div>
    <div class="stat">Damage: ${weapon.damage} &nbsp; Fire Rate: ${weapon.fireRate.toFixed(2)}s</div>
    <div class="stat">Move Speed: ${Math.round(player.speed)} &nbsp; Regen: ${player.regen}/s</div>
    <div class="stat">Multishot: ${weapon.multiShot} &nbsp; Pierce: ${weapon.pierce}</div>
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

  initWeaponFromDef(character.weaponId);

  bullets = []; enemyBullets = []; enemies = []; particles = []; xpOrbs = [];
  score = 0; wave = 1; waveTimer = 0; spawnTimer = 0; gameTime = 0;
  nextScheduledWaveIndex = 0;
  recurringWaveTimer = 5;
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
