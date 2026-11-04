// The calculation engine's tests, run by `node --test` (and from pytest).
// 1. Every closed-form verification in engine/verify.js must pass.
// 2. Each pontoon type analyses with its defaults, and the results behave as physics says.
// 3. The Revit (IFC4) export is well formed and complete.
import test from "node:test";
import assert from "node:assert/strict";
import { CHECKS, runCheck } from "../pontoon_app/static/engine/verify.js";
import { analyse } from "../pontoon_app/static/engine/analyse.js";
import { exportIFC, guid } from "../pontoon_app/static/engine/ifc.js";
import { KINDS } from "../pontoon_app/static/engine/project.js";
import { equilibrium, initial } from "../pontoon_app/static/engine/hydro.js";

for (const c of CHECKS) {
  test(`verify: ${c.name}`, () => {
    const r = runCheck(c);
    assert.ok(r.ok, JSON.stringify(r.rows));
  });
}

const results = Object.fromEntries(KINDS.map((k) => [k, analyse({ type: k })]));

for (const k of KINDS) {
  test(`analyse: ${k} with defaults`, () => {
    const r = results[k];
    assert.ok(r.checks.length >= 15);
    for (const c of r.checks) {
      assert.ok(c.src && c.src.length > 2, `${c.name} cites its source`);
      if (c.ratio !== null) assert.ok(Number.isFinite(c.value), `${c.name} has a value`);
      if (c.ratio !== null && Number.isFinite(c.ratio)) assert.equal(c.pass, c.ratio <= 1 + 1e-9, c.name);
    }
    assert.ok(r.piles.n >= 2 && r.piles.Lreq > 0);
    assert.ok(r.dyn.heave > 0 && r.dyn.roll > 0);
  });
}

test("concrete, framed and attenuator defaults pass every check", () => {
  for (const k of ["concrete", "framed", "attenuator"]) assert.ok(results[k].pass, `${k}: ${results[k].worst?.name}`);
});

test("a heavier deck floats lower", () => {
  const a = results.concrete, b = analyse({ type: "concrete", section: { sdl: 1.0 } });
  const fb = (r) => r.checks.find((c) => c.name === "Freeboard under dead load").value;
  assert.ok(fb(b) < fb(a));
});

test("deeper water or softer ground needs longer piles", () => {
  const a = results.concrete, b = analyse({ type: "concrete", site: { seabed: -7 } });
  assert.ok(b.piles.toe < a.piles.toe);
});

test("equilibrium of a box matches the wall-sided formula at small heel", () => {
  const B = 3, D = 1, gw = 10.05, rects = [{ y0: -B / 2, y1: B / 2, z0: 0, z1: D }];
  const w = gw * B * 0.4, KG = 0.3, yg = 0.02; // draft 0.4 m, G 20 mm off the centreline
  const init = initial(rects, w, KG, gw);
  const eq = equilibrium(rects, w, yg, KG, gw);
  // small heel: tan θ = yg / GM (wall-sided, upright waterplane)
  const expected = Math.atan(yg / init.GM);
  assert.ok(Math.abs(Math.abs(eq.theta) - expected) / expected < 0.02, `${eq.theta} vs ${expected}`);
  assert.ok(Math.abs(init.T - 0.4) < 1e-6);
});

