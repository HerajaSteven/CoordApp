import type { LocationPoint } from './useGPS';

/**
 * The size of a walk, worked out on the phone.
 *
 * The app could not measure anything. Every figure it showed came back in
 * the response to a successful save, so a coordinator whose save failed
 * saw no size at all — standing on the farm, having just walked it, with
 * no idea whether the shape was right and no way to find out before
 * leaving. That is the one moment when knowing matters, because it is the
 * only moment when walking it again is cheap.
 *
 * This does not replace the platform's reading. The platform measures the
 * polygon it stored and keeps its own verdict, and the two sitting side
 * by side is deliberate — a disagreement between them is a finding about
 * the polygon. This is the number for the person in the field.
 *
 * The area formula is the verification service's, deliberately: an
 * equirectangular projection anchored at the walk's mean latitude, then
 * the shoelace sum. A different formula here would show the coordinator
 * one number and store another.
 */

const METRES_PER_DEGREE_LAT = 111320;
const EARTH_RADIUS_M = 6371008.8;

export interface WalkSize {
  hectares: number | null;
  /** Ground actually covered, first fix to last — not the closed ring. */
  pathMetres: number | null;
  /** Why this cannot be read as a measurement, or null when it can. */
  rejection: string | null;
  /** Stretches of edge the coordinator declared unwalkable. */
  bridgedSegments: number;
  /** How much of the boundary those stretches account for, in metres. */
  bridgedMetres: number;
}

function toCartesian(lat: number, lng: number, avgLat: number): [number, number] {
  const mPerDegLng = METRES_PER_DEGREE_LAT * Math.cos((avgLat * Math.PI) / 180);

  return [lng * mPerDegLng, lat * METRES_PER_DEGREE_LAT];
}

function haversineMetres(a: LocationPoint, b: LocationPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface OuterEstimate {
  /** Area of the outer envelope, in hectares. An ESTIMATE, not a measurement. */
  hectares: number | null;
  /** Area of the shape actually walked, for comparison. */
  walkedHectares: number | null;
  /** How much the envelope adds. */
  extraHectares: number | null;
  /** Fixes that fell inside the envelope — the detours. */
  pointsInsideCount: number;
  /** How far inside the envelope the deepest detour went, in metres. */
  deepestInwardMetres: number | null;
}

/**
 * The farm's outer envelope: the farthest fix in every direction.
 *
 * A perimeter often cannot be walked. The boundary is bush, or a road is
 * blocked, and the coordinator has to cut inside the farm and rejoin the
 * edge further along. Every one of those detours takes a bite out of the
 * polygon, so the area that comes out is smaller than the farm — and
 * nothing distinguished it from a farm that genuinely is that shape.
 *
 * This takes the convex hull of the fixes, which is what "the farthest
 * point at each angle" means once it is made precise: every inward
 * excursion falls inside the hull and is ignored, while every point that
 * reached the true edge becomes a corner of it.
 *
 * ── WHY THIS IS NOT THE MEASUREMENT ───────────────────────────────────
 *
 * A convex hull cannot represent a concave farm. An L-shaped plot, or one
 * with a neighbour's parcel biting into it, has a hull that spans the
 * missing part — and the figure would be too big, in the direction that
 * flatters whoever is being lent against. There is no way to tell from
 * the fixes alone whether a gap is a detour or a hole in the farm.
 *
 * So this is reported beside the walked area, never instead of it, and
 * the walked points are what get stored. Which figure is the farm's size
 * is a judgement for whoever can see the farm, not arithmetic.
 */
export function outerEstimate(points: LocationPoint[]): OuterEstimate {
  const empty: OuterEstimate = {
    hectares: null,
    walkedHectares: null,
    extraHectares: null,
    pointsInsideCount: 0,
    deepestInwardMetres: null,
  };

  if (points.length < 3) {
    return empty;
  }

  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;

  /*
    A LOOSE FIX MUST NOT BECOME A CORNER.

    The hull is decided entirely by its outermost points, so one bad fix
    sitting outside the farm drags the whole envelope out with it. Fixes
    far worse than the rest of the walk are left out of the hull — they
    are the ones most likely to be somewhere they never were. They still
    count towards the walked area, which is a sum over all of them and far
    less sensitive to any single one.
  */
  const accuracies = points.map((p) => p.accuracyMeters ?? 0).sort((a, b) => a - b);
  const median = accuracies[Math.floor(accuracies.length / 2)] || 0;
  const ceiling = median > 0 ? median * 3 : Infinity;
  const trusted = points.filter((p) => (p.accuracyMeters ?? 0) <= ceiling);

  const usable = trusted.length >= 3 ? trusted : points;
  const projected = usable.map((p) => toCartesian(p.lat, p.lng, avgLat));
  const hull = convexHull(projected);

  if (hull.length < 3) {
    return empty;
  }

  const hectares = parseFloat((Math.abs(shoelace(hull)) / 10000).toFixed(4));
  const walkedHectares = measureWalk(points).hectares;

  /* How deep the detours went, and how many fixes were part of one. */
  let deepest = 0;
  let inside = 0;

  for (const point of projected) {
    const d = distanceToHullEdge(point, hull);

    if (d > 1) {
      inside++;
    }

    if (d > deepest) {
      deepest = d;
    }
  }

  return {
    hectares,
    walkedHectares,
    extraHectares:
      walkedHectares == null ? null : parseFloat((hectares - walkedHectares).toFixed(4)),
    pointsInsideCount: inside,
    deepestInwardMetres: Math.round(deepest),
  };
}

/**
 * Whether any two non-adjacent edges of the closed ring cross.
 *
 * O(n²), which for a five-hundred-point walk is a hundred and twenty-five
 * thousand cheap tests, run once when the coordinator ends the walk.
 * Worth it: a self-crossing ring is the one defect that yields a
 * believable number from an impossible shape.
 */
function selfIntersects(ring: Array<[number, number]>): boolean {
  const n = ring.length;

  if (n < 4) {
    return false;
  }

  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];

    for (let j = i + 1; j < n; j++) {
      /* Edges sharing an endpoint touch by design, not by crossing. */
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) {
        continue;
      }

      if (segmentsCross(a1, a2, ring[j], ring[(j + 1) % n])) {
        return true;
      }
    }
  }

  return false;
}

