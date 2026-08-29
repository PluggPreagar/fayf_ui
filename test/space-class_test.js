// test/space-class_test.js -- too-much-space mechanism 2: excess() ->
// classify() -> conditional resolve() -> render(), reactive to container
// resize (TODO-5). Fixture: space-class.html.
const tr = new TestRunner({ stopOnError: false });

tr.addBlock('space-class: resize reclassifies live', (r) => {
  // island is a fixed-size box (see space-class.html) -- its natural
  // footprint is a known constant, not a text-metric measurement, so the
  // container heights below can be computed directly with no risk of
  // web-font-load timing skewing the numbers.
  const naturalH = 40;
  const padY = 24; // space-class.html's #stage: padding:12px top+bottom
  const spaciousHeight = naturalH + padY + 96 + 20; // comfortably over spacious_min
  const baseHeight = naturalH + padY + 96 - 20;     // comfortably under it

  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const stage = document.getElementById('stage');
     r.check(!!stage, 'stage mounted');
     r.check(stage.dataset.spaceClass === 'spacious', 'starts spacious in its default 460px-tall panel',
       `dataset.spaceClass=${stage.dataset.spaceClass}`);
     r.check(!!stage.querySelector('.bx-tint2'), 'spacious variant rendered initially (tint2 present)');
   })
   .run(() => { document.getElementById('stage').style.height = `${baseHeight}px`; })
   .waitFor(() => document.getElementById('stage').dataset.spaceClass === 'base', 2000, 50,
     'reclassifies to base on shrink')
   .run(() => {
     r.check(!document.getElementById('stage').querySelector('.bx-tint2'), 'base variant rendered, no tint2');
   })
   .run(() => { document.getElementById('stage').style.height = `${spaciousHeight}px`; })
   .waitFor(() => document.getElementById('stage').dataset.spaceClass === 'spacious', 2000, 50,
     'reclassifies back to spacious on grow')
   .run(() => {
     r.check(!!document.getElementById('stage').querySelector('.bx-tint2'), 'spacious variant rendered again (tint2 present)');
   });
});

tr.runBlocks();
