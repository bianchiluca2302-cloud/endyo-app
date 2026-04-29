import { useRef, Suspense, useMemo } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { TextureLoader } from 'three'
import * as THREE from 'three'

// Texture 1×1 trasparente – fallback per useLoader incondizionale
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// ── Proporzioni realistiche per categoria [larghezza, altezza, profondità] ────
// Ogni capo ha proporzioni fisiche credibili, non box generici
const CAT_DIMS = {
  cappello:   [1.80, 1.00, 0.60],  // più largo che alto, profondità per la calotta
  maglietta:  [1.85, 2.00, 0.28],  // quasi quadrato, sottile (tessuto piatto)
  felpa:      [2.05, 2.20, 0.36],  // più grande e spessa della maglietta
  giacchetto: [2.10, 2.30, 0.52],  // spalle larghe, più spessa (imbottitura)
  pantaloni:  [1.40, 2.60, 0.28],  // stretto e alto, sottile
  scarpe:     [2.20, 0.95, 0.85],  // molto largo, basso, profondo (volume 3D scarpa)
}

// ── Colori di categoria per lo stato senza foto ──────────────────────────────
const CAT_COLOR = {
  cappello:   '#7c3aed',
  maglietta:  '#2563eb',
  felpa:      '#059669',
  giacchetto: '#d97706',
  pantaloni:  '#4f46e5',
  scarpe:     '#dc2626',
}

// ── Materiale bordo (lati del box) ───────────────────────────────────────────
const EDGE_PROPS = { color: '#0d0a1a', roughness: 0.92, metalness: 0.02 }

// ── Box 3D con fronte/retro dalle foto reali ─────────────────────────────────
// BoxGeometry face order: +X(0), -X(1), +Y(2), -Y(3), +Z front(4), -Z back(5)
// Ogni faccia ha UV autonomi [0,1]×[0,1] → foto non distorta
function GarmentBox({ category, frontTex, backTex, hasPhoto }) {
  const ref = useRef()
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.38
  })

  const [W, H, D] = CAT_DIMS[category] || CAT_DIMS.maglietta
  const color = CAT_COLOR[category] || '#4f46e5'

  // Materiali per ogni faccia – approccio imperativo per massima compatibilità
  const materials = useMemo(() => {
    const edge  = new THREE.MeshStandardMaterial(EDGE_PROPS)
    const front = hasPhoto
      ? new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.50, metalness: 0.0 })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.60, metalness: 0.06 })
    const back  = hasPhoto
      ? new THREE.MeshStandardMaterial({ map: backTex || frontTex, roughness: 0.50, metalness: 0.0 })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.60, metalness: 0.06 })
    // [+X, -X, +Y, -Y, front(+Z), back(-Z)]
    return [edge, edge, edge, edge, front, back]
  }, [hasPhoto, frontTex, backTex, color])

  return (
    <mesh ref={ref} material={materials} castShadow receiveShadow>
      <boxGeometry args={[W, H, D]} />
    </mesh>
  )
}

// ── Loader wrapper (hooks sempre incondizionali) ──────────────────────────────
function GarmentLoader({ category, frontUrl, backUrl }) {
  const fTex = useLoader(TextureLoader, frontUrl || BLANK)
  const bTex = useLoader(TextureLoader, backUrl  || frontUrl || BLANK)

  // Spazio colore corretto + nessuna ripetizione
  useMemo(() => {
    [fTex, bTex].forEach(t => {
      if (!t) return
      t.colorSpace   = THREE.SRGBColorSpace
      t.wrapS        = THREE.ClampToEdgeWrapping
      t.wrapT        = THREE.ClampToEdgeWrapping
      t.needsUpdate  = true
    })
  }, [fTex, bTex])

  return (
    <GarmentBox
      category={category}
      frontTex={frontUrl ? fTex : null}
      backTex={backUrl   ? bTex : null}
      hasPhoto={!!frontUrl}
    />
  )
}

// ── Componente esportato ──────────────────────────────────────────────────────
export default function Viewer3D({ category, textureUrl, backUrl, style = {} }) {
  const [W, H, D] = CAT_DIMS[category] || CAT_DIMS.maglietta
  // Camera centrata sul centro del box, distanza adattiva
  const camZ = Math.max(W, H) * 1.55 + D

  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <Canvas
        camera={{ position: [0, 0, camZ], fov: 46 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Luci: principale dall'alto-sinistra + fill da dietro + accent viola */}
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[-3.5, 5, 4]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[3, -2, -3]} intensity={0.20} />
        <pointLight position={[0, H * 0.8, 2]} intensity={0.45} color="#c084fc" />
        <pointLight position={[0, -H * 0.5, 1]} intensity={0.18} color="#6366f1" />

        <Suspense fallback={null}>
          <GarmentLoader
            category={category}
            frontUrl={textureUrl}
            backUrl={backUrl}
          />
          {/* Ombra morbida sul pavimento */}
          <ContactShadows
            position={[0, -H / 2 - 0.01, 0]}
            opacity={0.38}
            scale={Math.max(W, D) * 2.5}
            blur={2.2}
            far={1.5}
            color="#1a0a3a"
          />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={camZ * 0.45}
          maxDistance={camZ * 2.2}
          minPolarAngle={Math.PI / 10}
          maxPolarAngle={Math.PI - Math.PI / 10}
        />
      </Canvas>
    </div>
  )
}
