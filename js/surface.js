/* =========================================================================
   SURFACE MODE — "walk on the planet" mode: local first-person 3D terrain,
   with procedural relief, rocks, sky, and atmospheric fog.
   Also used internally by the Guided Mission (each chapter = one landing).
   Depends on: utils.js, scene.js (glowTexture).
   ========================================================================= */

const SURFACE_SIZE = 220;
const SURFACE_EYE_HEIGHT = 1.8;
const SURFACE_MOVE_SPEED = 9;

let surfaceScene, surfaceCamera;
let surfaceTerrainMesh = null, surfaceSkyMesh = null, surfaceRocksGroup = null, surfaceSunSprite = null;
let surfaceInitialized = false;
let currentSurfaceSeed = 1;

let surfacePos = new THREE.Vector3(0, 0, 0);
let surfaceYaw = Math.PI;
let surfacePitch = -0.06;
let keysDown = {};
let surfaceDrag = { active:false, lastX:0, lastY:0 };
let lastSurfaceTime = performance.now();

let storyTargetMesh = null;
let storyTargetGlow = null;
let storyTargetCollected = false;

/* -------------------- Terrain height generation (deterministic) -------------------- */
function terrainHeight(x, z, seed){
  const dist = Math.sqrt(x*x + z*z);
  const falloff = Math.min(1, Math.max(0, (dist - 10) / 40));
  const n1 = fractalNoise(x + seed*131, z + seed*197, 5, 22, seed);
  const n2 = fractalNoise(x*0.3 + seed*71, z*0.3 + seed*29, 3, 46, seed+17);
  const h = (n1 - 0.5) * 7 + (n2 - 0.5) * 3;
  return h * falloff;
}

/* -------------------- Ground color texture (close-up) -------------------- */
function buildSurfaceColorTexture(seed){
  const w = 512, h = 512;
  const noise = generateWarpedNoiseCanvas(w, h, seed + 500);
  const base = colorizeMarsNoise(noise);
  const { c, ctx } = makeCanvas(w, h);
  ctx.drawImage(base, 0, 0);
  for (let i=0; i<2500; i++){
    const x = Math.random()*w, y = Math.random()*h, r = Math.random()*2+0.4;
    ctx.beginPath();
    ctx.fillStyle = Math.random()>0.5 ? 'rgba(40,25,18,0.5)' : 'rgba(205,170,135,0.35)';
    ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* -------------------- Terrain mesh -------------------- */
function buildSurfaceTerrain(seed){
  const segs = 110;
  const geo = new THREE.PlaneGeometry(SURFACE_SIZE, SURFACE_SIZE, segs, segs);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position;
  for (let i=0; i<pos.count; i++){
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z, seed));
  }
  geo.computeVertexNormals();

  const tex = buildSurfaceColorTexture(seed);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);

  const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 1 });
  return new THREE.Mesh(geo, mat);
}

/* -------------------- Scattered rocks -------------------- */
function scatterRocks(sc, seed, count){
  const group = new THREE.Group();
  let rngSeed = seed*999 + 13;
  function rnd(){ rngSeed = (rngSeed*9301+49297) % 233280; return rngSeed/233280; }

  for (let i=0; i<count; i++){
    const ang = rnd()*Math.PI*2;
    const dist = 12 + rnd()*Math.min(SURFACE_SIZE/2-6, 95);
    const x = Math.cos(ang)*dist, z = Math.sin(ang)*dist;
    const y = terrainHeight(x, z, seed);

    const geo = new THREE.IcosahedronGeometry(0.4 + rnd()*1.6, 0);
    const tone = 0.22 + rnd()*0.12;
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color().setHSL(0.05 + rnd()*0.03, 0.35 + rnd()*0.15, tone),
      shininess: 1
    });
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(x, y + 0.25, z);
    rock.rotation.set(rnd()*Math.PI, rnd()*Math.PI, rnd()*Math.PI);
    rock.scale.set(1 + rnd()*0.6, 0.6 + rnd()*0.6, 1 + rnd()*0.6);
    group.add(rock);
  }
  sc.add(group);
  return group;
}

/* -------------------- Dome sky with gradient -------------------- */
function buildSurfaceSky(){
  const { c, ctx } = makeCanvas(4, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#c9834f');
  grad.addColorStop(0.55, '#e3ab78');
  grad.addColorStop(1, '#f3d2ab');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 256);

  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.SphereGeometry(300, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

/* -------------------- Setup / building the surface world -------------------- */
function ensureSurfaceSceneInit(){
  if (surfaceInitialized) return;
  surfaceScene = new THREE.Scene();
  surfaceCamera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 500);

  surfaceScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff2df, 1.0);
  sun.position.set(60, 80, 40);
  surfaceScene.add(sun);

  surfaceInitialized = true;
}

