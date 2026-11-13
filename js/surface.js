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
let surfaceLanderMesh = null, gltfLoaderInstance = null;
let surfaceRocksData = [];
let martianRockMaterialsCache = null;
let surfaceInitialized = false;
let currentSurfaceSeed = 1;

let surfacePos = new THREE.Vector3(0, 0, 0);
let surfaceYaw = Math.PI;
let surfacePitch = -0.06;
let keysDown = {};
let playerJumpOffset = 0;
let playerVelocityY = 0;
let playerIsGrounded = true;
const MARS_GRAVITY = 10.5;
const JUMP_VELOCITY = 5.4;
const LANDER_POS = { x: 0, z: 2.8 };
let surfaceDrag = { active:false, lastX:0, lastY:0 };
let lastSurfaceTime = performance.now();

let isHoveringLander = false;
const landerRaycaster = new THREE.Raycaster();
const screenCenterNDC = new THREE.Vector2(0, 0);
const mouseNDC = new THREE.Vector2(0, 0);
let mouseMovedOnScreen = false;

let storyTargetMesh = null;
let storyTargetGlow = null;
let storyTargetCollected = false;

/* -------------------- Terrain height generation (deterministic) -------------------- */
function terrainHeight(x, z, seed){
  const dist = Math.sqrt(x*x + z*z);
  const falloff = Math.min(1, Math.max(0, (dist - 14) / 40));
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

/* -------------------- Martian rock materials & textures -------------------- */
function buildMartianRockMaterials(){
  if (martianRockMaterialsCache) return martianRockMaterialsCache;

  const w = 512, h = 512;
  const { c: colCanvas, ctx: colCtx } = makeCanvas(w, h);
  const colImg = colCtx.createImageData(w, h);

  const { c: bumpCanvas, ctx: bumpCtx } = makeCanvas(w, h);
  const bumpImg = bumpCtx.createImageData(w, h);

  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const n1 = fractalNoise(x, y, 5, 45, 911);
      const n2 = fractalNoise(x * 2.2, y * 2.2, 3, 20, 433);
      const combined = n1 * 0.7 + n2 * 0.3;

      let r, g, b, bumpVal;

      if (combined < 0.38){
        const t = combined / 0.38;
        r = lerp(34, 66, t);
        g = lerp(22, 42, t);
        b = lerp(18, 30, t);
        bumpVal = Math.floor(combined * 180);
      } else if (combined < 0.72){
        const t = (combined - 0.38) / 0.34;
        r = lerp(66, 178, t);
        g = lerp(42, 86, t);
        b = lerp(30, 52, t);
        bumpVal = Math.floor(combined * 220);
      } else {
        const t = (combined - 0.72) / 0.28;
        r = lerp(178, 218, t);
        g = lerp(86, 142, t);
        b = lerp(52, 96, t);
        bumpVal = Math.floor(combined * 255);
      }

      const micro = (hashNoise(x, y, 77) - 0.5) * 32;
      const finalBump = Math.max(0, Math.min(255, bumpVal + micro));

      const idx = (y * w + x) * 4;
      colImg.data[idx]   = Math.max(0, Math.min(255, Math.round(r + micro * 0.4)));
      colImg.data[idx+1] = Math.max(0, Math.min(255, Math.round(g + micro * 0.3)));
      colImg.data[idx+2] = Math.max(0, Math.min(255, Math.round(b + micro * 0.2)));
      colImg.data[idx+3] = 255;

      bumpImg.data[idx]   = finalBump;
      bumpImg.data[idx+1] = finalBump;
      bumpImg.data[idx+2] = finalBump;
      bumpImg.data[idx+3] = 255;
    }
  }

  colCtx.putImageData(colImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  // Volcanic vesicles (dark cavities) & olivine / mineral dust flecks
  for (let i = 0; i < 3000; i++){
    const rx = Math.random() * w, ry = Math.random() * h;
    const rad = Math.random() * 2.2 + 0.5;
    if (Math.random() > 0.35){
      colCtx.fillStyle = 'rgba(14, 8, 5, 0.85)';
      bumpCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    } else {
      colCtx.fillStyle = 'rgba(235, 195, 155, 0.7)';
      bumpCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    }
    colCtx.beginPath(); colCtx.arc(rx, ry, rad, 0, Math.PI * 2); colCtx.fill();
    bumpCtx.beginPath(); bumpCtx.arc(rx, ry, rad, 0, Math.PI * 2); bumpCtx.fill();
  }

  // Wind-weathered surface striations
  colCtx.strokeStyle = 'rgba(215, 140, 95, 0.15)';
  colCtx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++){
    const sy = Math.random() * h;
    colCtx.beginPath();
    colCtx.moveTo(0, sy);
    colCtx.bezierCurveTo(w * 0.3, sy + (Math.random()-0.5)*15, w * 0.7, sy + (Math.random()-0.5)*15, w, sy);
    colCtx.stroke();
  }

  const colorTex = new THREE.CanvasTexture(colCanvas);
  colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.repeat.set(1.5, 1.5);
  colorTex.encoding = THREE.sRGBEncoding;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(1.5, 1.5);

  martianRockMaterialsCache = [
    new THREE.MeshStandardMaterial({
      map: colorTex, bumpMap: bumpTex, bumpScale: 0.18,
      roughness: 0.88, metalness: 0.10, color: new THREE.Color(0xd2754d)
    }),
    new THREE.MeshStandardMaterial({
      map: colorTex, bumpMap: bumpTex, bumpScale: 0.22,
      roughness: 0.92, metalness: 0.08, color: new THREE.Color(0x9e5236)
    }),
    new THREE.MeshStandardMaterial({
      map: colorTex, bumpMap: bumpTex, bumpScale: 0.15,
      roughness: 0.84, metalness: 0.12, color: new THREE.Color(0xe28e62)
    })
  ];

  return martianRockMaterialsCache;
}

