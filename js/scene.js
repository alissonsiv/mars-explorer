/* =========================================================================
   SCENE — orbital 3D scene: planet, atmosphere, star field, POI markers,
   camera and interaction (raycast). Depends on utils.js, data.js and
   textures.js (must be loaded first).
   ========================================================================= */

let scene, camera, renderer, controls;
let marsMesh, atmosphereMesh, overlayMesh, starField;
let markerGroup;
let overlayTextures = {};
let glowTexture;
let raycaster, mouse;
let hitboxes = [];
let hoveredGroup = null, selectedGroup = null;

// Focus mode: remembers where the camera was before focusing so we can
// return exactly there when the user exits focus.
const focusState = { id:null, prevCamera:null, prevTarget:null, prevAutoRotate:true };
let cameraTween = null;

function initScene(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 5000);
  camera.position.set(10, 35, 140);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('mars-canvas'), antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 58; controls.maxDistance = 400;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  // Any manual interaction cancels an in-flight camera animation.
  controls.addEventListener('start', cancelCameraTween);

  glowTexture = generateGlowTexture();

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  starField = createStarField(); scene.add(starField);

  // Textura procedural: carrega instantaneamente e serve como base/fallback.
  const marsTexture = buildMarsTexture(2048, 1024);
  const bumpTexture = buildMarsBumpMap(1024, 512);
  marsMesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARS_RADIUS, 128, 128),
    new THREE.MeshPhongMaterial({ map: marsTexture, bumpMap: bumpTexture, bumpScale: 0.55, shininess: 1 })
  );
  scene.add(marsMesh);

  // Tenta carregar uma imagem fotográfica real por cima da procedural.
  // Se falhar por qualquer motivo, a procedural acima continua valendo.
  loadRealisticMarsTextures();

  overlayTextures = {
    elevation: generateElevationLayer(), temperature: generateTemperatureLayer(),
    radiation: generateRadiationLayer(), water: generateWaterIceLayer(),
  };
  overlayMesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARS_RADIUS*1.004, 96, 96),
    new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false })
  );
  scene.add(overlayMesh);

  atmosphereMesh = createAtmosphere();
  scene.add(atmosphereMesh);

  markerGroup = new THREE.Group(); markerGroup.visible = false; scene.add(markerGroup);
  POIS.forEach(createMarker);

  raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  animate();
}

/* =========================================================================
   REALISTIC TEXTURE LOADING — substitui a textura procedural por uma
   imagem fotográfica real (ex: mosaico de câmeras orbitais da NASA),
   assim que ela terminar de carregar. Caso falhe (arquivo ausente,
   rede lenta, etc.), mantém a procedural já aplicada — a aplicação
   nunca fica sem textura.
   ========================================================================= */
const REAL_TEXTURE_PATHS = {
  color: 'assets/textures/mars_color.jpg',
  bump:  'assets/textures/mars_bump.jpg'
};

function loadRealisticMarsTextures(){
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  loader.load(
    REAL_TEXTURE_PATHS.color,
    (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = maxAniso;
      marsMesh.material.map = tex;
      marsMesh.material.needsUpdate = true;
      logSafe('Realistic Mars surface texture loaded.');
    },
    undefined,
    (err) => {
      console.warn('[textures] Could not load realistic color texture, keeping procedural texture.', err);
    }
  );

  loader.load(
    REAL_TEXTURE_PATHS.bump,
    (tex) => {
      tex.anisotropy = maxAniso;
      marsMesh.material.bumpMap = tex;
      marsMesh.material.bumpScale = 0.9;
      marsMesh.material.needsUpdate = true;
      logSafe('Realistic elevation (bump) map loaded.');
    },
    undefined,
    (err) => {
      console.warn('[textures] Could not load realistic bump map, keeping procedural bump.', err);
    }
  );
}

function logSafe(msg){
  try { if (typeof addLog === 'function') addLog(msg); } catch(e){ /* ignore */ }
}

function createStarField(){
  const count = 5000;
  const positions = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const r = 1400 + Math.random()*1200;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos((Math.random()*2)-1);
    positions[i*3] = r*Math.sin(phi)*Math.cos(theta);
    positions[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    positions[i*3+2] = r*Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const mat = new THREE.PointsMaterial({ color:0xffffff, size:1.4, sizeAttenuation:true });
  return new THREE.Points(geo, mat);
}

function createAtmosphere(){
  const geo = new THREE.SphereGeometry(MARS_RADIUS*1.03, 64, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0xff9566) } },
    vertexShader:`
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform vec3 glowColor;
      void main(){
        vec3 viewDir = normalize(-vPosition);
        float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
        float intensity = pow(rim, 2.5);
        gl_FragColor = vec4(glowColor, intensity * 0.55);
      }`,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent:true,
    depthWrite:false
  });
  return new THREE.Mesh(geo, mat);
}

