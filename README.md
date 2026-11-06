# @lp-labs/state-differ

Bounded structural differences for strict JSON snapshots, with unambiguous segment paths and
ignored subtrees. Independently authored, framework-neutral and dependency-free.

## Install

```bash
npm install @lp-labs/state-differ
```

ES2022, ESM/CommonJS entry points and TypeScript declarations. Zero runtime or peer dependencies.
CommonJS: `const { diffState } = require('@lp-labs/state-differ')`.

## Quickstart

```js
import { diffState } from '@lp-labs/state-differ';

const report = diffState(
  { user: { name: 'Before' }, updatedAt: 1 },
  { user: { name: 'After' }, updatedAt: 2 },
  { ignoredPaths: [['updatedAt']] },
);
if (report.equal || report.changes.length !== 1) throw new Error('Expected one change');
if (report.changes[0].path.join('.') !== 'user.name') throw new Error('Wrong path');
```

## API and output

`diffState(before: Json, after: Json, options?: DiffOptions): StateDiff`

Returns `{ equal: boolean, changes: StateChange[] }`. `equal` means no changes after applying
the configured ignore rules, not necessarily byte-identical input.

| Change kind  | Fields                                          |
| ------------ | ----------------------------------------------- |
| `'added'`    | `path: string[]`, `after: Json`                 |
| `'removed'`  | `path: string[]`, `before: Json`                |
| `'replaced'` | `path: string[]`, `before: Json`, `after: Json` |

`[]` addresses the root. Array indexes are canonical decimal string segments.
Segment arrays avoid ambiguity when keys contain dots, slashes, tildes or empty strings.
All output values and paths are detached from inputs.

### Comparison rules

- Primitive values compare without coercion; `-0` and `0` are equal.
- Object key insertion order is ignored. Keys are visited in UTF-16 lexical order.
- Arrays are **index-based**, visited in ascending numeric order, not identity-matched.
- A type/category change emits one replacement at that path.
- Added/removed objects or arrays emit one complete subtree value, not one change per leaf.
- Existing containers recurse into common keys; missing keys produce additions/removals.
- `__proto__`, `constructor` and similar names are own data keys, not mutation instructions.

This is a snapshot report, **not an RFC 6902 patch**. Removed array paths refer to original
indexes; applying ascending removals with `splice()` would shift subsequent indexes.
Write a deliberate application adapter if you need patch execution.

## Options and customization

| Option         | Default  | Contract                                                                   |
| -------------- | -------- | -------------------------------------------------------------------------- |
| `ignoredPaths` | `[]`     | Up to 10000 string-segment paths; exact encountered subtree matches.       |
| `maxNodes`     | `100000` | Positive safe integer node cap, applied separately to each input snapshot. |
| `maxChanges`   | `10000`  | Non-negative safe integer; exceeding it throws rather than truncating.     |
| `maxDepth`     | `64`     | Safe integer from 0 to 128; root has depth 0.                              |

Ignored paths include descendants of the ignored node; an empty path ignores the whole
comparison. Duplicate ignored paths are harmless. Each path is at most `maxDepth` segments,
with each segment at most 1024 UTF-16 units.

**Ignore rules are not redaction.** If a parent is added/removed/replaced, its whole value is
reported even if an ignored path names a descendant. Ignore rules only suppress paths that
traversal encounters. Sanitize sensitive inputs before diffing or reporting them.

```js
import { diffState } from '@lp-labs/state-differ';

const report = diffState(
  [{ id: 'a', value: 1 }],
  [
    { id: 'a', value: 2 },
    { id: 'b', value: 3 },
  ],
  { maxChanges: 5, maxNodes: 100, maxDepth: 8 },
);
const kinds = report.changes.map((change) => change.kind);
if (kinds.join(',') !== 'replaced,added') throw new Error('Unexpected indexed differences');
```

## Strict data and errors

Accepted data: null, booleans, finite numbers, strings up to 65536 units, dense arrays and
plain own enumerable data records with string keys up to 1024 units.
Null-prototype records are accepted. Shared acyclic references are independently cloned.

Undefined, functions, bigint, symbols, dates, custom prototypes, cycles, sparse arrays, extra
array properties, accessors and nonenumerable properties are rejected with `TypeError`.
Getters are not executed. Both snapshots are fully validated **even when ignored**.
Node/depth/string/change capacities throw `RangeError`; invalid options/path shapes throw.
Errors do not return partial or success-shaped reports.

## Performance and scope

Snapshot validation/cloning is O(N). Comparison additionally sorts each encountered container's
keys, up to O(N log N), and encodes paths with bounded depth. Memory is O(N + C * D), for input
nodes N, changes C and bounded depth D. The caps do not make reflection a hardened memory sandbox.

No mutation, patch application, custom class comparison, Map/Set support, identity-based collection
matching, move detection, text diffing, persistence or UI rendering is included.
Exported types: `Json`, `StateChange`, `DiffOptions`, `StateDiff`.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
