import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Suppress deprecated THREE.Clock warnings from R3F internals
const _origWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock')) return
  _origWarn(...args)
}

export type SignalState = 'idle' | 'listening' | 'thinking' | 'speaking'

// Deterministic pseudo-random — no Math.random in geometry
const srand = (n: number): number => {
  const x = Math.sin(n * 127.1 + 43.3) * 43758.5453
  return x - Math.floor(x)
}

const ROWS = 30

// Returns both main geometry AND luminous right-edge geometry
function buildMainGeometries(): { mainGeo: THREE.BufferGeometry; edgeGeo: THREE.BufferGeometry } {
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS
    const y = (0.5 - t) * 2.6

    // Right edge: intentional, clean — the "arrived" side
    const rx = 0.34 + Math.sin(t * Math.PI) * 0.082 + Math.sin(t * Math.PI * 2.8) * 0.013

    // Left edge: incomplete at top, materialises downward
    const open = Math.min(1, t / 0.28)
    const lxFull = -0.28 - Math.sin(t * Math.PI * 1.4 + 0.5) * 0.09 + (srand(i * 2.3) - 0.5) * 0.022
    const lx = lxFull * open + (rx - .035) * (1 - open)

    // Z: primary arch + secondary fold
    const z1 = Math.sin(t * Math.PI * 0.9) * 0.12
    const z2 = Math.sin(t * Math.PI * 2.1 + 0.8) * 0.038
    const noiseZ = (srand(i * 4.1) - 0.5) * 0.018

    positions.push(rx, y, z1 + z2 + noiseZ)               // even → right vertex
    positions.push(lx, y, -(z1 * 0.45) + z2 * 0.6 + noiseZ * 0.5) // odd → left vertex
  }

  for (let i = 0; i < ROWS; i++) {
    const t = i / ROWS
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    // Continuous tapered opening: no alternating missing triangles.
    indices.push(a, c, b, b, c, d)
  }

  const mainGeo = new THREE.BufferGeometry()
  mainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  mainGeo.setIndex(indices)
  mainGeo.computeVertexNormals()

  // Trace right-edge vertices for the luminous metal line
  const edgePts: number[] = []
  for (let i = 0; i < ROWS; i++) {
    const ai = i * 2 * 3
    const bi = (i + 1) * 2 * 3
    edgePts.push(positions[ai], positions[ai + 1], positions[ai + 2])
    edgePts.push(positions[bi], positions[bi + 1], positions[bi + 2])
  }
  const edgeGeo = new THREE.BufferGeometry()
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3))

  return { mainGeo, edgeGeo }
}