type Pt = [number, number];

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const o = (a: Pt, b: Pt, c: Pt) => {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

    /*
      A millimetre-scale tolerance. These are metres from a GPS receiver,
      so treating a vanishingly small cross product as "straight" keeps
      three nearly-collinear fixes from reading as a crossing.
    */
    if (Math.abs(v) < 1e-6) return 0;

    return v > 0 ? 1 : -1;
  };

  const d1 = o(p3, p4, p1);
  const d2 = o(p3, p4, p2);
  const d3 = o(p1, p2, p3);
  const d4 = o(p1, p2, p4);

  /*
    A proper crossing only. Collinear overlap is left alone: a walk that
    doubles back along its own edge is untidy, not a different shape, and
    flagging it would reject honest walks along a track.
  */
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/** Signed shoelace area of an ordered ring, in square metres. */
function shoelace(ring: Array<[number, number]>): number {
  let sum = 0;

  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    sum += ring[i][0] * ring[j][1];
    sum -= ring[j][0] * ring[i][1];
  }

  return sum / 2;
}

/**
 * Andrew's monotone chain: the hull in counter-clockwise order.
 *
 * Chosen over a gift wrap because it is O(n log n) and a boundary walk
 * can be five hundred fixes on a phone.
 */
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...pts].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  if (sorted.length < 3) {
    return sorted;
  }

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const build = (input: Array<[number, number]>) => {
    const chain: Array<[number, number]> = [];

    for (const p of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }

    return chain;
  };

  const lower = build(sorted);
  const upper = build([...sorted].reverse());

  /* Each chain repeats the other's first point, so both ends are dropped. */
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Shortest distance from a point to the hull's boundary, in metres. */
function distanceToHullEdge(p: [number, number], hull: Array<[number, number]>): number {
  let best = Infinity;

  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;

    /* Projected onto the segment, clamped to its ends. */
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    const d = Math.hypot(p[0] - cx, p[1] - cy);

    if (d < best) {
      best = d;
    }
  }

  return best === Infinity ? 0 : best;
}

