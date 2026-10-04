# Z-Fighting Fixes — Summary & Future Paths

**Date**: 2026-03-16
**Branch**: `claude/fix-z-fighting-DR139`
**Version**: 0.4.48

---

## What Was Done

### Root Causes Identified

1. **polygonOffset factor is useless for orthographic cameras.** The ortho camera
   views axis-aligned box faces head-on, giving a depth slope of ~0. Since
   `polygonOffsetFactor` multiplies by slope, it contributes nothing. Only
   `polygonOffsetUnits` has any effect.

2. **Camera near/far wasted 85% of the depth buffer.** The old range (near=1,
   far=60) spanned 59 units, but geometry only occupies z=0–8. On mobile GPUs
   with 16-bit depth buffers, surfaces 0.05 apart got as few as ~55 distinct
   depth values — far too few to resolve coplanar surfaces.

3. **polygonOffset units are GPU-implementation-defined.** Even after fixing
   factor→0 and adding units, the actual depth shift per unit varies across
   GPUs. Some devices still z-fight.

4. **Furniture items were coplanar.** The sofa back and bookshelf shared z=7.2
   (front face 6.95). In narrow rooms the sofa extends into the bookshelf's
   x-range, causing z-fighting between two furniture-layer objects.

5. **Bookshelf back panels were behind the wall.** At z=7.65, their front face
   (7.55) was 0.55 units behind the back wall inner face (z=7.0), causing
   severe z-fighting with the wall.

6. **Eight furniture items had front faces at z=7.0 exactly**, coplanar with
   the back wall (fireplace, counter, dresser, piano, cabinet, speakers).

### Fixes Applied

- **3-layer depth system** (`DepthLayer`: structural / furniture / detail)
  with physical z-nudge (0 / −0.03 / −0.06) as the primary GPU-independent
  defence, and `polygonOffset` units (8/4/0, factor=0) as secondary.
- **Camera near/far tightened** from (1, 60) to (23, 36) — 4.5× better depth
  precision. Near=23 (clip at z=−3) allows the bathroom door to swing open.
- **Sofa/bookshelf separation**: sofa back moved to z=7.15; sofa width clamped
  to `min(5, roomWidth − 3)` so it doesn't overlap the bookshelf.
- **All z=7.5 furniture shifted to z=7.45** (front face 6.95 instead of 7.0).
- **Bookshelf back panels** moved from z=7.65 to z=6.95 (in front of wall).
- **detail() helper** and **applyDepthLayer()** for consistent depth layering.
- **Staircase steps, landing, bathroom tiles** marked as `'structural'`.

---

## Possible Paths Forward

### Option A: Extend house depth with z-lanes

Increase `HOUSE_DEPTH` from 8 to ~24. Spread furniture across dedicated
z-lanes with walkable gaps between them (back-to-front: couch → gap → lamp →
gap → plant → gap → bookshelf → gap → painting → gap → front wall).

**Pros:**
- Eliminates z-fighting by design — items are on genuinely separate z-planes
  with large (2+ voxel) gaps.
- Named lane constants replace ~200 hardcoded z values, making future furniture
  placement trivial.
- Staircases steps can use natural depth instead of compressed 0.75-unit steps.

**Cons:**
- **The current front-on orthographic camera cannot show depth.** Items at
  different z-lanes that share the same x,y will visually overlap on screen
  regardless of z separation. The z-lanes solve z-fighting but don't change the
  visual appearance. This is a fundamental limitation of the camera angle.
- Large scope: ~200 hardcoded z values across 9 room builders, plus camera,
  pathfinder, character positions, staircase, room centers, persistence, and
  tests all need updating.
- Camera near/far widens (e.g. 23→56), *reducing* depth-buffer precision by
  ~2×, partially undoing the precision gains from the current fix. (Though with
  items far apart, this matters less.)
- Saved character positions (z=4) become stale — need migration or snap-to-room.

### Option B: Switch to an isometric/angled camera

Change the camera from front-on orthographic to a 3/4 or isometric view so the
player can actually see depth into the rooms.

**Pros:**
- Makes z-lanes (Option A) visually meaningful — the player sees furniture at
  different depths.
- Classic dollhouse/Sims/Habbo Hotel aesthetic.
- Z-fighting becomes nearly impossible with visible depth separation.

**Cons:**
- Fundamental visual redesign — every piece of furniture needs to look good from
  the new angle. The current front-on layout was designed for a flat view.
- Character animations, thought bubble positioning, UI chrome all need rework.
- Largest scope of all options.

### Option C: Audit remaining coplanar conflicts (current approach)

Keep the current depth and camera, but systematically audit every room at
minimum and maximum sizes to find remaining coplanar pairs.

**Pros:**
- Smallest scope — targeted fixes to specific furniture pairs.
- No camera or architectural changes needed.
- The 3-layer system + z-nudge + tightened near/far already handles most cases.

**Cons:**
- Whack-a-mole: new furniture additions can reintroduce z-fighting if the
  developer doesn't carefully check z positions.
- Narrow rooms compress furniture into overlapping x-ranges, creating new
  coplanar conflicts that didn't exist at wider sizes.

---

## Lessons Learned

### 1. polygonOffset factor does nothing for orthographic + axis-aligned geometry

The `factor` parameter multiplies by the maximum depth slope of the polygon.
For boxes viewed straight-on by an ortho camera, every visible face has slope
≈ 0. Only `units` (which adds a fixed depth-buffer step) has any effect. Set
`factor = 0` and rely on `units` alone.

### 2. Physical z-nudge is more reliable than polygonOffset

`polygonOffset` units are GPU-implementation-defined — the actual depth shift
per unit varies. A physical position offset (e.g. −0.03 in world space) gives
a deterministic, GPU-independent depth separation that can be reasoned about
mathematically.

### 3. Tighten near/far to the geometry range

Depth buffers distribute precision across the near-to-far range. A range of
(1, 60) wastes 85% of precision on empty space. Tightening to (23, 36) gave a
4.5× precision improvement for free. Always calculate the actual z-extent of
your scene and set near/far accordingly. Leave a margin for animated geometry
(like the bathroom door swinging to z≈−2).

### 4. Front faces at exactly the wall z-position will z-fight

Any furniture with `position.z − size.z/2 = 7.0` (the back wall inner face)
is coplanar with the wall. Use `z = 7.45` for size-1 items (front face 6.95)
instead of `z = 7.5` (front face 7.0). The formula:
```
centerZ = 6.95 + sizeZ / 2
```

### 5. Furniture behind the wall is invisible and z-fights

Any item with front face > 7.0 is occluded by the back wall. The bookshelf
back panels at z=7.65 (front face 7.55) were completely hidden and z-fighting
with the wall. Always verify `position.z − size.z/2 ≤ 7.0`.

### 6. Coplanar items at different x-ranges can overlap in narrow rooms

The sofa (5 units wide, centered) and bookshelf (at xMin+1.5) don't overlap in
wide rooms, but in narrow rooms the sofa extends into the bookshelf's x-range.
Since they shared z=7.2, they z-fought. Fix: either separate their z positions
or clamp widths to prevent x-overlap.

### 7. Test at minimum room sizes, not just default

Z-fighting bugs often only appear when rooms are at minimum width, because
furniture that doesn't overlap in x at default sizes starts overlapping when
compressed. Always verify geometry at both minimum and maximum room dimensions.
