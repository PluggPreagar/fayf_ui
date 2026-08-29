// test/space-class_test.js -- too-much-space mechanism 2: excess() ->
// classify() -> conditional resolve() -> render(), reactive to container
// resize (TODO-5). Fixture: space-class.html.
const tr = new TestRunner({ stopOnError: false });

tr.addBlock('space-class: resize reclassifies live across all three bands', (r) => {
  // island is a fixed-size box (see space-class.html) -- its natural
  // footprint is a known constant, not a text-metric measurement, so the
  // container heights below can be computed directly with no risk of
  // web-font-load timing skewing the numbers. Margins keep each height
  // comfortably clear of the compact_max=48 / spacious_min=96 boundaries.
  const naturalH = 40;
  const padY = 24; // space-class.html's #stage: padding:12px top+bottom
  const compactHeight = naturalH + padY + 20;  // excess=20  (< 48)
  const cozyHeight = naturalH + padY + 70;     // excess=70  (48..96)
  const spaciousHeight = naturalH + padY + 120; // excess=120 (>= 96)

  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const stage = document.getElementById('stage');
     r.check(!!stage, 'stage mounted');
     r.check(stage.dataset.spaceClass === 'spacious', 'starts spacious in its default 460px-tall panel',
       `dataset.spaceClass=${stage.dataset.spaceClass}`);
     r.check(!!stage.querySelector('.bx-tint2'), 'spacious variant rendered initially (tint2 present)');
   })
   .run(() => { document.getElementById('stage').style.height = `${compactHeight}px`; })
   .waitFor(() => document.getElementById('stage').dataset.spaceClass === 'compact', 2000, 50,
     'reclassifies to compact on shrink')
   .run(() => {
     const stage = document.getElementById('stage');
     r.check(!stage.querySelector('.bx-tint1') && !stage.querySelector('.bx-tint2'), 'compact variant rendered, no tint');
   })
   .run(() => { document.getElementById('stage').style.height = `${cozyHeight}px`; })
   .waitFor(() => document.getElementById('stage').dataset.spaceClass === 'cozy', 2000, 50,
     'reclassifies to cozy on partial grow')
   .run(() => {
     const stage = document.getElementById('stage');
     r.check(!!stage.querySelector('.bx-tint1'), 'cozy variant rendered (tint1 present)');
     r.check(!stage.querySelector('.bx-tint2'), 'cozy variant is not the spacious one (no tint2)');
   })
   .run(() => { document.getElementById('stage').style.height = `${spaciousHeight}px`; })
   .waitFor(() => document.getElementById('stage').dataset.spaceClass === 'spacious', 2000, 50,
     'reclassifies to spacious on full grow')
   .run(() => {
     r.check(!!document.getElementById('stage').querySelector('.bx-tint2'), 'spacious variant rendered again (tint2 present)');
   });
});

tr.runBlocks();
