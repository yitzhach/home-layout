import test from "node:test";
import assert from "node:assert/strict";
import {
  blankProject,
  demoProject,
  DEFAULT_EDGE_COLOR,
  shadowSpec,
  edgeColorOf,
  lightVisible,
  validateProject,
  constrain,
  constrainPanel,
  openSpot,
  PLACEMENT_GAP,
  panelRange,
  boundWarning,
  mismatch,
  homography,
  convex,
  IN,
  neighborPlacements,
  scalePanel,
  MAX_PANELS,
  panelKey,
  wallKeys,
  wallLabel,
  wallSpec,
  isShown,
} from "../src/model.js";
import { hangingGuide } from "../src/guide.js";
import { DEFAULT_IMAGE_EDITS, editedAspect, hasImageEdits, normalizeImageEdits } from "../src/image-edit.js";
test("measured units: a 36 × 48 panel has 3:4 geometry in metres", () => {
  assert.equal(36 * IN, 0.9144);
  assert.equal(48 * IN, 1.2191999999999998);
  assert.ok(Math.abs((36 * IN) / (48 * IN) - 0.75) < 1e-9);
});
test("clamping respects the selected side wall, with visible oversize warnings", () => {
  const p = demoProject();
  p.booth.walls.left.width = 72;
  const a = { ...p.art[0], wall: "left", w: 36, x: 80, y: -5 };
  const c = constrain(p, a);
  assert.equal(c.x, 36);
  assert.equal(c.y, 0);
  assert.equal(boundWarning(p, c), "");
  assert.match(boundWarning(p, { ...c, w: 96 }), /beyond/);
  p.booth.walls.left.enabled = false;
  assert.match(boundWarning(p, c), /hidden/);
});
test("backup round trip preserves data; malformed and nonfinite values are rejected", () => {
  const p = demoProject();
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  for (const bad of [
    { ...p, schema: 2 },
    { ...p, ambient: NaN },
    {
      ...p,
      assets: { bad: { data: "https://example.com", width: 1, height: 1 } },
    },
    { ...p, art: [{ ...p.art[0], thickness: -1 }] },
  ])
    assert.throws(() => validateProject(bad));
});
test("image aspect mismatch is detected without changing original data", () => {
  const p = demoProject();
  p.assets.test = {
    data: "data:image/png;base64,eA==",
    width: 300,
    height: 400,
  };
  const a = { ...p.art[0], asset: "test", w: 36, h: 48 };
  assert.equal(mismatch(p, a), false);
  assert.equal(mismatch(p, { ...a, h: 36 }), true);
  assert.equal(p.assets.test.data, "data:image/png;base64,eA==");
});
test("projective photo mapping maps all four corners accurately", () => {
  const q = [
      [10, 25],
      [200, 5],
      [180, 290],
      [30, 240],
    ],
    f = homography(q);
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].forEach((uv, i) => {
    f(...uv).forEach((v, j) => assert.ok(Math.abs(v - q[i][j]) < 1e-8));
  });
  assert.equal(convex(q), true);
  assert.equal(convex([q[0], q[2], q[1], q[3]]), false);
});
test("guide escapes titles and documents wall reference coordinates", () => {
  const p = demoProject();
  p.name = "<script>alert(1)</script>";
  p.art[0].title = "<img onerror=bad>";
  const g = hangingGuide(p);
  assert.ok(!g.includes("<script>alert"));
  assert.ok(g.includes("&lt;img"));
  assert.match(g, /bottom-left/);
  assert.match(g, /not hook positions/);
});
test('environment settings round trip; legacy projects and invalid options',()=>{
 const p=blankProject();p.booth.tentStyle='barrel';p.booth.ground='grass';p.booth.horizon='park';p.booth.neighbors=true;
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 for(const key of ['tentStyle','ground','horizon','neighbors'])delete p.booth[key];
 assert.deepEqual(validateProject(p),p);
 p.booth.tentStyle='unknown';assert.throws(()=>validateProject(p));
});

