import * as T from 'three';
import { neighborPlacements, hallSpec, isArtShow, IN } from './model.js';
export const TENTS = {classic:'Classic pop-up', peak:'High peak', barrel:'Barrel roof · TrimLine-inspired', dome:'Soft dome'};
const material = (color, extra={}) => new T.MeshStandardMaterial({color,roughness:.85,...extra});
function mesh(g,geo,mat) { const m=new T.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;g.add(m);return m; }
function rod(g,a,b,r,mat) {a=new T.Vector3(...a);b=new T.Vector3(...b);const m=mesh(g,new T.CylinderGeometry(r,r,a.distanceTo(b),8),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());return m;}
// UVs are laid out in metres, not 0..1. A tent's roof is about three metres
// across and its valance twelve inches deep; with UVs spanning 0..1 on both,
// one weave or one canvas texture would be stretched ten times further on the
// valance than on the roof. In metres, one repeat is one real distance
// everywhere, and a texture converts with a single repeat of 1/tileMetres —
// the same rule the ground already follows through repeatFor().
function surface(g,fn,mat,nu=40,nv=24,metres=[1,1]) {const pts=[],uv=[],idx=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){pts.push(...fn(i/nu,j/nv));uv.push(i/nu*metres[0],j/nv*metres[1]);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+nu+1;idx.push(a,b,a+1,b,b+1,a+1);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();const m=mesh(g,geo,mat);
 // Marks the panels a canvas texture belongs on. scene.js looks for this;
 // the frame, feet and seam rods must keep their metal and stitching.
 m.userData.fabric=true;return m;}