function buildFabricGeometry(): THREE.BufferGeometry {
  // Back layer: wider silhouette, irregular — tensioned fabric
  const rows = 20
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    const y = (0.5 - t) * 2.55
    const rx = 0.40 + Math.sin(t * Math.PI) * 0.10 + (srand(i * 5.1) - 0.5) * 0.014
    const lx = -0.34 - Math.sin(t * Math.PI * 1.2 + 0.3) * 0.08 + (srand(i * 3.7) - 0.5) * 0.02
    const z = Math.sin(t * Math.PI * 1.1) * 0.09
    positions.push(rx, y, z)
    positions.push(lx, y, z * 0.55)
  }

  for (let i = 0; i < rows; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildGlowGeometry(): THREE.BufferGeometry {
  // Narrow inner strip, pushed forward — additive glass glow
  const rows = 14
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    const y = (0.5 - t) * 2.2
    const rx = 0.20 + Math.sin(t * Math.PI) * 0.055
    const lx = -0.12 - Math.sin(t * Math.PI * 1.8 + 1.0) * 0.06
    const z = Math.sin(t * Math.PI * 2.0 + 0.4) * 0.035
    positions.push(rx, y, z)
    positions.push(lx, y, z * 0.3)
  }

  for (let i = 0; i < rows; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return geo
}

function buildFoldLines(): THREE.BufferGeometry {
  const t1 = 0.37, t2 = 0.65
  const y1 = (0.5 - t1) * 2.6
  const y2 = (0.5 - t2) * 2.6

  const pts = new Float32Array([
    // Upper fold
    -0.26, y1,  0.048,   0.43, y1,  0.090,
    // Lower fold
    -0.23, y2, -0.020,   0.44, y2,  0.030,
    // Internal diagonal
     0.20, 0.82, 0.065, -0.12, 0.04, 0.018,
    // Short right structural hair
     0.30, 0.97, 0.052,  0.37, 0.52, 0.082,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  return geo
}

function buildEmberAccent(): THREE.BufferGeometry {
  // Two short crossing lines at bottom-right: warm arrival accent
  const pts = new Float32Array([
    0.27, -0.90, 0.068,
    0.41, -1.24, 0.018,
    0.34, -1.06, 0.052,
    0.21, -1.30, 0.000,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  return geo
}

interface SceneProps {
  state: SignalState
  reducedMotion: boolean
  field: React.MutableRefObject<Field>
}

function SignalScene({ state, reducedMotion, field }: SceneProps) {
  const groupRef  = useRef<THREE.Group>(null)
  const fabricRef = useRef<THREE.Mesh>(null)
  const mainRef   = useRef<THREE.Mesh>(null)
  const glowRef   = useRef<THREE.Mesh>(null)
  const edgeRef   = useRef<THREE.LineSegments>(null)
  const foldsRef  = useRef<THREE.LineSegments>(null)
  const emberRef  = useRef<THREE.LineSegments>(null)

  const { mainGeo, edgeGeo } = useMemo(() => buildMainGeometries(), [])
  const fabricGeo = useMemo(() => buildFabricGeometry(), [])
  const glowGeo   = useMemo(() => buildGlowGeometry(), [])
  const foldsGeo  = useMemo(() => buildFoldLines(), [])
  const emberGeo  = useMemo(() => buildEmberAccent(), [])

  useEffect(() => {
    return () => {
      mainGeo.dispose()
      edgeGeo.dispose()
      fabricGeo.dispose()
      glowGeo.dispose()
      foldsGeo.dispose()
      emberGeo.dispose()
    }
  }, [mainGeo, edgeGeo, fabricGeo, glowGeo, foldsGeo, emberGeo])

  const basePositions = useMemo(() => [mainGeo, fabricGeo, glowGeo, edgeGeo, foldsGeo, emberGeo].map(geo => new Float32Array(geo.attributes.position.array)), [mainGeo, fabricGeo, glowGeo, edgeGeo, foldsGeo, emberGeo])
  const clock = useRef(0)

  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return
    delta = Math.min(delta, .04)
    clock.current += delta
    const now = clock.current
    const g = groupRef.current
    const lp = 1 - Math.exp(-delta * 3.5)

    const mainMat   = mainRef.current?.material  as THREE.MeshPhysicalMaterial | null
    const fabricMat = fabricRef.current?.material as THREE.MeshStandardMaterial | null
    const glowMat   = glowRef.current?.material  as THREE.MeshBasicMaterial | null
    const edgeMat   = edgeRef.current?.material  as THREE.LineBasicMaterial | null
    const foldsMat  = foldsRef.current?.material as THREE.LineBasicMaterial | null
    const emberMat  = emberRef.current?.material as THREE.LineBasicMaterial | null

    if (state === 'idle') {
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.sin(now * 0.16) * 0.09, lp)
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, Math.sin(now * 0.11 + 1.3) * 0.022, lp)
      g.position.y = THREE.MathUtils.lerp(g.position.y, Math.sin(now * 0.21) * 0.04, lp)
      g.scale.x    = THREE.MathUtils.lerp(g.scale.x, 1.0, lp)
      g.scale.y    = THREE.MathUtils.lerp(g.scale.y, 1.0, lp)
      if (mainMat)   mainMat.opacity   = THREE.MathUtils.lerp(mainMat.opacity,   0.42 + Math.sin(now * 0.30) * 0.025, lp)
      if (fabricMat) fabricMat.opacity = THREE.MathUtils.lerp(fabricMat.opacity, 0.24, lp)
      if (glowMat)   glowMat.opacity   = THREE.MathUtils.lerp(glowMat.opacity,   0.09, lp)
      if (edgeMat)   edgeMat.opacity   = THREE.MathUtils.lerp(edgeMat.opacity,   0.62, lp)
      if (foldsMat)  foldsMat.opacity  = THREE.MathUtils.lerp(foldsMat.opacity,  0.32, lp)
      if (emberMat)  emberMat.opacity  = THREE.MathUtils.lerp(emberMat.opacity,  0.42, lp)
    } else if (state === 'listening') {
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.sin(now * 0.22) * 0.042, lp)
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, lp)
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, lp)
      g.scale.x    = THREE.MathUtils.lerp(g.scale.x, 1.08, lp * 0.45)
      g.scale.y    = THREE.MathUtils.lerp(g.scale.y, 1.03, lp * 0.45)
      if (mainMat)   mainMat.opacity   = THREE.MathUtils.lerp(mainMat.opacity,   0.32 + Math.sin(now * 0.5) * 0.02, lp)
      if (fabricMat) fabricMat.opacity = THREE.MathUtils.lerp(fabricMat.opacity, 0.18, lp)
      if (glowMat)   glowMat.opacity   = THREE.MathUtils.lerp(glowMat.opacity,   0.14, lp)
      if (edgeMat)   edgeMat.opacity   = THREE.MathUtils.lerp(edgeMat.opacity,   0.82, lp)
      if (foldsMat)  foldsMat.opacity  = THREE.MathUtils.lerp(foldsMat.opacity,  0.55, lp)
      if (emberMat)  emberMat.opacity  = THREE.MathUtils.lerp(emberMat.opacity,  0.32, lp)
    } else if (state === 'thinking') {
      const wave = Math.sin(now * 2.0) * 0.5 + 0.5
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.sin(now * 0.28) * 0.07, lp)
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, lp)
      g.scale.x    = THREE.MathUtils.lerp(g.scale.x, 1.0, lp)
      g.scale.y    = THREE.MathUtils.lerp(g.scale.y, 1.0, lp)
      if (mainMat)   mainMat.opacity   = THREE.MathUtils.lerp(mainMat.opacity,   0.40 + wave * 0.12, lp)
      if (foldsMat)  foldsMat.opacity  = THREE.MathUtils.lerp(foldsMat.opacity, 0.18 + wave * 0.45, lp)
      if (edgeMat)   edgeMat.opacity   = THREE.MathUtils.lerp(edgeMat.opacity,   0.55 + wave * 0.28, lp)
      if (glowMat)   glowMat.opacity   = THREE.MathUtils.lerp(glowMat.opacity,   0.07 + wave * 0.10, lp)
      if (emberMat)  emberMat.opacity  = THREE.MathUtils.lerp(emberMat.opacity,  0.28 + wave * 0.24, lp)
    } else if (state === 'speaking') {
      // Whole-membrane breathing — never frequency bars
      const breathe = Math.sin(now * (Math.PI * 2 / 2.8)) * 0.5 + 0.5
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.sin(now * 0.2) * 0.06, lp)
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, lp)
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, lp)
      g.scale.x    = THREE.MathUtils.lerp(g.scale.x, 1 + breathe * 0.026, lp)
      g.scale.y    = THREE.MathUtils.lerp(g.scale.y, 1 + breathe * 0.012, lp)
      if (mainMat)   mainMat.opacity   = THREE.MathUtils.lerp(mainMat.opacity,   0.44 + breathe * 0.11, lp)
      if (fabricMat) fabricMat.opacity = THREE.MathUtils.lerp(fabricMat.opacity, 0.22 + breathe * 0.05, lp)
      if (glowMat)   glowMat.opacity   = THREE.MathUtils.lerp(glowMat.opacity,   0.11 + breathe * 0.07, lp)
      if (edgeMat)   edgeMat.opacity   = THREE.MathUtils.lerp(edgeMat.opacity,   0.70 + breathe * 0.16, lp)
      if (foldsMat)  foldsMat.opacity  = THREE.MathUtils.lerp(foldsMat.opacity,  0.36, lp)
      // Ember brightens as AI speaks — warm arrival accent
      if (emberMat)  emberMat.opacity  = THREE.MathUtils.lerp(emberMat.opacity,  0.52 + breathe * 0.32, lp)
    }
    // One shared deformation keeps glass, fabric and metal edge attached.
    const geos = [mainGeo, fabricGeo, glowGeo, edgeGeo, foldsGeo, emberGeo]
    for (let k = 0; k < geos.length; k++) {
      const attr = geos[k].attributes.position as THREE.BufferAttribute
      const base = basePositions[k]
      for (let i = 0; i < attr.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
        const envelope = Math.max(0, 1 - Math.pow(y / 1.5, 2))
        attr.setXYZ(i, x + Math.sin(y * 2.1 + now * .38) * .015 * envelope, y, z + Math.sin(y * 2.4 + now * .46) * .035 * envelope)
      }
      attr.needsUpdate = true
      if (k < 2) geos[k].computeVertexNormals()
    }
    if (mainMat) mainMat.iridescence = damp(mainMat.iridescence, .35 + field.current.energy * .035, delta, 2)
    if (glowRef.current) glowRef.current.position.x = damp(glowRef.current.position.x, .02 + field.current.x * field.current.energy * .003, delta, 2)
    if (fabricRef.current) fabricRef.current.rotation.y = Math.sin(now * .23 + 1.2) * .025
  })

  return (
    <group ref={groupRef}>
      {/* ① Tensioned fabric — farthest back, roughest, widest */}
      <mesh ref={fabricRef} geometry={fabricGeo} position={[0, 0, -0.22]}>
        <meshStandardMaterial
          color="#CDD8D4"
          transparent
          opacity={0.24}
          side={THREE.DoubleSide}
          roughness={0.96}
          metalness={0.0}
          depthWrite={false}
        />
      </mesh>

      {/* ② Main optical glass membrane — iridescent, mid-plane */}
      <mesh ref={mainRef} geometry={mainGeo}>
        <meshPhysicalMaterial
          color="#527870"
          transparent
          opacity={0.42}
          side={THREE.DoubleSide}
          roughness={0.03}
          metalness={0.22}
          iridescence={0.35}
          iridescenceIOR={1.5}
          iridescenceThicknessRange={[80, 400] as unknown as [number, number]}
          depthWrite={false}
        />
      </mesh>

      {/* ③ Glass glow strip — forward, additive blending */}
      <mesh ref={glowRef} geometry={glowGeo} position={[0.02, 0, 0.13]}>
        <meshBasicMaterial
          color="#C4E7DE"
          transparent
          opacity={0.09}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* ④ Luminous right edge — liquid metal precision */}
      <lineSegments ref={edgeRef} geometry={edgeGeo}>
        <lineBasicMaterial color="#EAF2EF" transparent opacity={0.62} depthWrite={false} />
      </lineSegments>

      {/* ⑤ Internal fold lines — refraction trace */}
      <lineSegments ref={foldsRef} geometry={foldsGeo}>
        <lineBasicMaterial color="#B8CBC7" transparent opacity={0.32} depthWrite={false} />
      </lineSegments>

      {/* ⑥ Ember arrival accent — rare warm #D49374 */}
      <lineSegments ref={emberRef} geometry={emberGeo}>
        <lineBasicMaterial color="#D49374" transparent opacity={0.44} depthWrite={false} />
      </lineSegments>
    </group>
  )
}


