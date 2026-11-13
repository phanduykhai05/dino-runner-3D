export const DAY_CYCLE_SECONDS = 240;
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const direction = (x, y, z) => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

export function dayCycleAt(seconds) {
  const time = Number.isFinite(seconds) ? seconds : 0;
  const phase = ((time % DAY_CYCLE_SECONDS) + DAY_CYCLE_SECONDS) % DAY_CYCLE_SECONDS / DAY_CYCLE_SECONDS;
  const angle = phase * Math.PI * 2;
  const elevation = Math.sin(angle), east = Math.cos(angle) * .18;
  const daylight = smooth(-.14, .24, elevation);
  return {
    phase, elevation, daylight,
    warmth: 1 - smooth(.05, .4, Math.abs(elevation)),
    sunDirection: direction(east, elevation, .9),
    moonDirection: direction(-east, -elevation, .9),
    sunVisibility: smooth(-.12, .02, elevation),
    moonVisibility: smooth(-.12, .04, -elevation) * (1 - daylight * .6),
    starOpacity: smooth(-.08, -.35, elevation),
    label: phase < .08 || phase >= .94 ? 'Bình minh' : phase < .44 ? 'Ban ngày' : phase < .56 ? 'Hoàng hôn' : 'Ban đêm',
  };
}
