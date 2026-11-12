/* =========================================================================
   APP — general application state, UI (panels, tabs, lists), real NASA
   photos, telemetry, guided mission flow (now in 3D surface mode), and
   bootstrap. Depends on all other modules.
   ========================================================================= */

let appState = 'start'; // start | dashboard | story | surface
const storyState = { active:false, started:false, index:0, totalDistance:0, totalTime:0, o2:0 };
let missionComplete = false;

let sceneReady = false;
let initErrorMessage = null;

/* =========================================================================
   SAFE INVOKE — pequena rede de segurança para handlers de UI.
   Se um botão falhar por qualquer motivo (erro de digitação, id errado,
   etc.), o erro aparece no console e no Mission Log em vez de o botão
   simplesmente "não fazer nada" silenciosamente.
   ========================================================================= */
function safeInvoke(fn, label){
  return function(...args){
    try {
      fn.apply(this, args);
    } catch (err) {
      console.error(`[safeInvoke] Error executing "${label}":`, err);
      try { addLog(`⚠️ Error in ${label}: ${err.message}`); } catch(e2){ /* ignore */ }
    }
  };
}

/* =========================================================================
   GENERAL APP STATE
   ========================================================================= */
function setAppState(state){
  appState = state;
  document.getElementById('start-screen').style.display = state==='start' ? 'flex' : 'none';
  document.getElementById('app-header').style.display = state==='dashboard' ? 'flex' : 'none';
  ['layers-panel','telemetry','mission-log'].forEach(id=>{
    document.getElementById(id).style.display = state==='dashboard' ? '' : 'none';
  });
  document.getElementById('right-panel').style.display = state==='dashboard' ? 'flex' : 'none';
  document.getElementById('story-panel').style.display = state==='story' ? 'block' : 'none';
  document.getElementById('story-progress-wrap').style.display = state==='story' ? 'block' : 'none';

  const surfHud = document.getElementById('surface-hud');
  const surfTopbar = document.querySelector('.surface-topbar');
  if (state === 'story'){
    if (surfHud) surfHud.style.display = 'block';
    if (surfTopbar) surfTopbar.style.display = 'none';
  } else if (state !== 'surface'){
    if (surfHud) surfHud.style.display = 'none';
    if (surfTopbar) surfTopbar.style.display = 'flex';
  }

  if (markerGroup) markerGroup.visible = (state==='dashboard');
  if (controls) controls.autoRotate = (state==='dashboard' || state==='start');

  if (state!=='dashboard' && selectedGroup){ resetMarkerStyle(selectedGroup); selectedGroup = null; }
  hoveredGroup = null;
}

function goHome(){
  document.getElementById('story-briefing').style.display = 'none';
  document.getElementById('story-complete').style.display = 'none';
  toggleStoryCard(false);

  storyState.active = false;
  storyState.started = false;
  storyState.index = 0;
  missionComplete = false;

  keysDown = {};
  surfaceDrag.active = false;

  if (controls) controls.enabled = true;

  setAppState('start');
  if (camera && controls){
    animateCameraTo(new THREE.Vector3(10,35,140), new THREE.Vector3(0,0,0));
  }
}

/* =========================================================================
   DATA LAYERS — UI
   ========================================================================= */
