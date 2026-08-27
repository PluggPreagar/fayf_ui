suite('smoke');
assert('page served with harness', document.getElementById('smoke').textContent, 'fayf_ui');
harnessFinish();
