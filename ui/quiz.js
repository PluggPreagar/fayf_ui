// ui/quiz.js -- quiz-specific controller. Page-mount layer, same
// bucket as ui/actions.js -- not part of the box/vocabulary model.

export function grade(answers, selectedIndices) {
  const correct = new Set(answers.map((a, i) => i).filter(i => answers[i].correct));
  const selected = new Set(selectedIndices);
  if (correct.size !== selected.size) return false;
  for (const i of correct) if (!selected.has(i)) return false;
  return true;
}