function buildLayerButtons(){
  const container = document.getElementById('layers-list');
  LAYERS.forEach(layer=>{
    const btn = document.createElement('button');
    btn.className = 'layer-btn' + (layer.id==='none' ? ' active' : '');
    btn.innerHTML = `<span class="ico">${layer.icon}</span> ${layer.label}`;
    btn.onclick = () => setActiveLayer(layer.id, btn);
    container.appendChild(btn);
  });
}
function setActiveLayer(id, btnEl){
  document.querySelectorAll('.layer-btn').forEach(b=>b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const layerDef = LAYERS.find(l=>l.id===id);
  if (id === 'none'){
    fadeOverlay(0);
    document.getElementById('legend-title').textContent = 'Real surface (cameras)';
    document.getElementById('legend-gradient').style.background = 'linear-gradient(90deg,#6b2f1a,#d98c5f)';
    document.getElementById('legend-min').textContent = ''; document.getElementById('legend-max').textContent = '';
  } else {
    overlayMesh.material.map = overlayTextures[id]; overlayMesh.material.needsUpdate = true;
    fadeOverlay(0.82);
    document.getElementById('legend-title').textContent = layerDef.label;
    document.getElementById('legend-gradient').style.background = layerDef.legend.gradient;
    document.getElementById('legend-min').textContent = layerDef.legend.min;
    document.getElementById('legend-max').textContent = layerDef.legend.max;
  }
  addLog(`Data layer changed to: ${layerDef.label}`);
}
function fadeOverlay(target){
  const start = overlayMesh.material.opacity;
  const t0 = performance.now(), duration=400;
  function step(now){
    const t = Math.min((now-t0)/duration,1);
    overlayMesh.material.opacity = start + (target-start)*t;
    if (t<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =========================================================================
   POI LIST / DETAILS PANEL / TABS
   ========================================================================= */
function buildPoiList(){
  const container = document.getElementById('poi-list');
  POIS.forEach(poi=>{
    const div = document.createElement('div'); div.className = 'poi-item';
    div.innerHTML = `
      <span class="type-tag" style="background:${TYPE_COLORS[poi.type]}22;color:${TYPE_COLORS[poi.type]};border:1px solid ${TYPE_COLORS[poi.type]}55">${TYPE_ICONS[poi.type]} ${TYPE_LABELS[poi.type]}</span>
      <h4>${poi.name}</h4><p>${poi.description.slice(0,90)}...</p>
      <div class="poi-actions">
        <button class="mini-btn" onclick="focusOnPoi('${poi.id}')">🎯 Focus</button>
        <button class="mini-btn primary" onclick="openInfoPanel(POIS.find(p=>p.id==='${poi.id}'));switchTab('info')">📷 View Details</button>
      </div>`;
    container.appendChild(div);
  });
}

function openInfoPanel(poi){
  document.getElementById('info-empty').style.display = 'none';
  const el = document.getElementById('info-content');
  el.style.display = 'block';
  el.innerHTML = `
    <h3>${TYPE_ICONS[poi.type]} ${poi.name}</h3>
    <span class="type-tag" style="background:${TYPE_COLORS[poi.type]}22;color:${TYPE_COLORS[poi.type]};border:1px solid ${TYPE_COLORS[poi.type]}55">${TYPE_LABELS[poi.type]}</span>
    <div class="photo-frame loading" id="poi-photo-frame">
      <img id="poi-photo-img" alt="Photo of ${poi.name}">
    </div>
    <div class="photo-caption" id="poi-photo-caption">Searching for a real image in NASA's database...</div>
    <div class="info-row"><span>Coordinates</span><span>${poi.lat.toFixed(2)}°, ${poi.lon.toFixed(2)}°</span></div>
    <div class="info-row"><span>Elevation</span><span>${poi.elevation} m</span></div>
    <div class="info-row"><span>Associated mission</span><span>${poi.mission}</span></div>
    <p id="info-desc">${poi.description}</p>
    <div class="hazard-box">⚠️ <strong>Hazard:</strong> ${poi.hazard}</div>
    <div class="resource-box">💠 <strong>Resources:</strong> ${poi.resource}</div>
    <div class="poi-actions" style="margin-top:12px;flex-direction:column;gap:6px;">
      <button class="mini-btn primary" onclick="focusOnPoi('${poi.id}')" style="width:100%;">🎯 Focus on this location on the planet</button>
      <button class="mini-btn" style="width:100%;background:linear-gradient(90deg,#4fd1ff,#39ff88);color:#06110c;border-color:transparent;"
        onclick="enterSurfaceMode({seed: seedFromLatLon(${poi.lat}, ${poi.lon}), label: '${poi.name}'})">
        🚶 Walk on the Surface (3D)
      </button>
    </div>
  `;
  loadPoiPhoto(poi);
}

function switchTab(tabId){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabId));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active', c.id==='tab-'+tabId));
}

/* =========================================================================
   TELEMETRY + MISSION LOG
   ========================================================================= */
let solCount = 1253, marsMinutes = 14*60+27;
function tickClock(){
  marsMinutes = (marsMinutes + 1) % (24*60);
  if (marsMinutes === 0) solCount++;
  const hh = String(Math.floor(marsMinutes/60)).padStart(2,'0');
  const mm = String(marsMinutes%60).padStart(2,'0');
  const elSol = document.getElementById('tele-sol');
  const elTime = document.getElementById('tele-time');
  if (elSol) elSol.textContent = solCount;
  if (elTime) elTime.textContent = `${hh}:${mm}`;
}
function updateTelemetry(){
  const elTemp = document.getElementById('tele-temp');
  const elWind = document.getElementById('tele-wind');
  const elPress = document.getElementById('tele-pressure');
  const elRad = document.getElementById('tele-rad');
  if (elTemp) elTemp.textContent = `${(-80 + Math.random()*55).toFixed(0)}°C`;
  if (elWind) elWind.textContent = `${(2 + Math.random()*22).toFixed(1)} m/s`;
  if (elPress) elPress.textContent = `${(600 + Math.random()*90).toFixed(0)} Pa`;
  if (elRad) elRad.textContent = `${(0.2 + Math.random()*0.5).toFixed(2)} mSv/day`;
}
const LOG_MESSAGES = [
  'Signal received from Perseverance rover via MRO relay...',
  'Updating elevation map (MOLA data)...',
  'Atmospheric dust forecast stable for the next 3 sols.',
  'InSight telemetry successfully synchronized.',
  'New orbital image processed (HiRISE)...',
  'Life support system operating within normal parameters.',
  'Radiation check complete — levels within expected range.',
];
function addLog(msg){
  const box = document.getElementById('mission-log');
  if (!box) return;
  const time = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const line = document.createElement('div'); line.className = 'log-line';
  line.innerHTML = `<span class="ts">[${time}]</span>${msg}`;
  box.appendChild(line); box.scrollTop = box.scrollHeight;
  while (box.children.length > 25) box.removeChild(box.firstChild);
}

/* =========================================================================
   REAL PHOTOS — NASA Images API
   ========================================================================= */
const photoCache = {};
function fetchNasaPhoto(query){
  if (photoCache[query] !== undefined) return Promise.resolve(photoCache[query]);
  return fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`)
    .then(r=>r.json())
    .then(data=>{
      const items = data.collection && data.collection.items;
      if (!items || !items.length) throw new Error('no results');
      let found = null;
      for (const it of items){ if (it.links && it.links[0] && it.links[0].href){ found = it; break; } }
      if (!found) throw new Error('no image');
      const result = { src: found.links[0].href, title: (found.data && found.data[0] && found.data[0].title) || query };
      photoCache[query] = result;
      return result;
    })
    .catch(()=>{ photoCache[query] = null; return null; });
}
function loadPhotoInto(query, frameEl, imgEl, captionEl){
  if (!frameEl || !imgEl || !captionEl) return;
  const token = {};
  frameEl._photoToken = token;
  frameEl.classList.add('loading');
  frameEl.classList.remove('no-photo');
  imgEl.style.display = 'none';
  captionEl.textContent = 'Searching for a real image in NASA\'s database...';

  fetchNasaPhoto(query).then(result=>{
    if (frameEl._photoToken !== token) return;
    frameEl.classList.remove('loading');
    if (result){
      imgEl.onload = ()=>{ imgEl.style.display = 'block'; };
      imgEl.src = result.src;
      frameEl.classList.remove('no-photo');
      captionEl.textContent = `📷 ${result.title} — Source: NASA Image and Video Library`;
    } else {
      imgEl.style.display = 'none';
      frameEl.classList.add('no-photo');
      captionEl.textContent = '📡 Real image currently unavailable — showing telemetry data only.';
    }
  });
}
function loadChapterPhoto(wp){
  loadPhotoInto(
    wp.photoQuery,
    document.getElementById('story-photo-frame'),
    document.getElementById('story-photo-img'),
    document.getElementById('story-photo-caption')
  );
}
function loadPoiPhoto(poi){
  loadPhotoInto(
    poi.photoQuery,
    document.getElementById('poi-photo-frame'),
    document.getElementById('poi-photo-img'),
    document.getElementById('poi-photo-caption')
  );
}

/* =========================================================================
   STORY MODE — fully in 3D surface (first person)
   ========================================================================= */
function typeText(el, text, speed=14){
  if (el._typeInterval) clearInterval(el._typeInterval);
  el.textContent = ''; let i = 0;
  el._typeInterval = setInterval(()=>{
    el.textContent += text[i]; i++;
    if (i >= text.length) clearInterval(el._typeInterval);
  }, speed);
}
function buildStoryDots(){
  const container = document.getElementById('story-dots');
  container.innerHTML = '';
  storyWaypoints.forEach((wp,i)=>{
    const dot = document.createElement('div');
    dot.className = 'story-dot'; dot.title = wp.name; dot.textContent = i+1;
    dot.onclick = ()=> enterStoryChapterSurface(i);
    container.appendChild(dot);
  });
}

function openBriefing(){
  let total = 0;
  for(let i=1;i<storyWaypoints.length;i++){
    total += haversineDistance(storyWaypoints[i-1].lat, storyWaypoints[i-1].lon, storyWaypoints[i].lat, storyWaypoints[i].lon);
  }
  document.getElementById('brief-origin').textContent = storyWaypoints[0].name;
  document.getElementById('brief-dest').textContent = storyWaypoints[storyWaypoints.length-1].name;
  document.getElementById('brief-dist').textContent = total.toFixed(1) + ' km';
  document.getElementById('brief-stops').textContent = storyWaypoints.length + ' stops';
  document.getElementById('story-briefing').style.display = 'flex';
}

function beginStory(){
  document.getElementById('story-briefing').style.display = 'none';
  document.getElementById('story-complete').style.display = 'none';
  storyState.active = true;
  storyState.started = true;
  missionComplete = false;
  buildStoryDots();
  enterStoryChapterSurface(0);
}

let storyTransitioning = false;
function enterStoryChapterSurface(index){
  if (storyTransitioning) return;
  storyTransitioning = true;

  storyState.index = index;
  const wp = storyWaypoints[index];
  loadChapterPhoto(wp);

  ensureSurfaceSceneInit();
  const seed = seedFromLatLon(wp.lat, wp.lon);
  buildSurfaceWorld(seed);
  spawnStoryTarget(seed);

  setAppState('story');
  if (controls) controls.enabled = false;

  renderChapterContent(index);

  setTimeout(()=>{ storyTransitioning = false; }, 300);
}

function renderChapterContent(index){
  const wp = storyWaypoints[index];
  let totalDist = 0;
  for(let i=1;i<=index;i++){
    totalDist += haversineDistance(storyWaypoints[i-1].lat, storyWaypoints[i-1].lon, storyWaypoints[i].lat, storyWaypoints[i].lon);
  }
  const legDist = index===0 ? 0 : haversineDistance(storyWaypoints[index-1].lat, storyWaypoints[index-1].lon, wp.lat, wp.lon);
  const totalTime = totalDist / 3.2;
  const o2 = totalTime * 0.21;
  storyState.totalDistance = totalDist; storyState.totalTime = totalTime; storyState.o2 = o2;

  document.getElementById('story-chapter-tag').textContent = `CHAPTER ${index+1} / ${storyWaypoints.length}`;
  document.getElementById('story-title').textContent = `${wp.icon} ${wp.name}`;
  document.getElementById('story-subtitle').textContent = wp.subtitle;
  typeText(document.getElementById('story-narrative'), wp.narrative, 14);
  document.getElementById('story-leg-dist').textContent = index===0 ? '—' : legDist.toFixed(2)+' km';
  document.getElementById('story-total-dist').textContent = totalDist.toFixed(2)+' km';
  document.getElementById('story-elevation').textContent = wp.elevation+' m';
  document.getElementById('story-sample').textContent = wp.sample || '—';
  document.getElementById('story-hazard').innerHTML = `⚠️ <strong>Hazard:</strong> ${wp.hazard}`;
  document.getElementById('story-resource').innerHTML = `💠 <strong>Discovery:</strong> ${wp.resource}`;
  document.getElementById('story-objective').textContent = `🎯 Objective: ${wp.objective}`;

  const o2pct = Math.max(2, 100 - (o2/10)*100);
  const fill = document.getElementById('o2-gauge-fill');
  fill.style.width = o2pct + '%';
  fill.style.background = o2pct < 30 ? 'linear-gradient(90deg,#ff3b5c,#ff6b35)' : 'linear-gradient(90deg,#39ff88,#4fd1ff)';

  document.getElementById('story-progress-fill').style.width = (index/(storyWaypoints.length-1)*100)+'%';

  document.querySelectorAll('.story-dot').forEach((d,i)=>{
    d.classList.toggle('active', i===index);
    d.classList.toggle('done', i<index);
  });

  document.getElementById('btn-prev-chapter').disabled = index === 0;
  document.getElementById('btn-next-chapter').textContent = index === storyWaypoints.length-1 ? '🏁 Complete Mission' : 'Next ➡';

  const targetStatus = document.getElementById('story-target-status');
  const targetDistance = document.getElementById('story-target-distance');
  const targetInfo = document.getElementById('story-target-info');
  if (targetStatus) targetStatus.textContent = '🎯 Head to the scientific collection beacon';
  if (targetDistance) targetDistance.textContent = '-- m';
  if (targetInfo) targetInfo.classList.remove('collected');

  addLog(`📍 Landing complete: ${wp.name} (Chapter ${index+1}/${storyWaypoints.length})`);
}

function nextChapter(){
  if (storyTransitioning) return;
  if (storyState.index < storyWaypoints.length - 1) enterStoryChapterSurface(storyState.index + 1);
  else finishStory();
}
function prevChapter(){
  if (storyTransitioning) return;
  if (storyState.index > 0) enterStoryChapterSurface(storyState.index - 1);
}

function finishStory(){
  document.getElementById('story-panel').style.display = 'none';
  document.getElementById('story-progress-wrap').style.display = 'none';
  const surfHud = document.getElementById('surface-hud');
  if (surfHud) surfHud.style.display = 'none';
  missionComplete = true;
  keysDown = {};

  const grid = document.getElementById('summary-grid');
  grid.innerHTML = `
    <div><span>TOTAL DISTANCE</span><strong>${storyState.totalDistance.toFixed(2)} km</strong></div>
    <div><span>EVA TIME</span><strong>${storyState.totalTime.toFixed(1)} h</strong></div>
    <div><span>O₂ CONSUMED</span><strong>${storyState.o2.toFixed(2)} kg</strong></div>
    <div><span>SAMPLES COLLECTED</span><strong>${storyWaypoints.length}</strong></div>
  `;
  document.getElementById('story-complete').style.display = 'flex';
  addLog('🏁 Operation Jezero mission successfully completed!');
}

function restartStory(){
  document.getElementById('story-complete').style.display = 'none';
  missionComplete = false;
  storyState.started = true;
  enterStoryChapterSurface(0);
}

let storyCardMinimized = false;
function toggleStoryCard(forceState){
  const card = document.getElementById('story-card');
  const icon = document.getElementById('story-toggle-icon');
  const text = document.getElementById('story-toggle-text');
  if (!card) return;
  if (typeof forceState === 'boolean'){
    storyCardMinimized = forceState;
  } else {
    storyCardMinimized = !storyCardMinimized;
  }
  card.classList.toggle('minimized', storyCardMinimized);
  if (icon) icon.textContent = storyCardMinimized ? '▴' : '▾';
  if (text) text.textContent = storyCardMinimized ? 'Expand Log' : 'Minimize Log';
}

/* =========================================================================
   LOADING SCREEN
   ========================================================================= */
const steps = [
  { p:15, m:'Establishing link with Deep Space Network...' },
  { p:32, m:'Generating terrain via noise with domain warping...' },
  { p:50, m:'Painting craters, canyons and volcanoes with relief...' },
  { p:68, m:'Applying real albedo regions and polar caps...' },
  { p:85, m:'Calculating surface bump map...' },
  { p:93, m:'Preparing 3D surface engine...' },
  { p:97, m:'Finishing up...' },
];
function runLoading(){
  let i = 0;
  const bar = document.getElementById('progress-bar');
  const msg = document.getElementById('loading-msg');
  const startTime = performance.now();
  const MAX_WAIT_MS = 15000;

  function next(){
    if (i < steps.length){
      bar.style.width = steps[i].p + '%';
      msg.textContent = steps[i].m;
      i++;
      setTimeout(next, 300);
      return;
    }
    waitForSceneReady();
  }

  function waitForSceneReady(){
    const elapsed = performance.now() - startTime;
    if (sceneReady || elapsed > MAX_WAIT_MS){
      bar.style.width = '100%';
      if (initErrorMessage){
        msg.textContent = 'Loaded in simplified mode (' + initErrorMessage + ')';
        setTimeout(()=> document.getElementById('loading-screen').classList.add('hidden'), 1100);
      } else {
        msg.textContent = 'Ready for exploration.';
        setTimeout(()=> document.getElementById('loading-screen').classList.add('hidden'), 300);
      }
      return;
    }
    msg.textContent = 'Rendering Martian surface...';
    setTimeout(waitForSceneReady, 200);
  }

  next();
}

/* =========================================================================
   UI EVENTS
   ========================================================================= */
function attachUIEvents(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', safeInvoke(()=>switchTab(btn.dataset.tab), 'switchTab'));
  });

  document.getElementById('btn-rotate').addEventListener('click', safeInvoke((e)=>{
    controls.autoRotate = !controls.autoRotate;
    e.target.classList.toggle('on', controls.autoRotate);
  }, 'btn-rotate'));

  document.getElementById('btn-reset').addEventListener('click', safeInvoke(()=>{
    animateCameraTo(new THREE.Vector3(10,35,140), new THREE.Vector3(0,0,0));
    if (selectedGroup){ resetMarkerStyle(selectedGroup); selectedGroup = null; }
  }, 'btn-reset'));

  document.getElementById('btn-fullscreen').addEventListener('click', safeInvoke(()=>{
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }, 'btn-fullscreen'));

  document.getElementById('btn-home').addEventListener('click', safeInvoke(goHome, 'goHome'));

  document.getElementById('btn-start-story').addEventListener('click', safeInvoke(openBriefing, 'openBriefing'));
  document.getElementById('btn-start-explore').addEventListener('click', safeInvoke(()=>{
    setAppState('dashboard');
    addLog('Free exploration mode activated.');
  }, 'btn-start-explore'));

  document.getElementById('btn-open-story').addEventListener('click', safeInvoke(openBriefing, 'openBriefing'));
  document.getElementById('btn-cancel-story').addEventListener('click', safeInvoke(()=>{
    document.getElementById('story-briefing').style.display = 'none';
  }, 'btn-cancel-story'));

  document.getElementById('btn-begin-story').addEventListener('click', safeInvoke(beginStory, 'beginStory'));
  document.getElementById('btn-exit-story').addEventListener('click', safeInvoke(goHome, 'goHome (exit-story)'));
  document.getElementById('btn-prev-chapter').addEventListener('click', safeInvoke(prevChapter, 'prevChapter'));
  document.getElementById('btn-next-chapter').addEventListener('click', safeInvoke(nextChapter, 'nextChapter'));
  document.getElementById('btn-restart-story').addEventListener('click', safeInvoke(restartStory, 'restartStory'));
  document.getElementById('btn-finish-exit').addEventListener('click', safeInvoke(goHome, 'goHome (finish-exit)'));

  document.getElementById('btn-exit-surface').addEventListener('click', safeInvoke(exitSurfaceMode, 'exitSurfaceMode'));

  const btnToggleStory = document.getElementById('btn-toggle-story-card');
  if (btnToggleStory){
    btnToggleStory.addEventListener('click', safeInvoke(()=>toggleStoryCard(), 'toggleStoryCard'));
  }
  window.addEventListener('keydown', (e)=>{
    if (e.code === 'KeyH' && appState === 'story'){
      e.preventDefault();
      toggleStoryCard();
    }
  });

  attachSurfaceControls();

  setInterval(tickClock, 600);
  setInterval(updateTelemetry, 3000);
  setInterval(()=>{ if(appState==='dashboard') addLog(LOG_MESSAGES[Math.floor(Math.random()*LOG_MESSAGES.length)]); }, 5000);
}

/* =========================================================================
   BOOTSTRAP — defensive initialization (never blocks the loading screen)
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  runLoading();

  setTimeout(() => {
    try {
      initScene();
      buildLayerButtons();
      buildPoiList();
      buildStoryDots();
      attachUIEvents();
      setAppState('start');
    } catch (err) {
      console.error('Critical error initializing Mars Explorer:', err);
      initErrorMessage = (err && err.message) ? err.message : 'unknown error';
      try { setAppState('start'); } catch(e2){ /* ignore */ }
    } finally {
      sceneReady = true;
    }
  }, 30);
});