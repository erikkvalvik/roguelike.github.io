// ===================== ASHEN HOLLOW =====================
// Minimal bullet-hell roguelike prototype
// Pixel art drawn procedurally on canvas - no external assets needed

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width, H = canvas.height;

// ---------------- Input ----------------
const keys = {};
const mouse = { x: W/2, y: H/2, down: false };

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
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

// Player sprite: a hooded wanderer (8x8 grid)
const PLAYER_SPRITE = [
  [0,0,0,'#3a2a4a','#3a2a4a',0,0,0],
  [0,0,'#3a2a4a','#3a2a4a','#3a2a4a','#3a2a4a',0,0],
  [0,0,'#2a1a3a',PAL.eye,PAL.eye,'#2a1a3a',0,0],
  [0,'#3a2a4a','#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a','#3a2a4a',0],
  [0,'#3a2a4a','#5a3a6a','#5a3a6a','#5a3a6a','#5a3a6a','#3a2a4a',0],
  [0,0,'#3a2a4a','#5a3a6a','#5a3a6a','#3a2a4a',0,0],
  [0,0,'#2a1a3a',0,0,'#2a1a3a',0,0],
  [0,'#1a0f2a',0,0,0,0,'#1a0f2a',0],
];

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

// ---------------- Background ----------------
function drawBackground() {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  // subtle grid of cracked stone tiles
  const tile = 64;
  ctx.strokeStyle = PAL.bgGrid;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += tile) {
    for (let y = 0; y < H; y += tile) {
      ctx.strokeRect(x, y, tile, tile);
    }
  }
  // vignette
  const grad = ctx.createRadialGradient(W/2, H/2, H/3, W/2, H/2, H/0.9);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ---------------- Entities ----------------
const player = {
  x: W/2, y: H/2, r: 14,
  speed: 220,
  hp: 100, maxHp: 100,
  fireRate: 0.16, // seconds between shots
  fireCooldown: 0,
  invuln: 0,
  damage: 14,
};

let bullets = [];      // player bullets
let enemyBullets = [];  // enemy bullets
let enemies = [];
let particles = [];

let score = 0;
let wave = 1;
let waveTimer = 0;
let spawnTimer = 0;
let gameRunning = false;
let gameTime = 0;

// ---------------- Spawning ----------------
function spawnEnemy() {
  const edge = Math.floor(rand(0, 4));
  let x, y;
  const margin = 40;
  if (edge === 0) { x = rand(0, W); y = -margin; }
  else if (edge === 1) { x = rand(0, W); y = H + margin; }
  else if (edge === 2) { x = -margin; y = rand(0, H); }
  else { x = W + margin; y = rand(0, H); }

  const baseHp = 30 + wave * 6;
  enemies.push({
    x, y, r: 16,
    hp: baseHp, maxHp: baseHp,
    speed: rand(40, 70) + wave * 2,
    fireCooldown: rand(0.5, 2),
    fireRate: clamp(2.2 - wave * 0.12, 0.6, 2.2),
    wobble: rand(0, Math.PI * 2),
  });
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
  player.x = clamp(player.x, player.r, W - player.r);
  player.y = clamp(player.y, player.r, H - player.r);

  if (player.invuln > 0) player.invuln -= dt;

  // ---- Player firing ----
  player.fireCooldown -= dt;
  if (mouse.down && player.fireCooldown <= 0) {
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    bullets.push({
      x: player.x + Math.cos(angle) * 18,
      y: player.y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * 520,
      vy: Math.sin(angle) * 520,
      r: 4,
      life: 1.5,
    });
    player.fireCooldown = player.fireRate;
  }

  // ---- Player bullets ----
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) {
      bullets.splice(i, 1);
      continue;
    }
    // check collision with enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (dist(b, e) < b.r + e.r) {
        e.hp -= player.damage;
        spawnParticles(b.x, b.y, PAL.blood, 4);
        bullets.splice(i, 1);
        if (e.hp <= 0) {
          spawnParticles(e.x, e.y, PAL.bone, 14);
          score += 10 + wave;
          enemies.splice(j, 1);
        }
        break;
      }
    }
  }

  // ---- Enemy AI ----
  spawnTimer -= dt;
  const spawnInterval = clamp(2.2 - wave * 0.15, 0.5, 2.2);
  if (spawnTimer <= 0 && enemies.length < 6 + wave) {
    spawnEnemy();
    spawnTimer = spawnInterval;
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.wobble += dt * 4;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    const wob = Math.sin(e.wobble) * 0.4;
    e.x += Math.cos(angle + wob) * e.speed * dt;
    e.y += Math.sin(angle + wob) * e.speed * dt;

    // enemy firing
    e.fireCooldown -= dt;
    if (e.fireCooldown <= 0) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      enemyBullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 220,
        vy: Math.sin(a) * 220,
        r: 5,
        life: 4,
      });
      e.fireCooldown = e.fireRate;
    }

    // collision with player (contact damage)
    if (dist(e, player) < e.r + player.r && player.invuln <= 0) {
      player.hp -= 10;
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
    if (b.life <= 0 || b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) {
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
}

// ---------------- Draw ----------------
function draw() {
  drawBackground();

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
    ctx.fillStyle = PAL.glowPurple;
    ctx.shadowColor = PAL.glowPurple;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
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
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const flip = Math.cos(angle) < 0;
    drawSprite(PLAYER_SPRITE, player.x, player.y, 4, flip);
  }

  // aim indicator line
  ctx.strokeStyle = 'rgba(154, 92, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(mouse.x, mouse.y);
  ctx.stroke();
}

// ---------------- Game Loop ----------------
let lastTime = 0;
function loop(timestamp) {
  if (!gameRunning) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05) || 0;
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ---------------- Start / Reset / End ----------------
function startGame() {
  player.x = W/2; player.y = H/2;
  player.hp = player.maxHp;
  player.invuln = 0;
  player.fireCooldown = 0;
  bullets = []; enemyBullets = []; enemies = []; particles = [];
  score = 0; wave = 1; waveTimer = 0; spawnTimer = 0; gameTime = 0;

  document.getElementById('title').style.display = 'none';
  document.getElementById('gameOver').style.display = 'none';
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  gameRunning = false;
  document.getElementById('finalScore').textContent = `Souls collected: ${score}`;
  document.getElementById('gameOver').style.display = 'block';
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

// initial render of background behind menu
drawBackground();