test("neighbor gaps use footprint edges, corners leave the named side open, rear is independent", () => {
  const p=blankProject(); p.booth.neighbors=true; p.booth.neighborGap=36; p.booth.neighborRear=true;p.booth.rearGap=48;
  assert.deepEqual(neighborPlacements(p.booth), [
    {side:"left",x:-156,z:0,rotation:0,width:120,depth:120},
    {side:"right",x:156,z:0,rotation:0,width:120,depth:120},
    // Turned around: the booth behind opens onto the next aisle, so what you
    // see over your back wall is the back of a booth, not the inside of one.
    {side:"rear",x:0,z:-168,rotation:180,width:120,depth:120},
  ]);
  // A neighbour is this booth's size, so a 10 x 20 stand is measured against
  // 10 x 20 neighbours rather than two hardcoded 10 x 10 ones — and the gap,
  // which is measured to the neighbour's centre, follows.
  p.booth.width=240;
  assert.equal(neighborPlacements(p.booth)[0].width,240,"the neighbour grew with the booth");
  assert.equal(neighborPlacements(p.booth)[0].x,-276,"and the gap is still 36in edge to edge");
  assert.equal(
    Math.abs(neighborPlacements(p.booth)[0].x) - 240/2 - 240/2, 36,
    "edge to edge, stated as the arithmetic it comes from",
  );
  p.booth.width=120;
  p.booth.neighborLayout="corner-left";
  assert.deepEqual(neighborPlacements(p.booth).map(n=>n.side),["right","rear"]);
  p.booth.neighborLayout="corner-right";
  assert.deepEqual(neighborPlacements(p.booth).map(n=>n.side),["left","rear"]);
  p.booth.neighborLayout="island";assert.deepEqual(neighborPlacements(p.booth),[]);
  p.booth.neighbors=false;assert.deepEqual(neighborPlacements(p.booth),[]);
});
test("legacy backups need no new fields; outside signage and labels round trip", () => {
  const p=demoProject();
  for(const key of ["neighborLayout","neighborGap","neighborRear","rearGap"])delete p.booth[key];
  assert.equal(validateProject(p),p);
  Object.assign(p.art[0],{kind:"sign",face:"outside",artistName:"Isaac Anderson",city:"Somerset, KY",medium:"Mixed media"});
  Object.assign(p.art[1],{kind:"label",face:"inside",w:4,h:2.5,price:"$400"});
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  for(const [key,val] of [["neighborGap",-1],["rearGap",NaN],["neighborRear","yes"],["neighborLayout","wrong"],["groundAsset","missing"],["surroundAsset","missing"]]) {
    const bad=structuredClone(p);bad.booth[key]=val;assert.throws(()=>validateProject(bad));
  }
  for(const [key,val] of [["face","roof"],["kind","script"],["artistName",{}],["price","x".repeat(201)]]) {
    const bad=structuredClone(p);bad.art[0][key]=val;assert.throws(()=>validateProject(bad));
  }
});
test("uniform scaling keeps proportions, centers when possible and respects wall bounds", () => {
  const p=demoProject(), a={...p.art[0],face:"outside"};
  const c=scalePanel(p,a,1.2);
  assert.ok(Math.abs(c.w/c.h-a.w/a.h)<1e-10);
  assert.ok(Math.abs(c.x+c.w/2-a.x-a.w/2)<1e-10);
  assert.equal(c.face,"outside");
  assert.equal(boundWarning(p,scalePanel(p,a,100)), "");
  assert.ok(scalePanel(p,a,0).w>=1);
  assert.deepEqual(scalePanel(p,a,NaN),a);
});
test("hanging guide separates inside and outside wall coordinates and escapes labels", () => {
  const p=demoProject();
  Object.assign(p.art[1],{face:"outside",kind:"label",title:"<b>Outside title</b>"});
  const g=hangingGuide(p);
  assert.match(g,/Back wall · inside/);assert.match(g,/Back wall · outside/);
  assert.match(g,/facing the wall from the outside/);
  assert.ok(g.includes("&lt;b&gt;Outside title&lt;/b&gt;"));
  assert.ok(!g.includes("<b>Outside title</b>"));
});

