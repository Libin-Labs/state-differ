export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type StateChange =
  | { kind: 'added'; path: string[]; after: Json }
  | { kind: 'removed'; path: string[]; before: Json }
  | { kind: 'replaced'; path: string[]; before: Json; after: Json };
export interface DiffOptions {
  ignoredPaths?: readonly (readonly string[])[];
  maxNodes?: number;
  maxChanges?: number;
  maxDepth?: number;
}
export interface StateDiff {
  equal: boolean;
  changes: StateChange[];
}
function positive(value: number, name: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new RangeError(`${name} must be a safe integer >= ${minimum}.`);
  return value;
}
function snapshot(
  input: unknown,
  budget: { left: number },
  maximumDepth: number,
  ancestors = new Set<object>(),
  depth = 0,
): Json {
  if (budget.left-- <= 0 || depth > maximumDepth)
    throw new RangeError('Snapshot node/depth capacity exceeded.');
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    if (input.length > 65_536) throw new RangeError('Snapshot string exceeds 65536 units.');
    return input;
  }
  if (typeof input !== 'object' || input === null)
    throw new TypeError('Expected finite strict JSON data.');
  if (ancestors.has(input)) throw new TypeError('Cyclic snapshot.');
  ancestors.add(input);
  let result: Json;
  if (Array.isArray(input)) {
    if (input.length > budget.left) throw new RangeError('Snapshot node capacity exceeded.');
    if (Reflect.ownKeys(input).length !== input.length + 1)
      throw new TypeError('Arrays must be dense without extra properties.');
    result = Array.from({ length: input.length }, (_, index) => {
      const property = Object.getOwnPropertyDescriptor(input, String(index));
      if (!property?.enumerable || !('value' in property))
        throw new TypeError('Expected enumerable array data properties.');
      return snapshot(property.value, budget, maximumDepth, ancestors, depth + 1);
    });
  } else {
    if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
      throw new TypeError('Expected plain JSON records.');
    result = Object.fromEntries(
      Reflect.ownKeys(input).map((key) => {
        if (typeof key !== 'string' || key.length > 1024)
          throw new TypeError('Expected string keys up to 1024 units.');
        const property = Object.getOwnPropertyDescriptor(input, key)!;
        if (!property.enumerable || !('value' in property))
          throw new TypeError('Expected enumerable data properties.');
        return [key, snapshot(property.value, budget, maximumDepth, ancestors, depth + 1)];
      }),
    );
  }
  ancestors.delete(input);
  return result;
}
export function diffState(before: Json, after: Json, options: DiffOptions = {}): StateDiff {
  const maxNodes = positive(options.maxNodes ?? 100_000, 'maxNodes');
  const maxChanges = positive(options.maxChanges ?? 10_000, 'maxChanges', 0);
  const maxDepth = positive(options.maxDepth ?? 64, 'maxDepth', 0);
  if (maxDepth > 128) throw new RangeError('maxDepth cannot exceed 128.');
  const paths = options.ignoredPaths ?? [];
  if (!Array.isArray(paths) || paths.length > 10_000)
    throw new RangeError('Expected up to 10000 ignored paths.');
  const ignored = new Set<string>();
  for (const path of paths) {
    if (
      !Array.isArray(path) ||
      path.length > maxDepth ||
      Array.from(path).some((segment) => typeof segment !== 'string' || segment.length > 1024)
    )
      throw new TypeError('Ignored paths must be bounded string-segment arrays.');
    ignored.add(JSON.stringify(path));
  }
  const left = snapshot(before, { left: maxNodes }, maxDepth);
  const right = snapshot(after, { left: maxNodes }, maxDepth);
  const changes: StateChange[] = [];
  const emit = (change: StateChange) => {
    if (changes.length === maxChanges) throw new RangeError('Change capacity exceeded.');
    changes.push(change);
  };
  const visit = (a: Json, b: Json, path: string[]) => {
    if (ignored.has(JSON.stringify(path)) || a === b) return;
    if (
      a === null ||
      b === null ||
      typeof a !== 'object' ||
      typeof b !== 'object' ||
      Array.isArray(a) !== Array.isArray(b)
    ) {
      emit({ kind: 'replaced', path, before: a, after: b });
      return;
    }
    const array = Array.isArray(a);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    if (array) keys.sort((x, y) => Number(x) - Number(y));
    else keys.sort();
    for (const key of keys) {
      const next = [...path, key];
      if (ignored.has(JSON.stringify(next))) continue;
      const get = (value: Json[] | { [key: string]: Json }) =>
        Array.isArray(value) ? value[Number(key)]! : value[key]!;
      if (!Object.hasOwn(a, key)) emit({ kind: 'added', path: next, after: get(b) });
      else if (!Object.hasOwn(b, key)) emit({ kind: 'removed', path: next, before: get(a) });
      else visit(get(a), get(b), next);
    }
  };
  visit(left, right, []);
  return { equal: changes.length === 0, changes };
}
