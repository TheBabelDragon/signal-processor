import { MODES, getMode, listModes, modeByVis, MARTIN_M1, ROBOT_36 } from './mode-definitions.js';

export { MODES, getMode, listModes, modeByVis, MARTIN_M1, ROBOT_36 };

export function listEncodableModes() {
  return listModes().filter((m) => m.encoder);
}

export function listDecodableModes() {
  return listModes().filter((m) => m.decoder);
}