test("IFC export: header, one IfcPile per pile, unique GUIDs", () => {
  for (const k of KINDS) {
    const r = results[k];
    const ifc = exportIFC(r, { author: "test", now: new Date(0) });
    assert.match(ifc, /^ISO-10303-21;/);
    assert.match(ifc, /FILE_SCHEMA\(\('IFC4'\)\)/);
    assert.match(ifc, /END-ISO-10303-21;\s*$/);
    assert.equal((ifc.match(/IFCPILE\(/g) || []).length, r.piles.n);
    const ids = [...ifc.matchAll(/IFC[A-Z]+\('([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(exportIFC(r, { author: "test", now: new Date(0) }), ifc, "deterministic");
  }
  assert.equal(guid("a").length, 22);
  assert.match(guid("a")[0], /[0-3]/);
});

// ------------------------------------------------------------------ phase 2: layouts, moorings, earthquake, AS 3962:2020

const withP = (o) => analyse({ type: "concrete", ...o });

test("layouts: L, T and comb add a spine or head and keep every check sourced", () => {
  const single = results.concrete;
  for (const shape of ["L", "T", "comb"]) {
    const r = withP({ layout: { shape, berths: 30, arms: 3 } });
    assert.equal(r.layout.shape, shape);
    assert.ok(r.layout.totalWalk > (shape === "comb" ? 0 : single.layout.walkLen), `${shape} has more walkway`);
    if (shape === "T") assert.ok(r.layout.head && r.layout.head.modules >= 1);
    else assert.ok(r.layout.spine && r.layout.spine.modules >= 1);
    for (const c of r.checks) assert.ok(c.src, `${shape}: ${c.name} cites its source`);
  }
  const comb = withP({ layout: { shape: "comb", berths: 60, arms: 3 } });
  assert.equal(comb.layout.arms, 3);
  assert.ok(comb.layout.fairway >= 1.5 * comb.vessel.L - 1e-9, "auto arm spacing leaves a 1.5 L fairway");
  assert.ok(comb.checks.some((c) => c.name === "Fairway between arms" && c.pass));
});

test("chain moorings: catenary tension, chain on the bed, anchors in the IFC", () => {
  const r = withP({ mooring: { type: "chains" } });
  assert.equal(r.piles.type, "chains");
  assert.ok(r.piles.mbl / r.piles.gov.T >= 3 - 1e-9, "MBL / T ≥ FOS 3");
  assert.ok(r.piles.chainLen > r.piles.gov.s, "some chain lies on the bed");
  const ifc = exportIFC(r, { author: "test", now: new Date(0) });
  assert.equal((ifc.match(/IFCPILE\(/g) || []).length, 0);
  assert.ok((ifc.match(/\.PAD_FOOTING\./g) || []).length >= 2, "anchor blocks exported");
});

test("earthquake: a stronger hazard factor never lightens the piles", () => {
  const a = withP({ seismic: { on: true, Z: 0.08, site: "De" } }), b = withP({ seismic: { on: true, Z: 0.3, site: "Ee" } });
  const eq = (r) => r.piles.results.find((x) => /Earthquake/.test(x.combo.name));
  assert.ok(eq(a) && eq(b), "earthquake case present");
  assert.ok(eq(b).H >= eq(a).H, "larger kpZ, larger pile load");
  assert.ok(b.piles.Lreq >= a.piles.Lreq - 1e-9);
});

test("AS 3962:2020: accessible berths, gangway slope and width, Table 4.6 displacement", () => {
  const gen = results.concrete, acc = withP({ layout: { accessible: true } });
  assert.equal(gen.layout.slope, 4);
  assert.equal(acc.layout.slope, 8);
  assert.ok(acc.gangway.length >= gen.gangway.length, "accessible gangway is longer");
  assert.ok(acc.layout.gangwayW >= 1.2 && acc.layout.walkW >= 1.8);
  assert.ok(acc.checks.some((c) => /80 %/.test(c.name)));
  assert.ok(gen.vessel.disp >= 12 - 1e-9, "12 m boat at least the Table 4.6 12 t");
  assert.equal(withP({ vessel: { L: 30, kind: "yacht" } }).berth.V, 0.2);
});

test("IFC export carries the detailing: mesh, joint rods, guides", () => {
  const ifc = exportIFC(results.concrete, { author: "test", now: new Date(0) });
  assert.ok(/IFCREINFORCINGMESH\(/.test(ifc), "mesh");
  assert.ok(/\.THREADEDROD\./.test(ifc), "joint rods");
  assert.ok(/Guide G1/.test(ifc), "pile guides");
});