function buildSurfaceWorld(seed){
  if (surfaceTerrainMesh) surfaceScene.remove(surfaceTerrainMesh);
  if (surfaceSkyMesh) surfaceScene.remove(surfaceSkyMesh);
  if (surfaceRocksGroup) surfaceScene.remove(surfaceRocksGroup);
  if (surfaceSunSprite) surfaceScene.remove(surfaceSunSprite);

  currentSurfaceSeed = seed;

  surfaceTerrainMesh = buildSurfaceTerrain(seed);
  surfaceScene.add(surfaceTerrainMesh);

  surfaceSkyMesh = buildSurfaceSky();
  surfaceScene.add(surfaceSkyMesh);

  surfaceScene.fog = new THREE.Fog(0xe3ab78, 45, 210);

  surfaceRocksGroup = scatterRocks(surfaceScene, seed, 160);

  surfaceSunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xfff3d6, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  surfaceSunSprite.scale.set(40, 40, 1);
  surfaceSunSprite.position.set(90, 130, -140);
  surfaceScene.add(surfaceSunSprite);

  surfacePos.set(0, 0, 0);
  surfaceYaw = Math.PI;
  surfacePitch = -0.06;
}

/* -------------------- Guided mission scientific beacon -------------------- */
function spawnStoryTarget(seed){
  if (storyTargetMesh){ surfaceScene.remove(storyTargetMesh); storyTargetMesh.geometry.dispose(); storyTargetMesh.material.dispose(); storyTargetMesh = null; }
  if (storyTargetGlow){ surfaceScene.remove(storyTargetGlow); storyTargetGlow = null; }

  let s = seed*7919 + 101;
  function rnd(){ s = (s*9301+49297)%233280; return s/233280; }
  const ang = rnd()*Math.PI*2;
  const dist = 16 + rnd()*20;
  const x = Math.cos(ang)*dist;
  const z = Math.sin(ang)*dist;
  const y = terrainHeight(x, z, seed);

  const geo = new THREE.OctahedronGeometry(0.9, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  storyTargetMesh = new THREE.Mesh(geo, mat);
  storyTargetMesh.position.set(x, y + 1.3, z);
  surfaceScene.add(storyTargetMesh);

  storyTargetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffcc33, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite:false, opacity:0.75
  }));
  storyTargetGlow.scale.set(6,6,1);
  storyTargetGlow.position.set(x, y + 1.5, z);
  surfaceScene.add(storyTargetGlow);

  storyTargetCollected = false;
}

function updateStoryTargetCheck(){
  if (appState !== 'story' || !storyTargetMesh) return;
  const dx = surfacePos.x - storyTargetMesh.position.x;
  const dz = surfacePos.z - storyTargetMesh.position.z;
  const dist = Math.sqrt(dx*dx + dz*dz);

  storyTargetMesh.rotation.y += 0.02;
  if (storyTargetGlow) storyTargetGlow.material.opacity = 0.55 + Math.sin(performance.now()*0.004)*0.2;

  const distEl = document.getElementById('story-target-distance');
  if (distEl) distEl.textContent = Math.max(0, Math.round(dist)) + ' m';

  if (dist < 3 && !storyTargetCollected){
    storyTargetCollected = true;
    const statusEl = document.getElementById('story-target-status');
    const infoEl = document.getElementById('story-target-info');
    if (statusEl) statusEl.textContent = '✅ Sample collected successfully!';
    if (infoEl) infoEl.classList.add('collected');
    addLog('🧪 Scientific sample collected on the surface.');
  }
}