test("non-destructive image adjustments validate and rotated aspect follows the source", () => {
  const p=demoProject();
  p.assets.test={data:"data:image/png;base64,eA==",width:300,height:400,role:"artwork"};
  p.art[0].asset="test";
  p.art[0].edits={...DEFAULT_IMAGE_EDITS,exposure:.5,contrast:12,saturation:-8,temperature:18,tint:-4,rotation:90,flipX:true};
  p.editClipboard=structuredClone(p.art[0].edits);
  assert.equal(validateProject(p),p);
  assert.equal(editedAspect(p.assets.test,p.art[0].edits),400/300);
  assert.equal(hasImageEdits(p.art[0].edits),true);
  assert.deepEqual(normalizeImageEdits(),DEFAULT_IMAGE_EDITS);
  for(const [key,value] of [["exposure",3],["contrast",-101],["rotation",45],["flipY","yes"]]){
    const bad=structuredClone(p);bad.art[0].edits={...bad.art[0].edits,[key]:value};assert.throws(()=>validateProject(bad));
  }
  const badRole=structuredClone(p);badRole.assets.test.role="secret";assert.throws(()=>validateProject(badRole));
});
test("an original asset remains available after its last wall placement is removed", () => {
  const p=demoProject();
  p.assets.original={data:"data:image/png;base64,eA==",width:600,height:400,role:"artwork",name:"work.png"};
  p.art.push({...p.art[0],id:"placed-original",asset:"original"});
  p.art=p.art.filter(a=>a.asset!=="original");
  assert.ok(p.assets.original);
  assert.equal(validateProject(p),p);
});

test("stretch and colored edge materials survive backups and reject invalid data", () => {
  const p = demoProject();
  Object.assign(p.art[0], { stretch: true, edgeColor: "#2356ab", edgeTexture: "concrete" });
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  for (const [key, value] of [["stretch", "yes"], ["edgeColor", "red"], ["edgeTexture", "unknown"]]) {
    const bad = structuredClone(p);
    bad.art[0][key] = value;
    assert.throws(() => validateProject(bad));
  }
});

// The backdrop's two aiming axes. Pan (surroundRotation) has always been
// stored; tilt is new, and the point of this test is the schema-1 rule: a
// backup written before the field existed must still load, so the field is
// optional rather than defaulted into existence by the validator.
test("backdrop tilt round-trips, stays optional, and rejects an out-of-range aim", () => {
  const p = demoProject();
  Object.assign(p.booth, { backdropTilt: -30, surroundRotation: 120, backdropFraming: 25 });
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);

  // A schema-1 backup from before the control shipped.
  const old = structuredClone(p);
  delete old.booth.backdropTilt;
  assert.deepEqual(validateProject(structuredClone(old)), old);

  for (const [key, value] of [
    ["backdropTilt", 46],
    ["backdropTilt", -46],
    ["backdropTilt", "up"],
    // The zoom floor is 25: below that the lens shears the panorama apart.
    ["backdropFraming", 24],
    ["backdropFraming", 101],
  ]) {
    const bad = structuredClone(p);
    bad.booth[key] = value;
    assert.throws(() => validateProject(bad), `${key}=${value} must be rejected`);
  }
});

// Free-standing panels. The schema constraint is the whole reason this was a
// phase: `booth.panels` is optional, so a backup written before it existed
// must open unchanged, and `a.wall` is a widened enum, not a changed one.
test("a schema-1 backup with no panels key still validates", () => {
  const p = demoProject();
  delete p.booth.panels;
  assert.equal(validateProject(p), p);
  // And every helper still answers for the three perimeter walls.
  assert.deepEqual(wallKeys(p), ["back", "left", "right"]);
  assert.equal(wallSpec(p, "back").width, 120);
});

test("a panel round-trips, and art may reference it by key", () => {
  const p = demoProject();
  const panel = { id: "abc", name: "Center panel", width: 72, height: 84, x: 0, z: 12, rotation: 45 };
  p.booth.panels = [panel];
  p.art.push({ id: "art-on-panel", asset: null, title: "On the panel",
    wall: panelKey("abc"), x: 4, y: 30, w: 24, h: 30, thickness: 1.5, offset: 0.75 });
  assert.equal(validateProject(p), p);
  assert.deepEqual(wallKeys(p), ["back", "left", "right", "panel:abc"]);
  assert.equal(wallSpec(p, "panel:abc").width, 72);
  assert.equal(wallSpec(p, "panel:abc").height, 84);
  assert.equal(wallLabel(p, "panel:abc"), "Center panel");
  // A key naming a panel that is gone reads as missing, not as a crash.
  p.booth.panels = [];
  assert.equal(wallSpec(p, "panel:abc"), null);
  assert.match(boundWarning(p, p.art.at(-1)), /no longer exists/);
  assert.deepEqual(constrain(p, p.art.at(-1)), { ...p.art.at(-1) });
});

