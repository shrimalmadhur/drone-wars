export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function distanceSq3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function createRng(seed = 123456789) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function randomRange(rng, min, max) {
  return min + (max - min) * rng();
}

export function chooseFrom(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function segmentIntersectsSphere(start, end, center, radius) {
  return segmentIntersectsSphereAt(start, end, center, radius) !== null;
}

export function segmentIntersectsSphereAt(start, end, center, radius) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const vz = end.z - start.z;
  const ox = start.x - center.x;
  const oy = start.y - center.y;
  const oz = start.z - center.z;
  const a = vx * vx + vy * vy + vz * vz;
  const b = 2 * (ox * vx + oy * vy + oz * vz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;

  if (a === 0) {
    return c <= 0 ? 0 : null;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);
  if (t1 >= 0 && t1 <= 1) {
    return t1;
  }
  if (t2 >= 0 && t2 <= 1) {
    return t2;
  }
  if (c <= 0) {
    return 0;
  }
  return null;
}

export function segmentIntersectsCylinder(start, end, center, radius, halfHeight) {
  return segmentIntersectsCylinderAt(start, end, center, radius, halfHeight) !== null;
}

export function segmentIntersectsCylinderAt(start, end, center, radius, halfHeight) {
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = lerp(start.x, end.x, t);
    const y = lerp(start.y, end.y, t);
    const z = lerp(start.z, end.z, t);
    const dx = x - center.x;
    const dz = z - center.z;
    if (dx * dx + dz * dz <= radius * radius && Math.abs(y - center.y) <= halfHeight) {
      return t;
    }
  }
  return null;
}

export function findAimAssistTarget(origin, direction, candidates, options = {}) {
  const maxDistance = options.maxDistance ?? 220;
  const minDot = options.minDot ?? 0.975;
  let bestTarget = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const toCandidateX = candidate.position.x - origin.x;
    const toCandidateY = candidate.position.y - origin.y;
    const toCandidateZ = candidate.position.z - origin.z;
    const distance = Math.hypot(toCandidateX, toCandidateY, toCandidateZ);
    if (distance === 0 || distance > maxDistance) {
      continue;
    }

    const dirX = toCandidateX / distance;
    const dirY = toCandidateY / distance;
    const dirZ = toCandidateZ / distance;
    const dot = dirX * direction.x + dirY * direction.y + dirZ * direction.z;
    if (dot < minDot) {
      continue;
    }

    const alignmentPenalty = (1 - dot) * 200;
    const score = distance + alignmentPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }

  return bestTarget;
}

export function projectRadarContact(origin, yaw, target, maxDistance) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const lateral = dz * sinYaw - dx * cosYaw;
  const forward = dx * sinYaw + dz * cosYaw;

  if (distance === 0) {
    return {
      lateral: 0,
      forward: 0,
      distance: 0,
      outOfRange: false,
    };
  }

  const scale = distance > maxDistance ? maxDistance / distance : 1;
  return {
    lateral: lateral * scale,
    forward: forward * scale,
    distance,
    outOfRange: distance > maxDistance,
  };
}
