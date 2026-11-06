import { diffState } from '@lp-labs/state-differ';
const equal: boolean = diffState(null, null).equal;
void equal;