test("art on a panel is clamped to that panel, not to a booth wall", () => {
  const p = blankProject();
  p.booth.panels = [{ id: "one", width: 36, height: 60, x: 0, z: 0, rotation: 0 }];
  const a = { id: "x", asset: null, title: "t", wall: panelKey("one"),
    x: 200, y: 200, w: 24, h: 30, thickness: 1.5, offset: 0.75 };
  const held = constrain(p, a);
  assert.equal(held.x, 12, "36 wide less a 24 wide panel");
  assert.equal(held.y, 30, "60 tall less a 30 tall panel");
});

test("an invalid panel, or art naming a panel that is absent, is rejected", () => {
  const bad = (mutate) => {
    const p = demoProject();
    mutate(p);
    assert.throws(() => validateProject(p), /not a valid Booth Studio v1 backup/);
  };
  bad((p) => (p.booth.panels = [{ id: "a", width: 4, height: 60, x: 0, z: 0, rotation: 0 }]));
  bad((p) => (p.booth.panels = [{ id: "a", width: 36, height: 60, x: 0, z: 0, rotation: 400 }]));
  bad((p) => (p.booth.panels = [{ id: "a", width: 36, height: 60, x: 0, z: 0 }]));
  // A colon in an id would make "panel:<id>" ambiguous.
  bad((p) => (p.booth.panels = [{ id: "a:b", width: 36, height: 60, x: 0, z: 0, rotation: 0 }]));
  bad((p) => {
    p.booth.panels = [
      { id: "a", width: 36, height: 60, x: 0, z: 0, rotation: 0 },
      { id: "a", width: 36, height: 60, x: 0, z: 0, rotation: 0 },
    ];
  });
  bad((p) => (p.art[0].wall = "panel:missing"));
  bad((p) => (p.booth.panels = Array.from({ length: MAX_PANELS + 1 }, (_, i) =>
    ({ id: "p" + i, width: 36, height: 60, x: 0, z: 0, rotation: 0 }))));
});

test("the hanging guide gives a panel its own elevation and where it stands", () => {
  const p = demoProject();
  p.booth.panels = [{ id: "one", name: "Center panel", width: 72, height: 84, x: -6, z: 18, rotation: 90 }];
  p.art.push({ id: "on-panel", asset: null, title: "Front piece", wall: "panel:one",
    x: 4, y: 30, w: 24, h: 30, thickness: 1.5, offset: 0.75 });
  const g = hangingGuide(p);
  assert.match(g, /Center panel · front · 72 × 84 in/);
  assert.match(g, /standing -6.0″ right \/ 18.0″ forward of centre, turned 90°/);
  assert.match(g, /Front piece/);
  // A panel's empty back face is skipped, the way an empty exterior face is.
  assert.equal(/Center panel · back/.test(g), false);
});