/* -------------------- Free-exploration markers -------------------- */
function createMarker(poi){
  const pos = latLonToVector3(poi.lat, poi.lon, MARS_RADIUS + 0.6);
  const color = TYPE_COLORS[poi.type];
  const group = new THREE.Group(); group.position.copy(pos);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 16), new THREE.MeshBasicMaterial({ color }));
  group.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false }));
  glow.scale.set(4.5,4.5,1); group.add(glow);
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshBasicMaterial({ visible:false }));
  group.add(hitbox);
  group.userData = { kind:'poi', poi, core, glow };
  hitbox.userData.ownerGroup = group;
  hitboxes.push(hitbox);
  markerGroup.add(group);
}

/* -------------------- Interaction / raycast (dashboard orbital mode only) -------------------- */
let downPos = {x:0,y:0};
function onPointerDown(e){
  if (appState !== 'dashboard') return;
  downPos = {x:e.clientX, y:e.clientY};
}
function onPointerUp(e){
  if (appState !== 'dashboard') return;
  const dist = Math.hypot(e.clientX-downPos.x, e.clientY-downPos.y);
  if (dist > 5) return;
  if (hoveredGroup){ handleMarkerClick(hoveredGroup); return; }
  // Click on empty space while focused = exit focus.
  if (focusState.id) unfocusPoi();
}
function onPointerMove(e){
  const tooltip = document.getElementById('tooltip');
  if (appState !== 'dashboard'){ tooltip.style.display='none'; return; }

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(hitboxes);

  if (hits.length){
    const g = hits[0].object.userData.ownerGroup;
    if (hoveredGroup !== g){
      if (hoveredGroup && hoveredGroup !== selectedGroup) resetMarkerStyle(hoveredGroup);
      hoveredGroup = g;
      if (hoveredGroup !== selectedGroup) highlightMarker(g, 1.4);
    }
    tooltip.style.display = 'block';
    tooltip.style.left = e.clientX+'px'; tooltip.style.top = e.clientY+'px';
    tooltip.textContent = `${TYPE_ICONS[g.userData.poi.type]} ${g.userData.poi.name}`;
    renderer.domElement.style.cursor = 'pointer';
  } else {
    if (hoveredGroup && hoveredGroup !== selectedGroup) resetMarkerStyle(hoveredGroup);
    hoveredGroup = null; tooltip.style.display = 'none';
    renderer.domElement.style.cursor = 'grab';
  }
}
function highlightMarker(g, scale){ g.userData.core.scale.setScalar(scale); g.userData.glow.scale.set(4.5*scale,4.5*scale,1); }
function resetMarkerStyle(g){ g.userData.core.scale.setScalar(1); g.userData.glow.scale.set(4.5,4.5,1); }
// Closer camera → the fixed-size glow sprite would cover the terrain, so
// shrink the selected marker while in focus mode.
function setFocusedMarkerStyle(g){
  g.userData.core.scale.setScalar(1.15);
  g.userData.glow.scale.set(2.2, 2.2, 1);
}

function handleMarkerClick(g){
  const poi = g.userData.poi;
  selectMarker(g);
  openInfoPanel(poi);
  switchTab('info');
  // Already in focus mode: clicking another marker moves the focus there.
  if (focusState.id && focusState.id !== poi.id) focusOnPoi(poi.id);
}
function selectMarker(g){ if (selectedGroup) resetMarkerStyle(selectedGroup); selectedGroup = g; highlightMarker(g, 1.6); }

function focusOnPoi(id){
  const g = markerGroup.children.find(c => c.userData.poi.id === id);
  if (!g) return;

  // First focus: remember the pre-focus view so unfocus can restore it.
  // If a camera animation is in flight, remember its destination instead of
  // the current mid-flight position.
  if (!focusState.id){
    if (cameraTween){
      focusState.prevCamera = cameraTween.endPos.clone();
      focusState.prevTarget = cameraTween.endTarget.clone();
      focusState.prevAutoRotate = cameraTween.restoreAutoRotate;
    } else {
      focusState.prevCamera = camera.position.clone();
      focusState.prevTarget = controls.target.clone();
      focusState.prevAutoRotate = controls.autoRotate;
    }
  }
  focusState.id = id;

  // Keep OrbitControls targeted at the planet center so orbiting stays
  // intuitive. Placing the camera on the POI normal keeps it screen-centered,
  // and the distance stays above controls.minDistance.
  const dir = g.position.clone().normalize();
  const camPos = dir.clone().multiplyScalar(MARS_RADIUS + 20);
  animateCameraTo(camPos, new THREE.Vector3(0,0,0), 1200, { autoRotate:false });

  selectMarker(g);
  if (selectedGroup === g) setFocusedMarkerStyle(g);
  updateFocusHud(g.userData.poi);
  logSafe(`🎯 Focused on ${g.userData.poi.name}`);
}