export function measureWalk(points: LocationPoint[]): WalkSize {
  if (points.length < 3) {
    return {
      hectares: null,
      pathMetres: null,
      rejection: `A boundary needs at least three points. This walk has ${points.length}.`,
      bridgedSegments: 0,
      bridgedMetres: 0,
    };
  }

  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const ring = points.map((p) => toCartesian(p.lat, p.lng, avgLat));

  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  const hectares = parseFloat((Math.abs(area / 2) / 10000).toFixed(4));

  let pathMetres = 0;
  for (let i = 1; i < points.length; i++) {
    pathMetres += haversineMetres(points[i - 1], points[i]);
  }

  /*
    The stretches nobody could walk, and how much boundary they stand in
    for. Whoever reads the area is entitled to know how much of the
    perimeter is a straight line somebody chose rather than ground that
    was actually covered.
  */
  let bridgedSegments = 0;
  let bridgedMetres = 0;

  for (let i = 1; i < points.length; i++) {
    if (points[i].bridged) {
      bridgedSegments++;
      bridgedMetres += haversineMetres(points[i - 1], points[i]);
    }
  }

  return {
    hectares,
    pathMetres,
    rejection: rejectionFor(points, hectares, pathMetres),
    bridgedSegments,
    bridgedMetres: Math.round(bridgedMetres),
  };
}

/**
 * Whether the walk can be read as a farm, in words a coordinator can act
 * on while still standing on it.
 *
 * The same two tests the platform applies, because a coordinator told
 * "1.2 ha" and then told days later by a reviewer that it was the
 * receiver's own drift has been failed by this screen.
 */
function rejectionFor(points: LocationPoint[], hectares: number, pathMetres: number): string | null {
  /*
    A RING THAT CROSSES ITSELF HAS NO AREA WORTH THE NAME.

    The polygon is built in the order the fixes were recorded, so where a
    walk resumes decides the shape. Pausing at one point and resuming at
    whichever part of the boundary is easiest to reach — rather than the
    next point along in the same direction — draws a segment straight
    through the middle of the farm. The ring then crosses itself, and the
    shoelace sum adds one loop while subtracting the other: the figure
    that comes out is not small, or large, it is meaningless.

    This is the one mistake that produces a plausible-looking number from
    an impossible shape, which is why it is checked before anything else.
    The outer estimate is unaffected — a convex hull does not care what
    order the points arrived in — so a tangled walk can still be given a
    size, with the detours spelt out.
  */
  const avgLatForRing = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const ring = points.map((p) => toCartesian(p.lat, p.lng, avgLatForRing));

  if (selfIntersects(ring)) {
    return (
      'The walk crosses over itself, so the area cannot be worked out from it. '
      + 'This happens when a walk resumes somewhere other than the next point along the '
      + 'boundary. Use the outer estimate below, or walk the perimeter again in one direction.'
    );
  }

  /*
    The smallest area these fixes could honestly resolve. A receiver
    reporting 20 m of accuracy cannot place a point more precisely than
    somewhere in a circle of that radius, so a shape smaller than that
    circle is the uncertainty, not a field. Taken from the worst fix,
    because the polygon is only as good as its loosest corner.
  */
  const worst = points.reduce((w, p) => Math.max(w, p.accuracyMeters ?? 0), 0);

  if (worst > 0) {
    const floorHa = (Math.PI * worst * worst) / 10000;

    if (hectares < floorHa) {
      return (
        `The shape is ${hectares.toFixed(4)} ha, smaller than this phone can measure ` +
        `(${floorHa.toFixed(4)} ha at ${worst.toFixed(0)} m accuracy). It looks like the phone did not move.`
      );
    }
  }

  /*
    Too fast to have been walked. The first thing this caught on the
    platform was a boundary recorded from a moving vehicle — large,
    precise and genuinely traversed, so every other test passed it.
  */
  const first = points[0].timestamp.getTime();
  const last = points[points.length - 1].timestamp.getTime();
  const seconds = Math.round((last - first) / 1000);

  if (seconds > 0 && pathMetres / seconds > 3.0) {
    return (
      `The phone covered ${pathMetres.toFixed(0)} m in ${seconds} s, which is ` +
      `${((pathMetres / seconds) * 3.6).toFixed(1)} km/h — too fast to have been walked.`
    );
  }

  /*
    An unclosed trace. A perimeter returns to where it began; a line out
    and no way back gets closed by the arithmetic with a straight segment
    across ground nobody covered, and the area that comes out is the area
    between the route and that invented line. One walk on record was 4,036
    m driven stored as a 7,706 m perimeter for exactly this reason.

    A tenth of the distance walked is a generous allowance for not
    arriving back on the same spot.
  */
  const closingGap = haversineMetres(points[0], points[points.length - 1]);

  if (pathMetres > 0 && closingGap > Math.max(50, pathMetres * 0.1)) {
    return (
      `The walk ends ${closingGap.toFixed(0)} m from where it started, so it is a line rather ` +
      `than a perimeter. The size shown assumes a straight edge across that gap.`
    );
  }

  return null;
}
