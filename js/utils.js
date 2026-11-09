/* =========================================================================
   UTILS — math, spherical geometry, procedural noise (fractal + domain
   warping) and canvas helpers. Used by all other modules.
   ========================================================================= */

/* -------------------- Geometry -------------------- */
function latLonToVector3(lat, lon, radius){
  const phi = (90 - lat) * (Math.PI/180);
  const theta = (lon + 180) * (Math.PI/180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}
function lonLatToPixel(lon, lat, w, h){
  const u = 0.5 - lon/360;
  const v = 0.5 - lat/180;
  return { x: ((u%1)+1)%1 * w, y: v*h };
}
function haversineDistance(lat1, lon1, lat2, lon2, R=3389.5){
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function easeInOutQuad(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
function lerp(a,b,t){ return a+(b-a)*t; }
function makeCanvas(w,h){ const c = document.createElement('canvas'); c.width=w; c.height=h; return { c, ctx:c.getContext('2d') }; }

/* =========================================================================
   PROCEDURAL NOISE — fractal + domain warping (natural terrain)
   ========================================================================= */
function hashNoise(x, y, seed){
  const n = Math.sin(x*127.1 + y*311.7 + seed*74.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smoothNoise(x, y, scale, seed){
  const xs = x/scale, ys = y/scale;
  const x0 = Math.floor(xs), y0 = Math.floor(ys);
  const x1 = x0+1, y1 = y0+1;
  const sx = xs-x0, sy = ys-y0;
  const sxf = sx*sx*(3-2*sx), syf = sy*sy*(3-2*sy);
  const n00 = hashNoise(x0,y0,seed), n10 = hashNoise(x1,y0,seed);
  const n01 = hashNoise(x0,y1,seed), n11 = hashNoise(x1,y1,seed);
  const ix0 = n00 + (n10-n00)*sxf;
  const ix1 = n01 + (n11-n01)*sxf;
  return ix0 + (ix1-ix0)*syf;
}
function fractalNoise(x, y, octaves, baseScale, seed){
  let value = 0, amp = 1, freq = 1, max = 0;
  for(let i=0;i<octaves;i++){
    value += smoothNoise(x*freq, y*freq, baseScale, seed+i*17) * amp;
    max += amp;
    amp *= 0.52; freq *= 2.1;
  }
  return value/max;
}
/** Domain warping: distorts the sampling coordinates using another
    noise field, producing terrains with natural flow. */
function domainWarpNoise(x, y, seed){
  const warpX = fractalNoise(x*0.6+11, y*0.6-7, 4, 85, seed+401) - 0.5;
  const warpY = fractalNoise(x*0.6-33, y*0.6+19, 4, 85, seed+877) - 0.5;
  const wx = x + warpX*140;
  const wy = y + warpY*140;
  return fractalNoise(wx, wy, 6, 60, seed);
}
function generateNoiseCanvas(w, h, octaves, scale, seed){
  const { c, ctx } = makeCanvas(w,h);
  const imgData = ctx.createImageData(w,h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const n = fractalNoise(x,y,octaves,scale,seed);
      const v = Math.max(0,Math.min(255,Math.floor(n*255)));
      const idx = (y*w+x)*4;
      imgData.data[idx]=v; imgData.data[idx+1]=v; imgData.data[idx+2]=v; imgData.data[idx+3]=255;
    }
  }
  ctx.putImageData(imgData,0,0);
  return c;
}
function generateWarpedNoiseCanvas(w, h, seed){
  const { c, ctx } = makeCanvas(w,h);
  const imgData = ctx.createImageData(w,h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const n = domainWarpNoise(x,y,seed);
      const v = Math.max(0,Math.min(255,Math.floor(n*255)));
      const idx = (y*w+x)*4;
      imgData.data[idx]=v; imgData.data[idx+1]=v; imgData.data[idx+2]=v; imgData.data[idx+3]=255;
    }
  }
  ctx.putImageData(imgData,0,0);
  return c;
}
/** Realistic 8-tone Martian palette (dark basalt → light beige) */
function colorizeMarsNoise(noiseCanvas){
  const w = noiseCanvas.width, h = noiseCanvas.height;
  const srcCtx = noiseCanvas.getContext('2d');
  const src = srcCtx.getImageData(0,0,w,h);
  const { c, ctx } = makeCanvas(w,h);
  const out = ctx.createImageData(w,h);
  const stops = [
    [0.00,  50,  33,  25],
    [0.28,  86,  49,  34],
    [0.44, 128,  73,  46],
    [0.56, 160,  97,  59],
    [0.68, 190, 123,  77],
    [0.80, 211, 150, 104],
    [0.90, 224, 174, 134],
    [1.00, 234, 196, 161],
  ];
  function sample(v){
    for(let i=0;i<stops.length-1;i++){
      const a = stops[i], b = stops[i+1];
      if (v>=a[0] && v<=b[0]){
        const t = (v-a[0])/(b[0]-a[0]);
        return [lerp(a[1],b[1],t), lerp(a[2],b[2],t), lerp(a[3],b[3],t)];
      }
    }
    const last = stops[stops.length-1];
    return [last[1], last[2], last[3]];
  }
  for(let i=0;i<src.data.length;i+=4){
    const v = src.data[i]/255;
    const [r,g,b] = sample(v);
    out.data[i]=r; out.data[i+1]=g; out.data[i+2]=b; out.data[i+3]=255;
  }
  ctx.putImageData(out,0,0);
  return c;
} 