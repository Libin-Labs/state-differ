import { diffState, type Json, type StateDiff, type StateChange } from '@lp-labs/state-differ';
const input: Json = { a: 1 };
const report: StateDiff = diffState(input, { a: 2 }, { ignoredPaths: [['time']] });
for (const change of report.changes) {
  const item: StateChange = change;
  if (item.kind === 'added') {
    const next: Json = item.after;
    void next;
  }
}
// @ts-expect-error strict JSON excludes undefined.
diffState({ invalid: undefined }, {});
void report;