test("a dragged free-standing wall stays inside the footprint", () => {
  const p = demoProject();
  const panel = { id: "one", width: 72, height: 84, x: 0, z: 0, rotation: 0 };
  assert.deepEqual(panelRange(p), { x: p.booth.width / 2, z: p.booth.depth / 2 });
  // Inside the booth, a drag is taken as measured.
  assert.deepEqual(constrainPanel(p, { ...panel, x: -18.5, z: 24 }),
    { ...panel, x: -18.5, z: 24 });
  // Past either edge, it stops at the footprint line rather than walking out
  // of the booth it is furniture for.
  const out = constrainPanel(p, { ...panel, x: 900, z: -900 });
  assert.equal(out.x, p.booth.width / 2);
  assert.equal(out.z, -p.booth.depth / 2);
  // Nothing else about the wall is touched by a move.
  assert.equal(out.width, 72);
  assert.equal(out.rotation, 0);
  // A wider booth gives a longer drag.
  p.booth.width = 240;
  assert.equal(constrainPanel(p, { ...panel, x: 900, z: 0 }).x, 120);
});
test("a placement the app positions never lands on one already there", () => {
  const p = demoProject();
  p.art = [];
  const a = { id: "one", wall: "back", face: "inside", x: 12, y: 30, w: 24, h: 24 };
  // An empty wall takes the spot it was asked for, untouched.
  assert.deepEqual(openSpot(p, a), { ...a });
  // With that spot taken, the next one steps right by its own width plus the
  // gap rather than sitting coplanar with it — which is what flickered.
  p.art = [a];
  const second = openSpot(p, { ...a, id: "two" });
  assert.equal(second.x, 12 + 24 + PLACEMENT_GAP);
  assert.equal(second.y, 30);
  // A row that is full drops to the row below, stepping by the height.
  p.art = [];
  const wide = p.booth.walls.back.width;
  for (let x = 12; x + 24 <= wide; x += 24 + PLACEMENT_GAP)
    p.art.push({ ...a, id: "row-" + x, x });
  const next = openSpot(p, { ...a, id: "three" });
  assert.equal(next.y, 30 - 24 - PLACEMENT_GAP);
  assert.equal(next.x, 12);
  // A wall with no room anywhere gives back the spot it was asked for rather
  // than refusing: an overlap can be dragged apart, a missing panel cannot.
  p.art = [{ ...a, id: "everything", x: 0, y: 0, w: wide, h: p.booth.walls.back.height }];
  assert.deepEqual(openSpot(p, { ...a, id: "four" }), { ...a, id: "four" });
  // A different wall is a different surface, so it is not consulted.
  p.art = [{ ...a, id: "left", wall: "left" }];
  assert.deepEqual(openSpot(p, { ...a, id: "five" }), { ...a, id: "five" });
  // Nor is the other face of the same wall.
  p.art = [{ ...a, id: "outside", face: "outside" }];
  assert.deepEqual(openSpot(p, { ...a, id: "six" }), { ...a, id: "six" });
});

// ---------------------------------------------------------------------------
// The drop shadow, the universal edge colour and a hidden spotlight: three
// optional additions, so the test that matters most is that a backup written
// before any of them existed still opens.

test("a backup with no drop shadow, no universal edge and no light switch still opens", () => {
  const p = blankProject();
  delete p.booth.dropShadow;
  delete p.booth.shadowBehind;
  delete p.booth.shadowUnder;
  delete p.booth.shadowAngle;
  delete p.booth.edgeUniversal;
  delete p.booth.edgeColor;
  for (const l of p.lights) delete l.on;
  assert.doesNotThrow(() => validateProject(structuredClone(p)));
  // And absent means the defaults, everywhere that reads them.
  assert.equal(shadowSpec(p.booth, "behind").on, true);
  assert.equal(shadowSpec(p.booth, "under").on, false);
  assert.equal(edgeColorOf(p.booth, {}), DEFAULT_EDGE_COLOR);
  assert.equal(lightVisible(p.lights[0]), true);
});

test("a backup from the first drop shadow, with its three sliders, still opens", () => {
  const p = blankProject();
  p.booth.dropShadow = { on: true, darkness: 70, distance: 20, softness: 90 };
  assert.doesNotThrow(() => validateProject(structuredClone(p)));
  assert.equal(shadowSpec(p.booth, "behind").opacity, Math.round(70 * 0.81));
});

test("the Photoshop shadows accept their ranges and refuse what is not one", () => {
  const good = blankProject();
  good.booth.shadowBehind = { on: true, opacity: 31, angle: 125, global: true, distance: 0.5, spread: 4, size: 0.8 };
  good.booth.shadowUnder = { on: false, opacity: 100, angle: -180, global: false, distance: 12, spread: 100, size: 0 };
  good.booth.shadowAngle = -45;
  assert.doesNotThrow(() => validateProject(structuredClone(good)));
  // A record with only some fields is a record at the defaults for the rest.
  good.booth.shadowUnder = { on: true };
  assert.doesNotThrow(() => validateProject(structuredClone(good)));
});

