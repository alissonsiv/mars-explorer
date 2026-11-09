/* =========================================================================
   TEXTURES — procedural generation of all textures: planet surface
   (color + bump map), scientific data layers, and auxiliary sprites
   (glow). Used by scene.js and surface.js.
   ========================================================================= */

/* =========================================================================
   GEOLOGICAL FEATURES (planet texture — free exploration)
   ========================================================================= */
function paintCraters(ctx, w, h, count){
  for (let i=0; i<count; i++){
    const x = Math.random()*w;
    const y = Math.random()*h*0.86 + h*0.07;
    const sizeRoll = Math.pow(Math.random(), 3.1);
    const r = 1.3 + sizeRoll * w*0.032;
    const freshness = Math.random();
    const big = r > w*0.012;

    const floorAlpha = 0.32 + freshness*0.28;
    const shade = ctx.createRadialGradient(x+r*0.22, y+r*0.22, 0, x, y, r);
    shade.addColorStop(0, `rgba(30,16,11,${floorAlpha})`);
    shade.addColorStop(0.62, `rgba(55,30,19,${floorAlpha*0.5})`);
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.fillStyle = shade; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();

    const rimAlpha = 0.22 + freshness*0.32;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(235,205,178,${rimAlpha})`;
    ctx.lineWidth = Math.max(0.5, r*(0.14+freshness*0.1));
    ctx.arc(x - r*0.16, y - r*0.16, r*0.92, 0.4, 4.4);
    ctx.stroke();

    if (big){
      const peak = ctx.createRadialGradient(x,y,0,x,y,r*0.2);
      peak.addColorStop(0, `rgba(222,188,158,${0.28+freshness*0.25})`);
      peak.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.fillStyle=peak; ctx.arc(x,y,r*0.2,0,Math.PI*2); ctx.fill();

      if (freshness > 0.74){
        ctx.save(); ctx.globalAlpha = 0.09 + freshness*0.08;
        for(let k=0;k<12;k++){
          const ang = Math.random()*Math.PI*2;
          const len = r*(2+Math.random()*3);
          ctx.strokeStyle = 'rgba(230,200,175,1)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x+Math.cos(ang)*r*1.05, y+Math.sin(ang)*r*1.05);
          ctx.lineTo(x+Math.cos(ang)*len, y+Math.sin(ang)*len);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}
function paintCanyonVisual(ctx, w, h){
  const mainPts = [];
  for (let lon=-104; lon<=-26; lon+=1.2){
    const lat = -13 + Math.sin(lon*0.055)*3.6 + Math.sin(lon*0.19)*0.8;
    mainPts.push(lonLatToPixel(lon, lat, w, h));
  }
  function strokePath(pts, color, width){
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    pts.forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  ctx.lineCap='round'; ctx.lineJoin='round';
  strokePath(mainPts, 'rgba(55,27,18,0.5)', h*0.058);
  strokePath(mainPts, 'rgba(20,9,6,0.62)', h*0.026);
  const lightPts = mainPts.map(p=>({x:p.x, y:p.y - h*0.021}));
  strokePath(lightPts, 'rgba(232,195,165,0.28)', h*0.008);

  for(let i=0;i<14;i++){
    const idx = Math.floor(Math.random()*mainPts.length);
    const base = mainPts[idx];
    const ang = Math.random()*Math.PI*2;
    const len = h*(0.02+Math.random()*0.055);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x+Math.cos(ang)*len, base.y+Math.sin(ang)*len);
    ctx.strokeStyle = 'rgba(28,14,10,0.4)';
    ctx.lineWidth = h*0.012;
    ctx.stroke();
  }
}
function paintVolcanoVisual(ctx, w, h, lon, lat, radiusPx){
  const p = lonLatToPixel(lon, lat, w, h);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radiusPx);
  g.addColorStop(0, 'rgba(228,195,165,0.55)');
  g.addColorStop(0.75, 'rgba(195,150,115,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.fillStyle = g; ctx.arc(p.x, p.y, radiusPx, 0, Math.PI*2); ctx.fill();

  ctx.beginPath(); ctx.fillStyle = 'rgba(55,35,26,0.45)';
  ctx.arc(p.x, p.y, radiusPx*0.1, 0, Math.PI*2); ctx.fill();

  ctx.strokeStyle = 'rgba(120,88,68,0.14)'; ctx.lineWidth = 1;
  for(let i=0;i<14;i++){
    const ang = (i/14)*Math.PI*2 + Math.random()*0.2;
    ctx.beginPath();
    ctx.moveTo(p.x+Math.cos(ang)*radiusPx*0.13, p.y+Math.sin(ang)*radiusPx*0.13);
    ctx.lineTo(p.x+Math.cos(ang)*radiusPx*0.95, p.y+Math.sin(ang)*radiusPx*0.95);
    ctx.stroke();
  }
}
function paintPolarCapVisual(ctx, w, h, isNorth, seed){
  ctx.save();
  ctx.beginPath();
  const steps = 140;
  const maxExtent = h*0.165;
  for(let i=0;i<=steps;i++){
    const x = (i/steps)*w;
    const nVal = (fractalNoise(x*0.55, 0, 3, 48, seed)-0.5)*2;
    const extent = maxExtent*(0.68+0.42*nVal);
    const y = isNorth ? extent : h-extent;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.lineTo(w, isNorth?0:h); ctx.lineTo(0, isNorth?0:h); ctx.closePath();
  const grad = ctx.createLinearGradient(0, isNorth?0:h, 0, isNorth?maxExtent*1.3:h-maxExtent*1.3);
  if (isNorth){
    grad.addColorStop(0,'rgba(255,255,255,0.97)');
    grad.addColorStop(0.55,'rgba(230,238,248,0.85)');
    grad.addColorStop(1,'rgba(230,238,248,0)');
  } else {
    grad.addColorStop(1,'rgba(255,255,255,0.97)');
    grad.addColorStop(0.45,'rgba(230,238,248,0.85)');
    grad.addColorStop(0,'rgba(230,238,248,0)');
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = 'rgba(150,170,195,1)';
  ctx.lineWidth = 1.2;
  for(let i=0;i<5;i++){
    ctx.beginPath();
    const yBase = isNorth ? maxExtent*0.3 + i*6 : h - maxExtent*0.3 - i*6;
    for(let x=0;x<w;x+=20){
      const wobble = Math.sin(x*0.02 + i)* (isNorth?4:-4);
      if (x===0) ctx.moveTo(x, yBase+wobble); else ctx.lineTo(x, yBase+wobble);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function paintRegionAlbedo(ctx, w, h, lon, lat, rx, ry, color, alpha, blend){
  const p = lonLatToPixel(lon, lat, w, h);
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.fillStyle = g;
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function buildMarsTexture(w=2048, h=1024){
  const { c, ctx } = makeCanvas(w, h);

  const noiseLow = generateWarpedNoiseCanvas(300, 150, 7);
  const colorBase = colorizeMarsNoise(noiseLow);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(colorBase, 0, 0, w, h);

  const noiseFine = generateNoiseCanvas(480, 240, 3, 5, 91);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.28;
  ctx.drawImage(noiseFine, 0, 0, w, h);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

  paintRegionAlbedo(ctx, w, h, 70, 8,    w*0.078, h*0.115, 'rgba(40,26,19,1)',    0.44, 'multiply');
  paintRegionAlbedo(ctx, w, h, 70, -42,  w*0.09,  h*0.15,  'rgba(230,198,170,1)', 0.34, 'screen');
  paintRegionAlbedo(ctx, w, h, 15, 20,   w*0.1,   h*0.09,  'rgba(224,186,146,1)', 0.22, 'screen');
  paintRegionAlbedo(ctx, w, h, -100, 5,  w*0.145, h*0.17,  'rgba(206,154,112,1)', 0.19, 'screen');
  paintRegionAlbedo(ctx, w, h, -25, 46,  w*0.095, h*0.085, 'rgba(48,32,24,1)',    0.28, 'multiply');
  paintRegionAlbedo(ctx, w, h, -43, -50, w*0.07,  h*0.1,   'rgba(226,196,168,1)', 0.26, 'screen');

  paintCraters(ctx, w, h, 300);
  paintCanyonVisual(ctx, w, h);

  paintVolcanoVisual(ctx, w, h, -133.8, 18.65, w*0.052);
  paintVolcanoVisual(ctx, w, h, -113, 9, w*0.026);
  paintVolcanoVisual(ctx, w, h, -104, 0, w*0.023);
  paintVolcanoVisual(ctx, w, h, -120, -8, w*0.024);

  ctx.globalAlpha = 0.1;
  for(let i=0;i<500;i++){
    const x = Math.random()*w, y = Math.random()*h;
    const len = Math.random()*32+8;
    const ang = Math.random()*Math.PI*2;
    ctx.strokeStyle = Math.random()>0.5 ? 'rgba(26,15,11,1)' : 'rgba(205,172,140,1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.lineTo(x+Math.cos(ang)*len, y+Math.sin(ang)*len); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  paintPolarCapVisual(ctx, w, h, true, 11);
  paintPolarCapVisual(ctx, w, h, false, 22);

  const grade = ctx.createLinearGradient(0,0,0,h);
  grade.addColorStop(0,'rgba(190,215,255,0.04)');
  grade.addColorStop(0.5,'rgba(0,0,0,0)');
  grade.addColorStop(1,'rgba(190,215,255,0.04)');
  ctx.fillStyle = grade; ctx.fillRect(0,0,w,h);

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

/* =========================================================================
   BUMP MAP — subtle relief
   ========================================================================= */
function paintCraterBump(ctx, w, h, count){
  for (let i=0; i<count; i++){
    const x = Math.random()*w;
    const y = Math.random()*h*0.86 + h*0.07;
    const r = Math.random()*Math.random()*w*0.022 + 1.8;
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0, 'rgba(40,40,40,0.8)');
    g.addColorStop(0.75, 'rgba(90,90,90,0.4)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.beginPath(); ctx.fillStyle = g; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = 'rgba(200,200,200,0.35)';
    ctx.lineWidth = Math.max(1, r*0.18); ctx.arc(x,y,r*0.92,0,Math.PI*2); ctx.stroke();
  }
}
function paintCanyonBump(ctx, w, h){
  const pts = [];
  for (let lon=-100; lon<=-28; lon+=2){
    const lat = -14 + Math.sin(lon*0.06)*3.2;
    pts.push(lonLatToPixel(lon, lat, w, h));
  }
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.strokeStyle = 'rgba(20,20,20,0.9)'; ctx.lineWidth = h*0.05; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.strokeStyle = 'rgba(5,5,5,0.85)'; ctx.lineWidth = h*0.024; ctx.stroke();
}
function paintVolcanoBump(ctx, w, h, lon, lat, radiusPx, peakVal){
  const p = lonLatToPixel(lon, lat, w, h);
  const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radiusPx);
  g.addColorStop(0, `rgba(${peakVal},${peakVal},${peakVal},0.9)`);
  g.addColorStop(0.6, `rgba(${Math.floor(peakVal*0.7)},${Math.floor(peakVal*0.7)},${Math.floor(peakVal*0.7)},0.5)`);
  g.addColorStop(1, 'rgba(128,128,128,0)');
  ctx.beginPath(); ctx.fillStyle=g; ctx.arc(p.x,p.y,radiusPx,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.fillStyle='rgba(55,55,55,0.5)';
  ctx.arc(p.x,p.y,radiusPx*0.12,0,Math.PI*2); ctx.fill();
}
function buildMarsBumpMap(w=1024, h=512){
  const { c, ctx } = makeCanvas(w,h);
  ctx.fillStyle = '#808080'; ctx.fillRect(0,0,w,h);

  const noiseLow = generateNoiseCanvas(140,70,4,20,5);
  ctx.globalAlpha = 0.45; ctx.drawImage(noiseLow,0,0,w,h); ctx.globalAlpha = 1;

  const noiseFine = generateNoiseCanvas(220,110,3,6,19);
  ctx.globalAlpha = 0.2; ctx.drawImage(noiseFine,0,0,w,h); ctx.globalAlpha = 1;

  paintCraterBump(ctx, w, h, 220);
  paintCanyonBump(ctx, w, h);
  paintVolcanoBump(ctx, w, h, -133.8, 18.65, w*0.075, 235);
  paintVolcanoBump(ctx, w, h, -113, 9, w*0.032, 210);
  paintVolcanoBump(ctx, w, h, -104, 0, w*0.028, 205);
  paintVolcanoBump(ctx, w, h, -120, -8, w*0.03, 205);

  return new THREE.CanvasTexture(c);
}

/* -------------------- Scientific data layers (overlay) -------------------- */
function generateElevationLayer(w=1024,h=512){
  const { c, ctx } = makeCanvas(w,h);
  ctx.fillStyle = 'rgba(47,168,79,0.55)'; ctx.fillRect(0,0,w,h);
  const spots = [
    { lon:-133.8, lat:18.65, r:0.09, color:'rgba(194,31,31,0.85)' },
    { lon:-110, lat:0, r:0.1, color:'rgba(227,101,42,0.7)' },
    { lon:-59.2, lat:-14, r:0.14, color:'rgba(27,42,140,0.8)', flat:0.15 },
    { lon:70, lat:-42, r:0.13, color:'rgba(27,42,140,0.75)' },
    { lon:0, lat:88, r:0.12, color:'rgba(232,212,77,0.7)' },
    { lon:0, lat:-88, r:0.12, color:'rgba(232,212,77,0.7)' },
  ];
  spots.forEach(s=>{
    const p = lonLatToPixel(s.lon,s.lat,w,h);
    ctx.beginPath(); ctx.fillStyle = s.color;
    ctx.ellipse(p.x,p.y,w*s.r,h*(s.flat||s.r),0,0,Math.PI*2); ctx.fill();
  });
  return new THREE.CanvasTexture(c);
}
function generateTemperatureLayer(w=1024,h=512){
  const { c, ctx } = makeCanvas(w,h);
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,'rgba(27,42,140,0.8)'); grad.addColorStop(0.5,'rgba(255,107,53,0.75)'); grad.addColorStop(1,'rgba(27,42,140,0.8)');
  ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
  for(let i=0;i<60;i++){
    const x=Math.random()*w, y=Math.random()*h*0.6+h*0.2, r=Math.random()*40+20;
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(232,212,77,0.5)'); g.addColorStop(1,'rgba(232,212,77,0)');
    ctx.beginPath(); ctx.fillStyle=g; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}
function generateRadiationLayer(w=1024,h=512){
  const { c, ctx } = makeCanvas(w,h);
  ctx.fillStyle='rgba(17,58,45,0.5)'; ctx.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=18){ ctx.strokeStyle='rgba(57,255,136,0.08)'; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0;y<h;y+=18){ ctx.strokeStyle='rgba(57,255,136,0.08)'; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  const hot = [ {lon:-133.8,lat:18.65,r:0.09}, {lon:0,lat:88,r:0.15}, {lon:0,lat:-88,r:0.15}, {lon:135.9,lat:4.5,r:0.07} ];
  hot.forEach(s=>{
    const p = lonLatToPixel(s.lon,s.lat,w,h);
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,w*s.r);
    g.addColorStop(0,'rgba(255,59,92,0.75)'); g.addColorStop(1,'rgba(255,59,92,0)');
    ctx.beginPath(); ctx.fillStyle=g; ctx.arc(p.x,p.y,w*s.r,0,Math.PI*2); ctx.fill();
  });
  return new THREE.CanvasTexture(c);
}
function generateWaterIceLayer(w=1024,h=512){
  const { c, ctx } = makeCanvas(w,h);
  ctx.clearRect(0,0,w,h);
  let cap = ctx.createLinearGradient(0,0,0,h*0.22);
  cap.addColorStop(0,'rgba(174,230,255,0.9)'); cap.addColorStop(1,'rgba(174,230,255,0)');
  ctx.fillStyle=cap; ctx.fillRect(0,0,w,h*0.25);
  cap = ctx.createLinearGradient(0,h*0.78,0,h);
  cap.addColorStop(0,'rgba(174,230,255,0)'); cap.addColorStop(1,'rgba(174,230,255,0.9)');
  ctx.fillStyle=cap; ctx.fillRect(0,h*0.75,w,h*0.25);
  [{lon:77.4,lat:18.4},{lon:137.8,lat:-5.4}].forEach(s=>{
    const p = lonLatToPixel(s.lon,s.lat,w,h);
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,w*0.05);
    g.addColorStop(0,'rgba(100,180,255,0.6)'); g.addColorStop(1,'rgba(100,180,255,0)');
    ctx.beginPath(); ctx.fillStyle=g; ctx.arc(p.x,p.y,w*0.05,0,Math.PI*2); ctx.fill();
  });
  return new THREE.CanvasTexture(c);
}

/* -------------------- Auxiliary textures (3D UI) -------------------- */
function generateGlowTexture(){
  const { c, ctx } = makeCanvas(128,128);
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.35,'rgba(255,255,255,0.55)'); g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}