/* -------------------- Scattered rocks with collision -------------------- */
function scatterRocks(sc, seed, count){
  surfaceRocksData = [];
  const group = new THREE.Group();
  let rngSeed = seed*999 + 13;
  function rnd(){ rngSeed = (rngSeed*9301+49297) % 233280; return rngSeed/233280; }

  const materials = buildMartianRockMaterials();

  for (let i=0; i<count; i++){
    const ang = rnd()*Math.PI*2;
    const dist = 7 + rnd()*Math.min(SURFACE_SIZE/2-6, 95);
    const x = Math.cos(ang)*dist, z = Math.sin(ang)*dist;

    // Completely clear rocks from astronaut spawn point and entire lander landing zone
    const distSpawn = Math.sqrt(x*x + z*z);
    const distLander = Math.hypot(x - LANDER_POS.x, z - LANDER_POS.z);
    if (distSpawn < 10.0 || distLander < 15.0) continue;

    const y = terrainHeight(x, z, seed);

    const baseRadius = 0.5 + rnd()*1.7;
    // Closed watertight sphere geometry deformed by position noise (seamless, zero gaps)
    const geo = new THREE.SphereGeometry(baseRadius, 14, 10);
    const pos = geo.attributes.position;
    for (let v=0; v<pos.count; v++){
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const len = Math.sqrt(px*px + py*py + pz*pz) || 1;
      const n = fractalNoise(px * 2.2 + seed, pz * 2.2 + seed, 3, 2.5, seed);
      const disp = 0.82 + n * 0.38;
      pos.setXYZ(v, (px/len)*baseRadius*disp, (py/len)*baseRadius*disp*0.80, (pz/len)*baseRadius*disp);
    }
    geo.computeVertexNormals();

    const mat = materials[Math.floor(rnd() * materials.length)];
    const rock = new THREE.Mesh(geo, mat);

    const scaleX = 1 + rnd()*0.6;
    const scaleY = 0.65 + rnd()*0.55;
    const scaleZ = 1 + rnd()*0.6;
    rock.scale.set(scaleX, scaleY, scaleZ);

    rock.position.set(x, y + (baseRadius * scaleY * 0.35), z);
    rock.rotation.set(rnd()*Math.PI, rnd()*Math.PI, rnd()*Math.PI);
    group.add(rock);

    // Save horizontal collision radius
    const colRadius = baseRadius * Math.max(scaleX, scaleZ) * 0.85;
    surfaceRocksData.push({ x, z, radius: colRadius });
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

  // Spawn official NASA Apollo Lunar Module at initial landing site
  spawnLander(surfaceScene, seed);

  surfacePos.set(0, 0, 0);
  surfaceYaw = Math.PI;
  surfacePitch = -0.06;
  playerJumpOffset = 0;
  playerVelocityY = 0;
  playerIsGrounded = true;
}

/* -------------------- Official NASA Lander Asset & Procedural Fallback -------------------- */
function buildProceduralApolloLunarModule(){
  const group = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xdaa520, metalness: 0.88, roughness: 0.28, emissive: 0x2a1a02
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x23272d, metalness: 0.75, roughness: 0.45
  });
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xdce1e8, metalness: 0.82, roughness: 0.32
  });

  // 1. Octagonal descent stage body (covered in gold thermal insulation foil)
  const descentBody = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 1.7, 8), goldMat);
  descentBody.position.y = 1.65;
  group.add(descentBody);

  // Engine descent bell
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.95, 0.95, 16, 1, true), darkMetal);
  bell.position.y = 0.52;
  group.add(bell);

  // 4 Landing Gear Legs & Footpads
  for (let i = 0; i < 4; i++){
    const ang = (i * Math.PI / 2) + (Math.PI / 4);
    const legGroup = new THREE.Group();

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.3, 8), darkMetal);
    strut.rotation.z = 0.58;
    strut.position.set(1.4, 0.9, 0);
    legGroup.add(strut);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.09, 12), goldMat);
    pad.position.set(2.45, 0.04, 0);
    legGroup.add(pad);

    legGroup.rotation.y = ang;
    group.add(legGroup);
  }

  // 2. Ascent stage (Crew cabin)
  const cabinMid = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.85, 1.45, 8), silverMat);
  cabinMid.position.y = 3.0;
  group.add(cabinMid);

  const cabinFront = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 1.35), silverMat);
  cabinFront.position.set(0, 2.95, 0.88);
  group.add(cabinFront);

  // EVA Egress Hatch & Ladder
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.1), darkMetal);
  hatch.position.set(0, 2.85, 1.56);
  group.add(hatch);

  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.3, 0.06), darkMetal);
  ladder.position.set(0, 1.6, 1.7);
  group.add(ladder);

  // Docking Tunnel on top
  const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.55, 12), darkMetal);
  dock.position.y = 3.95;
  group.add(dock);

  // Radar antenna
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 16, 1, true), goldMat);
  dish.rotation.x = -Math.PI / 3;
  dish.position.set(1.15, 4.2, -0.6);
  group.add(dish);

  // Base Camp Navigation Beacon Light on top
  const topLight = new THREE.PointLight(0x4fd1ff, 2.0, 35);
  topLight.position.set(0, 4.4, 0);
  group.add(topLight);

  const beaconSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0x4fd1ff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85
  }));
  beaconSprite.scale.set(4, 4, 1);
  beaconSprite.position.set(0, 4.4, 0);
  group.add(beaconSprite);

  return group;
}

