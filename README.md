# Pontoon

Floating pontoons and their guide piles, designed to Australian Standards, in the browser.
Mounted in the Project_Management site at `/pontoon/`, behind the site sign-in.

Pick the pontoon type and the boat, and the app sizes the rest: the walkway and finger
widths that pass every floating check, the lightest guide pile from the catalogue that
passes, its embedment, and the gangway. Every input has a default, so a first answer
comes from nothing more than the boat length and the number of berths.

## What it designs

| Type | Model |
|---|---|
| Concrete (EPS-cored) | concrete shell on an EPS core, AS 3600 strain-compatibility section |
| Framed | aluminium, steel or timber frame on HDPE floats |
| Modular | HDPE cube floats |
| Wave attenuator | deep ballasted concrete box, Macagno transmission |

Piles: steel CHS (AS 4100, corrosion allowance), precast concrete square or round (AS 3600),
and round timber (AS 1720.1). Ground resistance by Broms with φg from AS 2159.

## The checks

- **AS 3962** loads and limits: dead-load freeboard, flotation reserve, stability load
  (exact heeled equilibrium of the clipped section), opposite chine, 4.5 kN corner load,
  live load, the Cl 4.2 combinations, wind, current, waves, debris and berthing.
- **AS/NZS 1170.0, 1170.2**: return period from design life and importance, regional wind speed.
- **Structure**: each module as a beam on the hydrostatic (Winkler) spring, by finite elements.
- **Piles**: elastic pile on a Winkler subgrade for M* and deflection; Broms for capacity.
- **Motion**: heave, pitch, roll and flexural modes with added mass, arm sway and pile modes,
  with a warning when a period sits near the design wave period.

Every check carries its clause, value, limit, ratio and the working with the numbers in.
The Report button prints all of it.

## Verification

`engine/verify.js` runs the engine against 18 independent closed-form answers (beam theory,
Hetényi, free–free vibration, wall-sided formula, linear wave theory, AS 4100, AS 3600, Broms,
AS/NZS 1170.2 and AS 2159 tables). They run in the app (Verification tab) and in CI.
Values to confirm before issue are listed in the Design basis tab.

## Revit

**Revit (IFC)** downloads an IFC4 model: pontoon modules and fingers as `IfcSlab`, piles as
`IfcPile`, the gangway as `IfcBeam`, each with a `PT_Design` property set (sizes, levels,
governing ratios). In Revit: Insert → Link IFC.

## Running it

```bash
pip install -r requirements-dev.txt
PONTOON_DEV_ACCOUNT=me python -m pontoon_app   # http://127.0.0.1:5058
node --test tests/engine.test.mjs              # engine
python -m pytest -q                            # server (also runs the engine tests)
```

In the site, the app lives in `pontoon_app/` and is mounted by `app/pontoon_door.py`.