type Screen = 'landing' | 'consent' | 'interview' | 'thanks'
type Field = { x: number; y: number; energy: number }
const damp = (a: number, b: number, dt: number, rate = 5) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt))

function useMotionPreference() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function layout(screen: Screen, w: number, h: number) {
  const mobile = w < 640
  const config = { landing: [.42, .12, .52, 340, 560, .20, 160, 240], consent: [.64, .10, .46, 280, 480, .16, 130, 200], interview: [.70, .08, .42, 240, 440, .14, 110, 180], thanks: [.46, .14, .48, 320, 520, .18, 150, 220] }[screen]
  const height = mobile ? Math.min(h * .30, 230) : THREE.MathUtils.clamp(h * config[2], config[3], config[4])
  const width = THREE.MathUtils.clamp(w * config[5], config[6], config[7])
  const centerX = mobile ? w * .78 : w * config[0] + width / 2
  const centerY = mobile ? h * .21 : h * config[1] + height / 2
  return { x: (centerX - w / 2) / 100, y: (h / 2 - centerY) / 100, scale: height / 291 }
}

function SignalPlacement({ screen, state, reducedMotion, field }: { screen: Screen; state: SignalState; reducedMotion: boolean; field: React.MutableRefObject<Field> }) {
  const group = useRef<THREE.Group>(null)
  const { size } = useThree()
  const initial = useRef(layout(screen, size.width, size.height))
  useFrame((_, dt) => {
    if (!group.current) return
    const target = layout(screen, size.width, size.height)
    const delta = Math.min(dt, .04)
    const g = group.current
    g.position.x = reducedMotion ? target.x : damp(g.position.x, target.x, delta, 4.8)
    g.position.y = reducedMotion ? target.y : damp(g.position.y, target.y, delta, 4.8)
    const scale = reducedMotion ? target.scale : damp(g.scale.x, target.scale, delta, 4.8)
    g.scale.setScalar(scale)
  })
  return <group ref={group} position={[initial.current.x, initial.current.y, 0]} scale={initial.current.scale}><SignalScene state={state} reducedMotion={reducedMotion} field={field} /></group>
}