function loadLanderModel(onLoad){
  if (surfaceLanderMesh){
    onLoad(surfaceLanderMesh.clone());
    return;
  }
  if (!window.THREE || !THREE.GLTFLoader){
    console.warn('GLTFLoader not available');
    return;
  }
  if (!gltfLoaderInstance) gltfLoaderInstance = new THREE.GLTFLoader();

  gltfLoaderInstance.load('assets/models/lunar_module.glb', (gltf)=>{
    const model = gltf.scene;
    model.traverse((child)=>{
      if (child.isMesh){
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetScale = 6.2 / maxDim;
    model.scale.set(targetScale, targetScale, targetScale);

    // Recompute box after scaling and align footpads exactly with ground Y=0
    box.setFromObject(model);
    model.position.y -= box.min.y;

    surfaceLanderMesh = model;
    onLoad(model.clone());
  }, undefined, (err)=>{
    console.warn('Could not load lander model from file:', err);
  });
}

function spawnLander(scene, seed){
  if (scene._currentLander){
    scene.remove(scene._currentLander);
    scene._currentLander = null;
  }

  // Lander placed directly behind the astronaut spawn point (x:0, z:2.8)
  const landerX = LANDER_POS.x;
  const landerZ = LANDER_POS.z;
  const landerY = terrainHeight(landerX, landerZ, seed);

  // Solid collision radius so astronaut can't walk back into the spacecraft
  surfaceRocksData.push({ x: landerX, z: landerZ, radius: 2.1 });

  // 1. Immediately display the detailed procedural Apollo Lunar Lander (100% visible, 0ms latency, CORS-proof)
  const procLander = buildProceduralApolloLunarModule();
  procLander.position.set(landerX, landerY, landerZ);
  procLander.rotation.y = Math.PI; // Ladder and hatch face forward towards the astronaut (-Z)
  scene.add(procLander);
  scene._currentLander = procLander;

  // 2. Seamlessly upgrade to NASA GLB asset if web server / GLTFLoader allows
  loadLanderModel((glbInstance)=>{
    if (scene._currentLander === procLander){
      scene.remove(procLander);
      glbInstance.position.set(landerX, landerY, landerZ);
      glbInstance.rotation.y = Math.PI;
      scene.add(glbInstance);
      scene._currentLander = glbInstance;
    }
  });
}

/* -------------------- Guided mission scientific beacon -------------------- */
function spawnStoryTarget(seed){
  if (storyTargetMesh){ surfaceScene.remove(storyTargetMesh); storyTargetMesh.geometry.dispose(); storyTargetMesh.material.dispose(); storyTargetMesh = null; }
  if (storyTargetGlow){ surfaceScene.remove(storyTargetGlow); storyTargetGlow = null; }

  let s = seed*7919 + 101;
  function rnd(){ s = (s*9301+49297)%233280; return s/233280; }
  // Place beacon in the forward field of view (towards -Z, where player faces upon exit)
  const ang = -Math.PI/2 + (rnd() - 0.5) * (Math.PI * 0.7);
  const dist = 18 + rnd()*18;
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

    if (typeof onObjectiveCollected === 'function'){
      onObjectiveCollected();
    }
  }
}

/* -------------------- Lander Crosshair / Cursor Hover Check -------------------- */
function checkLanderHover(){
  const promptEl = document.getElementById('lander-interact-prompt');
  if (!surfaceCamera || !surfaceScene || !surfaceScene._currentLander || (appState !== 'surface' && appState !== 'story')){
    if (promptEl) promptEl.classList.remove('visible');
    isHoveringLander = false;
    return;
  }

  // Pointer lock uses crosshair at screen center; unlocked uses mouse cursor
  const rayOriginNDC = document.pointerLockElement ? screenCenterNDC : (mouseMovedOnScreen ? mouseNDC : screenCenterNDC);
  landerRaycaster.setFromCamera(rayOriginNDC, surfaceCamera);
  const intersects = landerRaycaster.intersectObject(surfaceScene._currentLander, true);

  if (intersects.length > 0 && intersects[0].distance < 45){
    isHoveringLander = true;
    if (promptEl) promptEl.classList.add('visible');
  } else {
    isHoveringLander = false;
    if (promptEl) promptEl.classList.remove('visible');
  }
}

/* -------------------- Surface movement / camera -------------------- */
function updateSurfaceMovement(dt){
  const forward = new THREE.Vector3(Math.sin(surfaceYaw), 0, Math.cos(surfaceYaw));
  const right = new THREE.Vector3(Math.sin(surfaceYaw + Math.PI/2), 0, Math.cos(surfaceYaw + Math.PI/2));
  const move = new THREE.Vector3();

  if (keysDown['KeyW'] || keysDown['ArrowUp']) move.add(forward);
  if (keysDown['KeyS'] || keysDown['ArrowDown']) move.sub(forward);
  if (keysDown['KeyA'] || keysDown['ArrowLeft']) move.add(right);
  if (keysDown['KeyD'] || keysDown['ArrowRight']) move.sub(right);

  if (move.lengthSq() > 0){
    move.normalize().multiplyScalar(SURFACE_MOVE_SPEED * dt);

    let targetX = surfacePos.x + move.x;
    let targetZ = surfacePos.z + move.z;
    const playerRadius = 0.65; // Astronaut EVA suit collision radius

    // 2-pass circle-circle collision resolution for smooth sliding along rocks
    for (let pass = 0; pass < 2; pass++){
      for (let i = 0; i < surfaceRocksData.length; i++){
        const rock = surfaceRocksData[i];
        const dx = targetX - rock.x;
        const dz = targetZ - rock.z;
        const minDist = rock.radius + playerRadius;
        const distSq = dx*dx + dz*dz;
        if (distSq < minDist * minDist && distSq > 0.00001){
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          targetX += (dx / dist) * overlap;
          targetZ += (dz / dist) * overlap;
        }
      }
    }

    const half = SURFACE_SIZE/2 - 4;
    surfacePos.x = Math.max(-half, Math.min(half, targetX));
    surfacePos.z = Math.max(-half, Math.min(half, targetZ));
  }

  // Jump physics with Martian low gravity
  if (keysDown['Space'] && playerIsGrounded){
    playerVelocityY = JUMP_VELOCITY;
    playerIsGrounded = false;
  }
  if (!playerIsGrounded){
    playerJumpOffset += playerVelocityY * dt;
    playerVelocityY -= MARS_GRAVITY * dt;
    if (playerJumpOffset <= 0){
      playerJumpOffset = 0;
      playerVelocityY = 0;
      playerIsGrounded = true;
    }
  }

  const groundY = terrainHeight(surfacePos.x, surfacePos.z, currentSurfaceSeed);
  surfaceCamera.position.set(surfacePos.x, groundY + SURFACE_EYE_HEIGHT + playerJumpOffset, surfacePos.z);

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
  checkLanderHover();
  renderer.render(surfaceScene, surfaceCamera);
}

/* -------------------- Controls (keyboard, mouse/touch, buttons) -------------------- */
function bindHoldButton(id, code){
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e)=>{
    e.preventDefault();
    keysDown[code]=true;
    if (appState === 'story' && typeof toggleStoryCard === 'function' && !storyCardMinimized){
      toggleStoryCard(true);
    }
  };
  const up = ()=>{ keysDown[code]=false; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

function attachSurfaceControls(){
  window.addEventListener('keydown', (e)=>{
    if ((appState !== 'surface' && appState !== 'story') || missionComplete) return;

    // Press F to board lander and return to menu when aiming at it
    if ((e.code === 'KeyF' || e.key === 'f' || e.key === 'F') && isHoveringLander){
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      const promptEl = document.getElementById('lander-interact-prompt');
      if (promptEl) promptEl.classList.remove('visible');
      isHoveringLander = false;
      if (typeof goHome === 'function') goHome();
      addLog('🚀 Boarded the lander and returned to mission control.');
      return;
    }

    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) e.preventDefault();
    keysDown[e.code] = true;

    // Auto-minimize story-card on movement start (WASD or Arrow keys)
    if (appState === 'story' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){
      if (typeof toggleStoryCard === 'function' && !storyCardMinimized){
        toggleStoryCard(true);
      }
    }
  });
  window.addEventListener('keyup', (e)=>{ keysDown[e.code] = false; });

  const canvas = document.getElementById('mars-canvas');

  // Interactive prompt click fallback (works on click or touch)
  const landerPromptEl = document.getElementById('lander-interact-prompt');
  if (landerPromptEl){
    landerPromptEl.addEventListener('click', (e)=>{
      e.stopPropagation();
      if (document.pointerLockElement) document.exitPointerLock();
      landerPromptEl.classList.remove('visible');
      isHoveringLander = false;
      if (typeof goHome === 'function') goHome();
      addLog('🚀 Boarded the lander and returned to mission control.');
    });
  }

  // Track cursor coordinates for unlocked aim & raycasting
  window.addEventListener('mousemove', (e)=>{
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouseMovedOnScreen = true;
  });

  // FPS Pointer Lock: click to capture mouse
  canvas.addEventListener('click', ()=>{
    if ((appState === 'surface' || appState === 'story') && !missionComplete){
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock){
        canvas.requestPointerLock();
      }
    }
  });

  // Direct FPS mouse look (no drag required when locked)
  window.addEventListener('mousemove', (e)=>{
    if (appState !== 'surface' && appState !== 'story') return;
    if (document.pointerLockElement === canvas){
      surfaceYaw -= e.movementX * 0.0028;
      surfacePitch -= e.movementY * 0.0024;
      surfacePitch = Math.max(-1.25, Math.min(1.25, surfacePitch));
    }
  });

  // Fallback drag controls (touch or unlocked pointer)
  canvas.addEventListener('pointerdown', (e)=>{
    if (appState !== 'surface' && appState !== 'story') return;
    surfaceDrag.active = true;
    surfaceDrag.lastX = e.clientX;
    surfaceDrag.lastY = e.clientY;
  });
  window.addEventListener('pointermove', (e)=>{
    if ((appState !== 'surface' && appState !== 'story') || !surfaceDrag.active) return;
    if (document.pointerLockElement === canvas) return;
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
  if (document.pointerLockElement) document.exitPointerLock();
  const promptEl = document.getElementById('lander-interact-prompt');
  if (promptEl) promptEl.classList.remove('visible');
  isHoveringLander = false;
  playerJumpOffset = 0;
  playerVelocityY = 0;
  playerIsGrounded = true;
  const restoreState = previousAppStateBeforeSurface || 'dashboard';
  setAppStateSurfaceUI(false);
  keysDown = {};
  surfaceDrag.active = false;
  setAppState(restoreState);
  if (controls) controls.enabled = true;
}