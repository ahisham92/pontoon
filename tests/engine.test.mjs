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