test("a drop shadow outside its range, or a light switch that is not a switch, is refused", () => {
  const bad = (change) => {
    const p = structuredClone(blankProject());
    change(p);
    assert.throws(() => validateProject(p));
  };
  bad((p) => (p.booth.dropShadow = { darkness: 101 }));
  bad((p) => (p.booth.dropShadow = { distance: -1 }));
  bad((p) => (p.booth.dropShadow = { on: "yes" }));
  bad((p) => (p.booth.dropShadow = "dark"));
  bad((p) => (p.booth.shadowBehind = { opacity: 101 }));
  bad((p) => (p.booth.shadowBehind = { distance: 13 }));
  bad((p) => (p.booth.shadowUnder = { size: -1 }));
  bad((p) => (p.booth.shadowUnder = { spread: "wide" }));
  bad((p) => (p.booth.shadowUnder = { global: 1 }));
  bad((p) => (p.booth.shadowBehind = { angle: 400 }));
  bad((p) => (p.booth.shadowBehind = []));
  bad((p) => (p.booth.shadowAngle = "up"));
  bad((p) => (p.booth.edgeColor = "black"));
  bad((p) => (p.booth.edgeUniversal = 1));
  bad((p) => (p.lights[0].on = "off"));
});

test("a universal edge colour answers for every work without rewriting any of them", () => {
  const p = blankProject();
  const work = { edgeColor: "#123456" };
  assert.equal(edgeColorOf(p.booth, work), "#123456");
  p.booth.edgeUniversal = true;
  p.booth.edgeColor = "#abcdef";
  assert.equal(edgeColorOf(p.booth, work), "#abcdef");
  assert.equal(work.edgeColor, "#123456", "the work itself is untouched");
  p.booth.edgeUniversal = false;
  assert.equal(edgeColorOf(p.booth, work), "#123456", "so switching the rule off puts it back");
});

test("a hidden spotlight keeps everything that made it worth aiming", () => {
  const p = blankProject();
  const light = p.lights[0];
  const aim = { x: light.x, y: light.y, tx: light.tx, ty: light.ty, power: light.power };
  light.on = false;
  assert.equal(lightVisible(light), false);
  assert.doesNotThrow(() => validateProject(structuredClone(p)));
  for (const [key, value] of Object.entries(aim)) assert.equal(light[key], value);
});

test("a hidden piece, wall or figure is kept, validated, and read as a switched-off wall", () => {
  const p = blankProject();
  p.booth.pedestals = [{ id: "p1", width: 12, depth: 12, height: 44, x: 0, z: 0, rotation: 0, hidden: true }];
  p.booth.panels = [{ id: "w1", width: 48, height: 72, x: 0, z: 0, rotation: 0, hidden: true }];
  p.booth.people = [{ kind: "woman", height: 65, x: 0, z: 30, hidden: true }];
  assert.doesNotThrow(() => validateProject(structuredClone(p)));
  assert.equal(isShown(p.booth.pedestals[0]), false);
  assert.equal(isShown({}), true, "absent means shown, which is what every older backup meant");
  assert.equal(wallSpec(p, "panel:w1").enabled, false, "a hidden wall is measured like a switched-off one");
  assert.match(boundWarning(p, { wall: "panel:w1", x: 0, y: 0, w: 10, h: 10 }), /hidden/);
  for (const [list, bad] of [["pedestals", 1], ["panels", "yes"], ["people", null]]) {
    const q = structuredClone(p);
    q.booth[list][0].hidden = bad;
    assert.throws(() => validateProject(q), `${list}: a hidden that is not a switch is refused`);
  }
});

test("the hanging guide leaves a hidden pedestal off the build sheet", () => {
  const p = blankProject();
  p.booth.pedestals = [
    { id: "p1", name: "Plinth shown", width: 12, depth: 12, height: 44, x: 0, z: 0, rotation: 0 },
    { id: "p2", name: "Plinth hidden", width: 12, depth: 12, height: 44, x: 20, z: 0, rotation: 0, hidden: true },
  ];
  const html = hangingGuide(p);
  assert.match(html, /Plinth shown/);
  assert.doesNotMatch(html, /Plinth hidden/);
});