function AmbientSpecks({ state, reducedMotion, field }: SceneProps) {
  const points = useRef<THREE.Points>(null)
  const { size } = useThree()
  const count = size.width < 640 ? 18 : 42
  const seeds = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ x: srand(i * 7 + 4), y: srand(i * 3 + 8), z: srand(i * 5 + 13), phase: srand(i + 51) * Math.PI * 2 })), [])
  const geometry = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(42 * 3), 3)); return g }, [])
  const time = useRef(0)
  const activity = useRef(.3)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, dt) => {
    if (!points.current) return
    const delta = Math.min(dt, .04)
    if (!reducedMotion) time.current += delta
    activity.current = damp(activity.current, state === 'speaking' ? 1 : state === 'thinking' ? .65 : .3, delta, 1.5)
    field.current.energy = reducedMotion ? 0 : field.current.energy * Math.exp(-delta * 2.3)
    geometry.setDrawRange(0, count)
    const a = geometry.attributes.position as THREE.BufferAttribute
    const w = size.width / 100, h = size.height / 100
    const t = time.current
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      // Seeded lanes at the page margins leave the reading column calm.
      const lane = i % 2 === 0 ? .04 + s.x * .14 : .66 + s.x * .30
      let x = (lane - .5) * w + (reducedMotion ? 0 : Math.sin(t * .13 + s.phase) * .09)
      let y = (.45 - s.y * .88) * h + (reducedMotion ? 0 : Math.sin(t * .09 + s.phase * 1.7) * (.10 + activity.current * .06))
      const dx = x - field.current.x, dy = y - field.current.y
      const influence = Math.exp(-(dx * dx + dy * dy) / .8) * field.current.energy * .10
      x += dx * influence; y += dy * influence
      a.setXYZ(i, x, y, -.8 + s.z * .5)
    }
    a.needsUpdate = true
    const mat = points.current.material as THREE.PointsMaterial
    mat.opacity = reducedMotion ? .12 : .18 + activity.current * .07
  })
  return <points ref={points} geometry={geometry} frustumCulled={false}><pointsMaterial color="#527870" size={1.7} sizeAttenuation={false} transparent opacity={.2} depthWrite={false} /></points>
}

