// SPDX-License-Identifier: MIT
// JOAAT hash (Jenkins One-At-A-Time) — RAGE engine's hashing for model names.
// Same algo as CFX's GetHashKey, used everywhere in scripting (vehicles, peds, weapons).

module.exports = function joaat(s) {
  s = String(s).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h | 0;
};