export function makeTent(W,D,H,style='classic') {
 const g=new T.Group();g.name='tent-'+style;
 const steel=material('#c0c4c5',{metalness:.65,roughness:.32}),fabric=new T.MeshPhysicalMaterial({color:'#f7f6f0',roughness:.88,side:T.DoubleSide,sheen:.35,sheenColor:new T.Color('#fff9e9'),bumpMap:fabricWeave(),bumpScale:.0015}),seam=material('#deddd5');
 const eave=H+.38, drop=.30, rise=style==='peak'?1.15:style==='classic'?.76:.68;
 const height=(u,v)=>{const x=2*u-1,z=2*v-1;
 let h=style==='barrel'?Math.sqrt(Math.max(0,1-x*x)) : style==='dome'?Math.sqrt(Math.max(0,1-x*x))*Math.sqrt(Math.max(0,1-z*z)) : Math.pow(1-Math.max(Math.abs(x),Math.abs(z)),style==='peak'?1.55:1.15);
 return eave+rise*h + .006*Math.sin(u*95+v*7)*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);};
 surface(g,(u,v)=>[(u-.5)*(W+.08),height(u,v),(v-.5)*(D+.08)],fabric,40,24,[W+.08,D+.08]);
 if(style==='barrel') for(const v of [0,1]) surface(g,(u,t)=>[(u-.5)*(W+.08),eave+(height(u,v)-eave)*t,(v-.5)*(D+.08)],fabric,40,12,[W+.08,rise]);
 for(const x of [-W/2,W/2])for(const z of [-D/2,D/2]){
 rod(g,[x,.02,z],[x,eave,z],.021,steel);
 const foot=mesh(g,new T.BoxGeometry(.12,.015,.12),steel);foot.position.set(x,.005,z);
 for(const y of [.15,H*.53,eave-.35]){const collar=mesh(g,new T.BoxGeometry(.052,.065,.052),steel);collar.position.set(x,y,z);}
 }
 // Deep fabric valances with soft folds and raised stitched hems.
 for(let side=0;side<4;side++){
 const alongX=side<2,sign=side%2?1:-1,L=alongX?W+.08:D+.08;
 surface(g,(u,v)=>{const fold=.008*Math.sin(u*65)*Math.sin(Math.PI*v),a=(u-.5)*L,b=sign*((alongX?D:W)/2+.04+fold);return alongX?[a,eave-v*drop,b]:[b,eave-v*drop,a];},fabric,48,6,[L,drop]);
 for(const y of [eave-.015,eave-drop+.012]) rod(g,alongX?[-L/2,y,sign*(D/2+.045)]:[sign*(W/2+.045),y,-L/2],alongX?[L/2,y,sign*(D/2+.045)]:[sign*(W/2+.045),y,L/2],.007,seam);
 const z=sign*(alongX?D:W)/2;
 const pt=(a,y)=>alongX?[a,y,z]:[z,y,a];
 rod(g,pt(-L/2,eave-.09),pt(L/2,eave-.09),.015,steel);
 for(let i=0;i<4;i++){let a=-L/2+i*L/4,b=a+L/4;rod(g,pt(a,eave-.13),pt(b,eave-.43),.009,steel);rod(g,pt(a,eave-.43),pt(b,eave-.13),.009,steel);}
 }
 // Curved roof ribs and subtle seams define stretched fabric.
 for(const v of [0,.25,.5,.75,1]){const points=[];for(let i=0;i<=40;i++){const u=i/40;points.push(new T.Vector3((u-.5)*(W+.08),height(u,v)-.016,(v-.5)*(D+.08)));}mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points),40,.008,5,false),steel);}
 return g;
}
function groundTexture(kind){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');let seed=123;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};x.fillStyle={grass:'#6d7850',concrete:'#b6b1a5',asphalt:'#55585a',carpet:'#4a4f5c',wood:'#8a6a47'}[kind]||'#a9a6a0';x.fillRect(0,0,512,512);for(let i=0;i<42000;i++){const a=rand()*512,b=rand()*512,v=Math.floor(rand()*70);x.fillStyle=kind==='grass'?`rgba(${65+v},${80+v},${32+v/2},.45)`:`rgba(${v>35?255:0},${v>35?255:0},${v>35?255:0},.10)`;x.fillRect(a,b,kind==='grass'?1:kind==='wood'?rand()*40+8:rand()*2+1,kind==='grass'?rand()*7+2:1);}if(kind==='concrete'){x.strokeStyle='#8f8e85';x.lineWidth=2;x.strokeRect(1,1,510,510);}const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(48,48);t.colorSpace=T.SRGBColorSpace;return t;}
const textures=new Map();
let weave;
function fabricWeave() {
 if (weave) return weave;
 const c=document.createElement('canvas'); c.width=c.height=128;
 const ctx=c.getContext('2d'); ctx.fillStyle='#888'; ctx.fillRect(0,0,128,128);
 for(let i=0;i<128;i+=4){ctx.fillStyle='#aaa';ctx.fillRect(i,0,1,128);ctx.fillStyle='#666';ctx.fillRect(0,i,128,1);}
 // Per metre, now that UVs are in metres: about what twelve repeats used to
 // give across a three-metre roof, and the same weave on a 12" valance.
 weave=new T.CanvasTexture(c); weave.wrapS=weave.wrapT=T.RepeatWrapping; weave.repeat.set(4,4); return weave;
}
// ---- City backdrop -------------------------------------------------------
// Facades are a tiled canvas texture rather than thousands of window meshes:
// one shared material keeps draw calls flat while carrying glass, blinds,
// slab bands and lit interiors. HAZE is shared by the sky gradient and the
// fog so the skyline fades into the horizon instead of ending on a hard edge.
const HAZE = '#d6e0e1';
const CITY_TILE = 12.8;
const cityRandom = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
let sky;
function skyTexture() {
 if (sky) return sky;
 const c = document.createElement('canvas'); c.width = 16; c.height = 256;
 const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
 g.addColorStop(0, '#6d97c8'); g.addColorStop(.34, '#9dbcd9');
 g.addColorStop(.48, HAZE); g.addColorStop(.52, HAZE); g.addColorStop(1, '#c9d3d4');
 x.fillStyle = g; x.fillRect(0, 0, 16, 256);
 sky = new T.CanvasTexture(c);
 sky.mapping = T.EquirectangularReflectionMapping;
 sky.colorSpace = T.SRGBColorSpace;
 return sky;
}
let facade;
function facadeTextures() {
 if (facade) return facade;
 const size = 512, cells = 4, cell = size / cells;
 const skin = document.createElement('canvas'); skin.width = skin.height = size;
 const glow = document.createElement('canvas'); glow.width = glow.height = size;
 const c = skin.getContext('2d'), l = glow.getContext('2d');
 const rand = cityRandom(7414);
 c.fillStyle = '#938f86'; c.fillRect(0, 0, size, size);
 l.fillStyle = '#000000'; l.fillRect(0, 0, size, size);
 for (let i = 0; i < 12000; i++) { const v = Math.floor(rand() * 46); c.fillStyle = `rgba(${v},${v},${v},.05)`; c.fillRect(rand() * size, rand() * size, 2, 2); }
 for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
  const x = i * cell, y = j * cell;
  c.fillStyle = '#837f76'; c.fillRect(x, y + cell - 9, cell, 9);
  const wx = x + cell * .17, wy = y + cell * .15, ww = cell * .66, wh = cell * .58;
  c.fillStyle = '#4a4844'; c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
  const lit = rand() < .32, drop = rand() < .4 ? wh * (.16 + rand() * .32) : 0;
  const glass = c.createLinearGradient(wx, wy, wx, wy + wh);
  if (lit) { const w = 198 + Math.floor(rand() * 54);
   glass.addColorStop(0, `rgb(${w},${w - 30},${w - 92})`); glass.addColorStop(1, `rgb(${w - 66},${w - 82},${w - 108})`); }
  else { glass.addColorStop(0, '#8298a6'); glass.addColorStop(.55, '#44545f'); glass.addColorStop(1, '#2e3a43'); }
  c.fillStyle = glass; c.fillRect(wx, wy, ww, wh);
  if (drop) { c.fillStyle = 'rgba(228,224,212,.72)'; c.fillRect(wx, wy, ww, drop); }
  if (lit) { l.fillStyle = `rgba(255,212,148,${(.55 + rand() * .4).toFixed(3)})`; l.fillRect(wx, wy + drop, ww, wh - drop); }
  c.fillStyle = '#3d3b38'; l.fillStyle = '#000000';
  for (const ctx of [c, l]) { ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); ctx.fillRect(wx, wy + wh * .47, ww, 3); }
  c.fillStyle = '#bcb7ac'; c.fillRect(wx - 4, wy + wh + 3, ww + 8, 4);
 }
 const wrap = (canvas) => { const t = new T.CanvasTexture(canvas); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; return t; };
 facade = { skin: wrap(skin), glow: wrap(glow) };
 return facade;
}
// Scale each box face's UVs so window spacing stays constant in metres
// whatever the building's size: one material, no per-building texture clones.
function tileBoxUv(geo, w, h, d) {
 const uv = geo.attributes.uv, faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
 for (let f = 0; f < 6; f++) { const [fw, fh] = faces[f];
  for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * fw / CITY_TILE, uv.getY(i) * fh / CITY_TILE); } }
 uv.needsUpdate = true;
}
function makeCity(parent) {
 const { skin, glow } = facadeTextures();
 const city = new T.Group(); city.name = 'city'; parent.add(city);
 const wall = new T.MeshStandardMaterial({ map: skin, emissiveMap: glow, emissive: new T.Color('#ffe7c4'), emissiveIntensity: .9, roughness: .63, metalness: .05 });
 const skins = [wall, wall, material('#6b6862'), material('#6b6862'), wall, wall];
 const cap = material('#c9c4b8'), plinth = material('#4b4844'), kit = material('#8d8a83');
 // Backdrop geometry is never a shadow caster or receiver: it sits far outside
 // every shadow camera, so leaving the flags off keeps the shadow pass cheap.
 const prop = (geo, mat, x, y, z, ry = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; city.add(m); return m; };
 const rand = cityRandom(20260917);
 // radius, count, base height, height spread — taller and denser further back.
 const rings = [[40, 14, 6, 8], [56, 16, 9, 14], [72, 18, 12, 16]];
 for (let r = 0; r < rings.length; r++) {
  const [radius, count, low, spread] = rings[r];
  for (let i = 0; i < count; i++) {
   const angle = ((i + (r % 2) * .5) / count) * Math.PI * 2 + (rand() - .5) * .09;
   const dist = radius + rand() * 5;
   const x = Math.cos(angle) * dist, z = Math.sin(angle) * dist;
   const face = Math.atan2(-x, -z) + (rand() - .5) * .2;
   const w = 5.5 + rand() * 7, d = 5.5 + rand() * 6, h = low + rand() * spread;
   const shell = (bw, bh, bd, base) => {
    const geo = new T.BoxGeometry(bw, bh, bd); tileBoxUv(geo, bw, bh, bd);
    prop(geo, skins, x, base + bh / 2, z, face);
    prop(new T.BoxGeometry(bw + .3, .38, bd + .3), cap, x, base + bh + .19, z, face);
    return base + bh + .38;
   };
   let top = shell(w, h, d, 0);
   prop(new T.BoxGeometry(w + .16, 1.7, d + .16), plinth, x, .85, z, face);
   if (h > 13 && rand() < .55) top = shell(w * (.5 + rand() * .2), 4 + rand() * 7, d * (.5 + rand() * .2), top);
   if (r > 1) continue; // Rooftop clutter is invisible through the haze further out.
   const off = Math.min(w, d) * .25;
   if (rand() < .45) {
    const ox = (rand() - .5) * off * 2, oz = (rand() - .5) * off * 2;
    prop(new T.BoxGeometry(1.5, .5, 1.5), kit, x + ox, top + .25, z + oz, face);
    prop(new T.CylinderGeometry(.6, .6, 1.5, 10), kit, x + ox, top + 1.25, z + oz);
    prop(new T.ConeGeometry(.72, .5, 10), kit, x + ox, top + 2.25, z + oz);
   }
   if (rand() < .5) for (const s of [-1, 1]) prop(new T.BoxGeometry(1.1, .55, .9), kit, x + s * off, top + .27, z + (rand() - .5) * off, face);
   if (h > 18) prop(new T.CylinderGeometry(.04, .06, 3.4, 6), kit, x, top + 1.7, z);
  }
 }
 return city;
}
// ---- Indoor exhibition hall ---------------------------------------------
// A convention hall is a white box, and at the size of one the only parts a
// booth ever sees are the floor, the far walls and — barely — the ceiling.
// So it is drawn as exactly that: five inward-facing planes, no geometry in
// between. BackSide on a single box would have done it in one mesh, but the
// ceiling has to be switchable on its own (30 feet up is usually out of
// frame, and drawing it costs a wash of grey over everything).
const HALL_SPAN = 110; // metres across. Far enough that the walls read as distance, not as a room.
export function makeHall(g, b) {
 const spec = hallSpec(b);
 const hall = new T.Group(); hall.name = 'exhibition-hall'; g.add(hall);
 const ceiling = spec.ceiling * IN;
 // Hall surfaces are lit, not lighting: they receive shadow so a booth's
 // floor shadow lands on the aisle, and cast none, because a 110m plane in a
 // shadow camera is a shadow map spent on nothing.
 const surface = (color, w, h, pos, rot) => {
  const m = new T.Mesh(new T.PlaneGeometry(w, h), material(color, { side: T.FrontSide }));
  m.position.set(...pos); m.rotation.set(...rot); m.receiveShadow = true; m.castShadow = false;
  hall.add(m); return m;
 };
 // No floor of its own: `environment-ground` is already a 180m plane the
 // ground-texture machinery owns, and a second floor just under it would be
 // a plane nobody ever sees. The hall is its walls and its ceiling.
 const half = HALL_SPAN / 2;
 for (const [x, z, ry] of [[0, -half, 0], [0, half, Math.PI], [-half, 0, Math.PI / 2], [half, 0, -Math.PI / 2]])
  surface('#eceae5', HALL_SPAN, ceiling, [x, ceiling / 2, z], [0, ry, 0]);
 if (spec.showCeiling)
  surface('#c9c7c3', HALL_SPAN, HALL_SPAN, [0, ceiling, 0], [Math.PI / 2, 0, 0]);
 return hall;
}
// A neighbouring art-show booth: the same three white walls, no canopy. What
// a booth beside yours actually looks like indoors, and cheap enough that a
// hall full of them stays one draw call each.
function neighborArtBooth(g, n, b) {
 const booth = new T.Group(); booth.name = 'neighbor-' + n.side; g.add(booth);
 booth.position.set(n.x * IN, 0, n.z * IN);
 // Turned to face its own aisle. Without this the booth behind opened towards
 // this one, so the view over the back wall was into a stranger's stand.
 booth.rotation.y = ((n.rotation || 0) * Math.PI) / 180;
 // The neighbour is this booth's size: a hall sells a row of equal pitches.
 const W = n.width * IN, D = n.depth * IN, H = (b.walls?.back?.height || 144) * IN;
 const skin = material('#f1efea');
 const wall = (w, x, z, ry) => { const m = mesh(booth, new T.BoxGeometry(w, H, .055), skin); m.position.set(x, H / 2, z); m.rotation.y = ry; };
 wall(W, 0, -D / 2, 0);
 wall(D, -W / 2, 0, Math.PI / 2);
 wall(D, W / 2, 0, Math.PI / 2);
 return booth;
}
export function environment(scene,g,b){const kind=b.ground||'studio',setting=b.horizon||'studio';
 if(setting==='studio'){scene.background=new T.Color('#b5b4b0');scene.fog=null;}
 else{scene.background=skyTexture();scene.fog=new T.Fog(HAZE,setting==='urban'?40:24,setting==='urban'?92:75);}
 if(!textures.has(kind)&&kind!=='studio')textures.set(kind,groundTexture(kind));
 const floor=mesh(g,new T.PlaneGeometry(180,180),material(kind==='studio'?'#a9a6a0':'#ffffff',{map:textures.get(kind)||null}));floor.name='environment-ground';floor.rotation.x=-Math.PI/2;floor.position.y=-.045;
 if(kind!=='studio'){floor.material.bumpMap=textures.get(kind);floor.material.bumpScale=kind==='grass'?.025:.008;}
 if(setting==='park'&&!b.surroundAsset)for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,dist=19+(i%4)*3,x=Math.cos(angle)*dist,z=Math.sin(angle)*dist;const trunk=mesh(g,new T.CylinderGeometry(.17,.24,3.5,7),material('#625746'));trunk.position.set(x,1.7,z);for(let j=0;j<3;j++){const crown=mesh(g,new T.SphereGeometry(1.6+j*.12,12,8),material(['#687951','#75855b','#536b48'][j]));crown.position.set(x+Math.sin(i+j)*.75,3.8+j*.65,z+Math.cos(i+j)*.65);crown.scale.y=1.1;}}
 if(setting==='urban'&&!b.surroundAsset)makeCity(g);
 // Indoors the hall is the horizon: no sky, no fog, and the surrounding
 // booths are walls rather than canopies.
 const hall = isArtShow(b) && hallSpec(b).on;
 if(hall){scene.background=new T.Color('#e4e2dd');scene.fog=null;makeHall(g,b);}
 for(const n of neighborPlacements(b)){
 if(hall){neighborArtBooth(g,n,b);continue;}
 const t=makeTent(n.width*IN,n.depth*IN,96*IN,'classic');t.name='neighbor-'+n.side;
 t.position.set(n.x*IN,0,n.z*IN);t.rotation.y=((n.rotation||0)*Math.PI)/180;g.add(t);
 const wall=mesh(t,new T.BoxGeometry(3,2.2,.04),material('#d6d1c5'));wall.position.set(0,1.1,-1.5);
 }
}
