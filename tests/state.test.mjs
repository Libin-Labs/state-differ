import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { diffState } from '../dist/esm/index.js';

test('scalar and root type replacements have explicit before/after fields', () => {
  assert.deepEqual(diffState(1, '1'), {
    equal: false,
    changes: [{ kind: 'replaced', path: [], before: 1, after: '1' }],
  });
  assert.deepEqual(diffState(null, {}).changes[0], {
    kind: 'replaced',
    path: [],
    before: null,
    after: {},
  });
  assert.equal(diffState(-0, 0).equal, true);
});
test('records compare by own structure, ignore key order and emit sorted paths', () => {
  assert.equal(diffState({ a: 1, b: [2] }, { b: [2], a: 1 }).equal, true);
  assert.deepEqual(diffState({ z: true, x: 1 }, { b: 2, x: 3 }).changes, [
    { kind: 'added', path: ['b'], after: 2 },
    { kind: 'replaced', path: ['x'], before: 1, after: 3 },
    { kind: 'removed', path: ['z'], before: true },
  ]);
});
test('arrays compare by index rather than inferred identity with numeric path order', () => {
  const before = Array.from({ length: 12 }, (_, i) => i),
    after = [];
  assert.deepEqual(
    diffState(before, after).changes.map((change) => change.path[0]),
    before.map(String),
  );
  assert.deepEqual(diffState([1, 2], [2, 1, 3]).changes, [
    { kind: 'replaced', path: ['0'], before: 1, after: 2 },
    { kind: 'replaced', path: ['1'], before: 2, after: 1 },
    { kind: 'added', path: ['2'], after: 3 },
  ]);
});
test('ignored segment paths suppress encountered subtrees including the root', () => {
  const before = { user: { name: 'a', time: 1 }, version: 1 };
  const after = { user: { name: 'b', time: 2 }, version: 1 };
  assert.deepEqual(diffState(before, after, { ignoredPaths: [['user', 'time']] }).changes, [
    { kind: 'replaced', path: ['user', 'name'], before: 'a', after: 'b' },
  ]);
  assert.equal(diffState(before, after, { ignoredPaths: [['user']] }).equal, true);
  assert.equal(diffState(before, after, { ignoredPaths: [[]] }).equal, true);
});
test('segment arrays avoid delimiter and JSON pointer escaping ambiguity', () => {
  const result = diffState(
    { 'a/b': { '~': 1 }, a: { b: 2 } },
    { 'a/b': { '~': 3 }, a: { b: 4 } },
    { ignoredPaths: [['a/b', '~']] },
  );
  assert.deepEqual(result.changes, [{ kind: 'replaced', path: ['a', 'b'], before: 2, after: 4 }]);
});
test('whole-subtree additions/replacements do not redact ignored descendants', () => {
  const result = diffState({}, { a: { ignored: 1 } }, { ignoredPaths: [['a', 'ignored']] });
  assert.deepEqual(result.changes, [{ kind: 'added', path: ['a'], after: { ignored: 1 } }]);
});
test('emitted values and paths are detached from inputs and later comparisons', () => {
  const before = { a: { x: [1] } },
    after = {};
  const result = diffState(before, after);
  result.changes[0].before.x.push(2);
  result.changes[0].path.push('bad');
  assert.deepEqual(before, { a: { x: [1] } });
  assert.deepEqual(diffState(before, after).changes[0].path, ['a']);
});
test('shared acyclic references are copied while cycles are rejected', () => {
  const value = { n: 1 };
  assert.equal(diffState({ a: value, b: value }, { a: { n: 1 }, b: { n: 1 } }).equal, true);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => diffState(cyclic, {}), /Cyclic/);
});
test('strict JSON rejects exotic values, sparse arrays and extra properties', () => {
  const extra = [1];
  extra.other = 2;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    new Date(),
    new Array(1),
    extra,
    () => {},
    1n,
    { x: undefined },
  ]) {
    assert.throws(() => diffState(value, null), TypeError);
  }
  assert.throws(() => diffState({ [Symbol('x')]: 1 }, null), TypeError);
});
test('getters are rejected without execution even when an ignored path would hide them', () => {
  let called = false;
  const input = Object.defineProperty({}, 'hidden', {
    enumerable: true,
    get() {
      called = true;
      return 1;
    },
  });
  assert.throws(() => diffState(input, {}, { ignoredPaths: [[]] }), TypeError);
  assert.equal(called, false);
  assert.throws(() => diffState(Object.defineProperty({}, 'x', { value: 1 }), {}), TypeError);
});
test('own prototype-like keys are reported without prototype mutation', () => {
  const before = JSON.parse('{"__proto__":{"safe":1},"constructor":2}');
  const after = JSON.parse('{"__proto__":{"safe":3},"constructor":2}');
  assert.deepEqual(diffState(before, after).changes[0].path, ['__proto__', 'safe']);
  assert.equal({}.safe, undefined);
});
test('exact node, depth and change capacities reject without truncation', () => {
  assert.equal(
    diffState({ x: 1 }, { x: 2 }, { maxNodes: 2, maxDepth: 1, maxChanges: 1 }).changes.length,
    1,
  );
  assert.throws(() => diffState({ x: 1 }, { x: 2 }, { maxNodes: 1 }), RangeError);
  assert.throws(() => diffState({ x: 1 }, { x: 2 }, { maxDepth: 0 }), RangeError);
  assert.equal(diffState(1, 1, { maxChanges: 0 }).equal, true);
  assert.throws(() => diffState(1, 2, { maxChanges: 0 }), RangeError);
  assert.throws(() => diffState({ a: 1, b: 1 }, { a: 2, b: 2 }, { maxChanges: 1 }), RangeError);
});
test('invalid path, limit, string and key boundaries fail explicitly', () => {
  for (const maxNodes of [0, -1, 1.5, Infinity])
    assert.throws(() => diffState(1, 1, { maxNodes }), RangeError);
  assert.throws(() => diffState(1, 1, { maxDepth: 129 }), RangeError);
  assert.throws(() => diffState(1, 1, { ignoredPaths: [[1]] }), TypeError);
  assert.throws(() => diffState('a'.repeat(65537), null), RangeError);
  assert.throws(() => diffState({ ['a'.repeat(1025)]: 1 }, null), TypeError);
});
test('generated indexed changes reconstruct target snapshots independently', () => {
  let seed = 7;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 400; trial++) {
    const before = Array.from({ length: next() % 30 }, () => next() % 100);
    const after = Array.from({ length: next() % 30 }, () => next() % 100);
    const rebuilt = [...before],
      result = diffState(before, after);
    for (const change of result.changes)
      if (change.kind !== 'removed') rebuilt[Number(change.path[0])] = change.after;
    rebuilt.length = after.length;
    assert.deepEqual(rebuilt, after);
    assert.equal(result.equal, JSON.stringify(before) === JSON.stringify(after));
  }
});
test('CommonJS exposes the same strict structural comparison', () => {
  const api = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(api.diffState([1], [1]).equal, true);
});