export default function MiraiSignal({ state, screen }: { state: SignalState; screen: Screen }) {
  const reducedMotion = useMotionPreference()
  const field = useRef<Field>({ x: 0, y: 0, energy: 0 })
  useEffect(() => {
    if (reducedMotion) return
    const fine = window.matchMedia('(pointer: fine)')
    let lastX = 0, lastY = 0, lastAt = 0
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === 'touch') return
      const now = performance.now()
      if (now - lastAt < 32) return
      const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY)
      field.current.x = (event.clientX - window.innerWidth / 2) / 100
      field.current.y = (window.innerHeight / 2 - event.clientY) / 100
      field.current.energy = Math.min(1, field.current.energy + Math.min(distance, 60) / 100)
      lastX = event.clientX; lastY = event.clientY; lastAt = now
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [reducedMotion])
  return <div aria-hidden="true" data-mirai-scene="persistent" style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
    <Canvas frameloop={reducedMotion ? 'demand' : 'always'} orthographic camera={{ position: [0, 0, 10], zoom: 100, near: .1, far: 40 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }} dpr={[1, 1.5]} style={{ background: 'transparent', pointerEvents: 'none' }}>
      <ambientLight intensity={.45} />
      <directionalLight position={[1.5, 2, 2.5]} intensity={1} color="#C4E7DE" />
      <directionalLight position={[-2, -1, -1]} intensity={.35} color="#D9E2DE" />
      <pointLight position={[.4, .3, 1.8]} intensity={.55} color="#F3F6F4" />
      <SignalPlacement screen={screen} state={state} reducedMotion={reducedMotion} field={field} />
      <AmbientSpecks state={state} reducedMotion={reducedMotion} field={field} />
    </Canvas>
  </div>
}