/* -------------------- Surface movement / camera -------------------- */
function updateSurfaceMovement(dt){
  const forward = new THREE.Vector3(Math.sin(surfaceYaw), 0, Math.cos(surfaceYaw));
  const right = new THREE.Vector3(Math.sin(surfaceYaw + Math.PI/2), 0, Math.cos(surfaceYaw + Math.PI/2));
  const move = new THREE.Vector3();

  if (keysDown['KeyW'] || keysDown['ArrowUp']) move.add(forward);
  if (keysDown['KeyS'] || keysDown['ArrowDown']) move.sub(forward);
  if (keysDown['KeyA'] || keysDown['ArrowLeft']) move.sub(right);
  if (keysDown['KeyD'] || keysDown['ArrowRight']) move.add(right);

  if (move.lengthSq() > 0){
    move.normalize().multiplyScalar(SURFACE_MOVE_SPEED * dt);
    surfacePos.x += move.x;
    surfacePos.z += move.z;
    const half = SURFACE_SIZE/2 - 4;
    surfacePos.x = Math.max(-half, Math.min(half, surfacePos.x));
    surfacePos.z = Math.max(-half, Math.min(half, surfacePos.z));
  }

  const groundY = terrainHeight(surfacePos.x, surfacePos.z, currentSurfaceSeed);
  surfaceCamera.position.set(surfacePos.x, groundY + SURFACE_EYE_HEIGHT, surfacePos.z);

  const dir = new THREE.Vector3(
    Math.sin(surfaceYaw) * Math.cos(surfacePitch),
    Math.sin(surfacePitch),
    Math.cos(surfaceYaw) * Math.cos(surfacePitch)
  );
  surfaceCamera.lookAt(surfaceCamera.position.clone().add(dir));
}

function renderSurfaceFrame(){
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastSurfaceTime)/1000);
  lastSurfaceTime = now;
  if (!missionComplete) updateSurfaceMovement(dt);
  updateStoryTargetCheck();
  renderer.render(surfaceScene, surfaceCamera);
}

/* -------------------- Controls (keyboard, mouse/touch, buttons) -------------------- */
function bindHoldButton(id, code){
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e)=>{ e.preventDefault(); keysDown[code]=true; };
  const up = ()=>{ keysDown[code]=false; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

function attachSurfaceControls(){
  window.addEventListener('keydown', (e)=>{
    if ((appState !== 'surface' && appState !== 'story') || missionComplete) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
    keysDown[e.code] = true;
  });
  window.addEventListener('keyup', (e)=>{ keysDown[e.code] = false; });

  const canvas = document.getElementById('mars-canvas');
  canvas.addEventListener('pointerdown', (e)=>{
    if (appState !== 'surface' && appState !== 'story') return;
    surfaceDrag.active = true;
    surfaceDrag.lastX = e.clientX;
    surfaceDrag.lastY = e.clientY;
  });
  window.addEventListener('pointermove', (e)=>{
    if ((appState !== 'surface' && appState !== 'story') || !surfaceDrag.active) return;
    const dx = e.clientX - surfaceDrag.lastX;
    const dy = e.clientY - surfaceDrag.lastY;
    surfaceDrag.lastX = e.clientX; surfaceDrag.lastY = e.clientY;
    surfaceYaw -= dx * 0.0045;
    surfacePitch -= dy * 0.0035;
    surfacePitch = Math.max(-1.2, Math.min(1.2, surfacePitch));
  });
  window.addEventListener('pointerup', ()=>{ surfaceDrag.active = false; });

  bindHoldButton('surf-btn-forward', 'KeyW');
  bindHoldButton('surf-btn-back', 'KeyS');
  bindHoldButton('surf-btn-left', 'KeyA');
  bindHoldButton('surf-btn-right', 'KeyD');
}

/* -------------------- Free surface mode entry/exit helpers -------------------- */
function seedFromLatLon(lat, lon){
  return Math.abs(Math.round((lat*1000) + (lon*731))) % 100000 + 1;
}

let previousAppStateBeforeSurface = 'dashboard';

function setAppStateSurfaceUI(active, label){
  const hud = document.getElementById('surface-hud');
  if (!hud) return;
  if (active){
    ['app-header','layers-panel','right-panel','telemetry','mission-log','story-panel','story-progress-wrap']
      .forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const labelEl = document.getElementById('surface-location-label');
    if (labelEl) labelEl.textContent = label || 'Martian Surface';
    hud.style.display = 'block';
    lastSurfaceTime = performance.now();
  } else {
    hud.style.display = 'none';
  }
}

function enterSurfaceMode(opts){
  opts = opts || {};
  if (focusState.id) unfocusPoi();
  ensureSurfaceSceneInit();
  const seed = opts.seed || Math.floor(Math.random()*10000)+1;
  buildSurfaceWorld(seed);
  previousAppStateBeforeSurface = appState === 'surface' ? previousAppStateBeforeSurface : appState;
  setAppStateSurfaceUI(true, opts.label);
  if (controls) controls.enabled = false;
  appState = 'surface';
  addLog(`🚶 Surface mode activated: ${opts.label || 'random location'}`);
}

function exitSurfaceMode(){
  const restoreState = previousAppStateBeforeSurface || 'dashboard';
  setAppStateSurfaceUI(false);
  keysDown = {};
  surfaceDrag.active = false;
  setAppState(restoreState);
  if (controls) controls.enabled = true;
}