function unfocusPoi(){
  if (!focusState.id) return;

  const prevCamera = focusState.prevCamera || new THREE.Vector3(10,35,140);
  const prevTarget = focusState.prevTarget || new THREE.Vector3(0,0,0);
  const prevAutoRotate = focusState.prevAutoRotate !== false;

  focusState.id = null;
  focusState.prevCamera = null;
  focusState.prevTarget = null;

  hideFocusHud();
  if (selectedGroup){ resetMarkerStyle(selectedGroup); selectedGroup = null; }

  animateCameraTo(prevCamera, prevTarget, 900, {
    autoRotate: prevAutoRotate && appState === 'dashboard'
  });
  logSafe('🎯 Focus cleared.');
}

// Leaves focus immediately (no animation) — used when changing app state.
function clearFocus(){
  cancelCameraTween();
  focusState.id = null;
  focusState.prevCamera = null;
  focusState.prevTarget = null;
  hideFocusHud();
}

function updateFocusHud(poi){
  const hud = document.getElementById('focus-hud');
  const label = document.getElementById('focus-hud-label');
  if (!hud) return;
  if (label) label.textContent = `${TYPE_ICONS[poi.type] || '🎯'} ${poi.name}`;
  hud.classList.add('visible');
}
function hideFocusHud(){
  const hud = document.getElementById('focus-hud');
  if (hud) hud.classList.remove('visible');
}

/* -------------------- Camera -------------------- */
// Single cancellable camera tween. Starting a new one cancels the previous,
// and auto-rotate is suspended while the camera is moving.
function animateCameraTo(pos, target, duration=1200, opts={}){
  cancelCameraTween();

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const restoreAutoRotate = (opts.autoRotate !== undefined) ? opts.autoRotate : controls.autoRotate;

  controls.autoRotate = false;
  syncAutoRotateButton();

  const tween = { cancelled:false, restoreAutoRotate, endPos:pos.clone(), endTarget:target.clone() };
  cameraTween = tween;
  const t0 = performance.now();

  function finish(){
    if (cameraTween !== tween) return;
    cameraTween = null;
    controls.autoRotate = restoreAutoRotate;
    syncAutoRotateButton();
    if (typeof opts.onComplete === 'function') opts.onComplete();
  }
  function step(now){
    if (tween.cancelled) return;
    const t = Math.min((now-t0)/duration, 1);
    const e = easeInOutQuad(t);
    camera.position.lerpVectors(startPos, pos, e);
    controls.target.lerpVectors(startTarget, target, e);
    controls.update();
    if (t<1) requestAnimationFrame(step);
    else finish();
  }
  requestAnimationFrame(step);
}

function cancelCameraTween(){
  if (!cameraTween) return;
  const tween = cameraTween;
  cameraTween = null;
  tween.cancelled = true;
  controls.autoRotate = tween.restoreAutoRotate;
  syncAutoRotateButton();
}

function syncAutoRotateButton(){
  const btn = document.getElementById('btn-rotate');
  if (btn && controls) btn.classList.toggle('on', !!controls.autoRotate);
}

/* -------------------- Loop / resize -------------------- */
function onResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  if (typeof surfaceCamera !== 'undefined' && surfaceCamera){
    surfaceCamera.aspect = window.innerWidth/window.innerHeight;
    surfaceCamera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function animate(){
  requestAnimationFrame(animate);

  if (appState === 'surface' || appState === 'story'){
    renderSurfaceFrame();
    return;
  }

  controls.update();
  starField.rotation.y += 0.00008;

  const t = performance.now()*0.002;
  markerGroup.children.forEach(g=>{
    if (g !== hoveredGroup && g !== selectedGroup){
      const s = 1 + Math.sin(t + g.position.x) * 0.08;
      g.userData.glow.scale.set(4.5*s,4.5*s,1);
    }
  });

  renderer.render(scene, camera);
}