import * as THREE from 'three';

/** One continuous, pleated membrane. All details follow the same deforming surface. */
export function createRibbon(rows = 160, columns = 48) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((rows + 1) * (columns + 1) * 3);
  const colors = new Float32Array(positions.length);
  const normalValues = new Float32Array(positions.length);
  const uv = new Float32Array((rows + 1) * (columns + 1) * 2);
  const crowns = new Float32Array((rows + 1) * (columns + 1));
  const across = new Float32Array(columns + 1);
  const envelopes = new Float32Array(rows + 1);
  const widths = new Float32Array(rows + 1);
  const centersX = new Float32Array(rows + 1), centersZ = new Float32Array(rows + 1);
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, envelope = Math.sin(Math.PI * t);
    envelopes[i] = envelope; widths[i] = .94 * Math.pow(envelope, .68);
    centersX[i] = .36 * Math.sin(t * Math.PI * 2 - .8);
    centersZ[i] = .19 * Math.cos(t * Math.PI * 2 + .2);
    for (let j = 0; j <= columns; j++) {
      const u = j / columns * 2 - 1;
      across[j] = u;
      const pleat = Math.sin(u * Math.PI * 3 + .28 * Math.sin(t * 5)) * .075 * (1 - u * u);
      const curl = Math.pow(Math.abs(u), 10) * .075;
      crowns[i * (columns + 1) + j] = ((1 - u * u) * .16 + pleat + curl) * envelope;
      const k = (i * (columns + 1) + j) * 3;
      const edge = Math.pow(Math.abs(j / columns * 2 - 1), 8);
      colors[k] = .8 + edge * .2;
      colors[k + 1] = .84 + edge * .16;
      colors[k + 2] = .8 + edge * .2;
      const v = (i * (columns + 1) + j) * 2;
      uv[v] = j / columns; uv[v + 1] = i / rows;
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normalValues, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rows + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const traceGeometry = new THREE.BufferGeometry();
  traceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rows + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const seamGeometry = new THREE.BufferGeometry();
  const seamColumns = [Math.round(columns * .16), Math.round(columns * .84)];
  const seams = new Float32Array(rows * 2 * seamColumns.length * 3);
  seamGeometry.setAttribute('position', new THREE.BufferAttribute(seams, 3).setUsage(THREE.DynamicDrawUsage));
  const hemGeometry = new THREE.BufferGeometry();
  const hemPositions = new Float32Array((rows + 1) * 4 * 3);
  const hemIndices: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (const side of [0, 2]) {
      const a = i * 4 + side, b = a + 4;
      hemIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  hemGeometry.setAttribute('position', new THREE.BufferAttribute(hemPositions, 3).setUsage(THREE.DynamicDrawUsage));
  hemGeometry.setIndex(hemIndices);

  function update(time: number, opening: number, amplitude: number, breathPhase: number, arrival: number, morph = 0, energy = 0) {
    const edge = edgeGeometry.attributes.position as THREE.BufferAttribute;
    const trace = traceGeometry.attributes.position as THREE.BufferAttribute;
    const breath = Math.sin(breathPhase) * amplitude;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const envelope = envelopes[i];
      const y = (t - .5) * 4.8;
      const centerX = centersX[i], centerZ = centersZ[i];
      const width = .018 + widths[i] * (1 + opening * .14);
      const arrivalFold = arrival * .08 * Math.sin(t * 5 - time * 2) * envelope;
      const angle = t * Math.PI * 1.72 - 1.25 + opening * Math.sin(t * Math.PI) + breath * Math.sin(t * 4 + time * .2) + arrivalFold;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let j = 0; j <= columns; j++) {
        const u = across[j];
        // Three broad flutes catch distinct bands of light; the rolled edges
        // retain a crisp silhouette even when the sheet turns away from us.
        const crown = crowns[i * (columns + 1) + j];
        const k = (i * (columns + 1) + j) * 3;
        const ribbonX = centerX + u * width * cos - crown * sin;
        const ribbonY = y + .11 * u * envelope;
        const ribbonZ = centerZ + u * width * sin + crown * cos;
        // The same topology closes into a sphere. Keeping both poses in one
        // buffer makes entering voice mode a genuine morph, not a canvas swap.
        const phi = t * Math.PI;
        const theta = u * Math.PI;
        const ripple = Math.sin(phi * 5 + theta * 3 + time * 1.8) * energy * .055;
        const radius = 2.12 * (1 + energy * .09 + ripple);
        const sphereX = Math.sin(phi) * Math.sin(theta) * radius;
        const sphereY = Math.cos(phi) * radius;
        const sphereZ = Math.sin(phi) * Math.cos(theta) * radius;
        positions[k] = ribbonX + (sphereX - ribbonX) * morph;
        positions[k + 1] = ribbonY + (sphereY - ribbonY) * morph;
        positions[k + 2] = ribbonZ + (sphereZ - ribbonZ) * morph;
        if (j === columns) edge.setXYZ(i, positions[k], positions[k + 1], positions[k + 2] + .002);
        if (j === columns / 2) trace.setXYZ(i, positions[k], positions[k + 1], positions[k + 2] + .009);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    edge.needsUpdate = true;
    trace.needsUpdate = true;
    // The regular surface grid lets us compute central-difference normals
    // without allocating vectors or accumulating every triangle each frame.
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= columns; j++) {
        const k = (i * (columns + 1) + j) * 3;
        const top = (Math.min(i + 1, rows) * (columns + 1) + j) * 3;
        const bottom = (Math.max(i - 1, 0) * (columns + 1) + j) * 3;
        const left = (i * (columns + 1) + Math.max(j - 1, 0)) * 3;
        const right = (i * (columns + 1) + Math.min(j + 1, columns)) * 3;
        const ax = positions[top] - positions[bottom], ay = positions[top + 1] - positions[bottom + 1], az = positions[top + 2] - positions[bottom + 2];
        const bx = positions[right] - positions[left], by = positions[right + 1] - positions[left + 1], bz = positions[right + 2] - positions[left + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const inverse = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        normalValues[k] = nx * inverse; normalValues[k + 1] = ny * inverse; normalValues[k + 2] = nz * inverse;
      }
    }
    geometry.attributes.normal.needsUpdate = true;
    const normals = geometry.attributes.normal;
    for (let i = 0; i <= rows; i++) {
      for (let side = 0; side < 2; side++) {
        const column = side * columns;
        const vertex = i * (columns + 1) + column;
        const k = vertex * 3;
        for (let lip = 0; lip < 2; lip++) {
          const h = (i * 4 + side * 2 + lip) * 3;
          const offset = lip ? -.012 : .003;
          hemPositions[h] = positions[k] + normals.getX(vertex) * offset;
          hemPositions[h + 1] = positions[k + 1] + normals.getY(vertex) * offset;
          hemPositions[h + 2] = positions[k + 2] + normals.getZ(vertex) * offset;
        }
      }
    }
    for (let seam = 0; seam < seamColumns.length; seam++) {
      for (let i = 0; i < rows; i++) {
        for (let end = 0; end < 2; end++) {
          const vertex = (i + end) * (columns + 1) + seamColumns[seam];
          const k = vertex * 3, s = ((seam * rows + i) * 2 + end) * 3;
          seams[s] = positions[k] + normals.getX(vertex) * .006;
          seams[s + 1] = positions[k + 1] + normals.getY(vertex) * .006;
          seams[s + 2] = positions[k + 2] + normals.getZ(vertex) * .006;
        }
      }
    }
    seamGeometry.attributes.position.needsUpdate = true;
    hemGeometry.attributes.position.needsUpdate = true;
    hemGeometry.computeVertexNormals();
  }
  update(0, .12, 0, 0, 0);
  geometry.computeBoundingSphere();
  return { geometry, edgeGeometry, traceGeometry, seamGeometry, hemGeometry, update, dispose() {
    geometry.dispose(); edgeGeometry.dispose(); traceGeometry.dispose(); seamGeometry.dispose(); hemGeometry.dispose();
  } };
}
