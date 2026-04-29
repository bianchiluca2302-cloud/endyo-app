import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DI PROPORZIONI
// Riferimento: persona media 175cm / 75kg
// 1 unità THREE.js ≈ 46.4cm
// ═══════════════════════════════════════════════════════════════════════════════

const CM_PER_UNIT = 175 / 3.77
const REF = {
  height: 175, weight: 75, chest: 96, waist: 80, hips: 96,
  shoulder: 46, armLen: 65, legLen: 85, thigh: 55, neck: 38,
}

export function buildGeometry(m = {}) {
  const {
    height_cm         = REF.height,
    weight_kg         = REF.weight,
    chest_cm          = REF.chest,
    waist_cm          = REF.waist,
    hips_cm           = REF.hips,
    shoulder_width_cm = REF.shoulder,
    arm_length_cm     = REF.armLen,
    leg_length_cm     = REF.legLen,
    thigh_cm          = REF.thigh,
    neck_cm           = REF.neck,
    gender            = null,
  } = m

  const isFemale    = gender === 'femmina'
  const shoulderRef = isFemale ? 40 : REF.shoulder
  const legRef      = isFemale ? 78 : REF.legLen
  const armRef      = isFemale ? 58 : REF.armLen
  const thighRef    = isFemale ? 58 : REF.thigh   // eslint-disable-line no-unused-vars

  const h_m  = height_cm / 100
  const bmi  = weight_kg / (h_m * h_m)
  const bmiF = Math.max(0.72, Math.min(1.70, bmi / 22))

  const heightScale   = height_cm / REF.height
  const shoulderScale = shoulder_width_cm / shoulderRef
  const legLenScale   = leg_length_cm / legRef
  const armLenScale   = arm_length_cm / armRef

  const cm2u = (c) => c / CM_PER_UNIT

  const headR = 0.42 * heightScale
  const neckR = Math.max(0.12, cm2u(neck_cm / (2 * Math.PI)) * heightScale)
  const neckH = 0.34 * heightScale

  const torsoW = 0.85 * shoulderScale * heightScale * (bmiF ** 0.25)
  const torsoH = 1.08 * heightScale
  const torsoD = Math.max(0.22, cm2u(chest_cm / Math.PI) * 0.85 * (bmiF ** 0.5))

  const waistR = Math.max(
    torsoW * 0.22,
    Math.min(torsoW * 0.58, (torsoW / 2) * 0.78 * (waist_cm / REF.waist))
  )
  const waistW = waistR * 2

  const hipScale = hips_cm / REF.hips
  const hipW = Math.max(torsoW * 0.78, 0.75 * hipScale * heightScale * (bmiF ** 0.3))
  const hipH = 0.26 * heightScale
  const hipD = Math.max(0.20, cm2u(hips_cm / Math.PI) * 0.75 * (bmiF ** 0.4))

  const armOffsetX = (torsoW / 2) + 0.05
  const upperArmR  = Math.max(0.09, 0.125 * (bmiF ** 0.55) * heightScale)
  const forearmR   = Math.max(0.07, 0.098 * (bmiF ** 0.45) * heightScale)
  const upperArmH  = 0.68 * armLenScale * heightScale
  const forearmH   = 0.60 * armLenScale * heightScale

  const legOffsetX = Math.min(0.26, hipW * 0.29)
  const thighR     = thigh_cm
    ? Math.max(0.10, cm2u(thigh_cm / (2 * Math.PI)) * 1.05 * (bmiF ** 0.3))
    : Math.max(0.10, 0.165 * (bmiF ** 0.55) * heightScale)
  const shinR  = Math.max(0.08, thighR * 0.74)
  const thighH = 0.74 * legLenScale * heightScale
  const shinH  = 0.70 * legLenScale * heightScale

  const soleY     = -0.44 * heightScale
  const shinBotY  = soleY + 0.28 * heightScale
  const thighBotY = shinBotY + shinH
  const hipBotY   = thighBotY + thighH
  const torsoBotY = hipBotY + hipH
  const torsoTopY = torsoBotY + torsoH
  const neckBotY  = torsoTopY
  const headY     = neckBotY + neckH + headR + 0.01

  const shoulderY  = torsoTopY - upperArmH * 0.05
  const upperArmCY = shoulderY - upperArmH / 2
  const elbowY     = shoulderY - upperArmH
  const forearmCY  = elbowY - forearmH / 2
  const thighCY    = thighBotY + thighH / 2
  const shinCY     = shinBotY + shinH / 2

  return {
    heightScale, bmiF,
    head:     { r: headR, y: headY },
    neck:     { r: neckR, h: neckH, y: neckBotY + neckH / 2 },
    torso:    { w: torsoW, h: torsoH, d: torsoD, botY: torsoBotY, waistW, waistR },
    hip:      { w: hipW,  h: hipH,   d: hipD,   y: hipBotY },
    upperArm: { r: upperArmR, h: upperArmH, y: upperArmCY, x: armOffsetX },
    forearm:  { r: forearmR,  h: forearmH,  y: forearmCY,  x: armOffsetX * 1.02 },
    thigh:    { r: thighR,    h: thighH,    y: thighCY,    x: legOffsetX },
    shin:     { r: shinR,     h: shinH,     y: shinCY,     x: legOffsetX },
    shoe:     { y: soleY, x: legOffsetX, scale: heightScale },
    hat:      { y: headY + headR + 0.04, headR },
    bodyMidY: (headY + soleY) / 2,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORPO OLOGRAFICO "BODY SCAN"
// Il corpo è sempre visibile come wireframe olografico.
// Quando vestito diventa molto tenue (ghost sotto i vestiti).
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  fill:        '#312e81',
  fillOpacity: 0.28,
  fillDressed: 0.08,    // quasi trasparente sotto i vestiti
  wire:        '#818cf8',
  wireOpacity: 0.55,
  wireDressed: 0.16,    // griglia tenue quando vestito
}

function FillMat({ dressed = false }) {
  return (
    <meshStandardMaterial
      color={C.fill}
      transparent
      opacity={dressed ? C.fillDressed : C.fillOpacity}
      roughness={0.7}
      side={THREE.DoubleSide}
    />
  )
}

function WireMat({ dressed = false }) {
  return (
    <meshBasicMaterial
      color={C.wire}
      wireframe
      transparent
      opacity={dressed ? C.wireDressed : C.wireOpacity}
    />
  )
}

function BodyCapsule({ r, h, pos, rot, dressed }) {
  const capLen = Math.max(0.001, h - 2 * r)
  const geo    = useMemo(() => new THREE.CapsuleGeometry(r, capLen, 5, 14), [r, capLen])
  return (
    <group position={pos} rotation={rot}>
      <mesh geometry={geo}><FillMat dressed={dressed} /></mesh>
      <mesh geometry={geo}><WireMat dressed={dressed} /></mesh>
    </group>
  )
}

function BodySphere({ r, pos, dressed }) {
  const geo = useMemo(() => new THREE.SphereGeometry(r, 20, 16), [r])
  return (
    <group position={pos}>
      <mesh geometry={geo}><FillMat dressed={dressed} /></mesh>
      <mesh geometry={geo}><WireMat dressed={dressed} /></mesh>
    </group>
  )
}

function BodyTorso({ geo, dressed }) {
  const { torso, hip } = geo
  const H = hip.h + torso.h
  const points = useMemo(() => [
    new THREE.Vector2(hip.w * 0.44,  0),
    new THREE.Vector2(hip.w * 0.50,  H * 0.08),
    new THREE.Vector2(hip.w * 0.46,  H * 0.18),
    new THREE.Vector2(torso.waistR,  H * 0.30),
    new THREE.Vector2(torso.w * 0.42, H * 0.46),
    new THREE.Vector2(torso.w * 0.47, H * 0.60),
    new THREE.Vector2(torso.w * 0.50, H * 0.76),
    new THREE.Vector2(torso.w * 0.50, H * 0.87),
    new THREE.Vector2(torso.w * 0.44, H),
  ], [hip.w, hip.h, torso.w, torso.h, torso.waistR])

  const latheGeo   = useMemo(() => new THREE.LatheGeometry(points, 26), [points])
  const depthScale = Math.min(0.78, (torso.d * 1.1) / torso.w)

  return (
    <group position={[0, geo.hip.y, 0]} scale={[1, 1, depthScale]}>
      <mesh geometry={latheGeo}><FillMat dressed={dressed} /></mesh>
      <mesh geometry={latheGeo}><WireMat dressed={dressed} /></mesh>
    </group>
  )
}

function BodyShoulderJoint({ geo, side, dressed }) {
  const { upperArm, torso } = geo
  const r = upperArm.r * 1.18
  const y = torso.botY + torso.h - r * 0.4
  const x = side * (torso.w / 2 + r * 0.35)
  return (
    <group position={[x, y, 0]}>
      <mesh><sphereGeometry args={[r, 14, 10]} /><FillMat dressed={dressed} /></mesh>
      <mesh><sphereGeometry args={[r, 14, 10]} /><WireMat dressed={dressed} /></mesh>
    </group>
  )
}

function BodyShoe({ geo, side, dressed }) {
  const { shoe } = geo
  const s = shoe.scale
  return (
    <group position={[side * shoe.x, shoe.y, 0]}>
      <mesh position={[side * 0.01, 0.17 * s, 0]}>
        <boxGeometry args={[0.25 * s, 0.21 * s, 0.54 * s]} />
        <FillMat dressed={dressed} />
      </mesh>
      <mesh position={[side * 0.01, 0.17 * s, 0]}>
        <boxGeometry args={[0.25 * s, 0.21 * s, 0.54 * s]} />
        <WireMat dressed={dressed} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER ABBIGLIAMENTO
// Geometrie ingrandite rispetto al corpo → effetto vestito indossato
// Colore dal campo color_hex del capo (analisi AI)
// ═══════════════════════════════════════════════════════════════════════════════

// Utility: scurisce un colore hex di un fattore [0,1]
function darkenHex(hex, f = 0.75) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return '#222'
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * f)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * f)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * f)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// Colori fallback per categoria se color_hex non disponibile
const CAT_FALLBACK = {
  cappello:   '#4a3728',
  maglietta:  '#1e3a5f',
  felpa:      '#2d4a2d',
  giacchetto: '#3d2b1f',
  pantaloni:  '#1a1a2e',
  scarpe:     '#1c1c1c',
}

function clothColor(garment) {
  return garment?.color_hex || CAT_FALLBACK[garment?.category] || '#333'
}

// Capsula per abbigliamento (nessun wireframe, solo materiale solido)
function ClothCapsule({ r, h, pos, rot, color, roughness = 0.82 }) {
  const capLen = Math.max(0.001, h - 2 * r)
  const geo    = useMemo(() => new THREE.CapsuleGeometry(r, capLen, 6, 16), [r, capLen])
  return (
    <group position={pos} rotation={rot || [0, 0, 0]}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={roughness} metalness={0.0} />
      </mesh>
    </group>
  )
}

// Torso ingrandito per abbigliamento (LatheGeometry * bulk)
function ClothTorso({ geo, bulk, color }) {
  const { torso, hip } = geo
  const H = hip.h + torso.h
  const waistR = torso.waistR || torso.w * 0.39

  const points = useMemo(() => [
    new THREE.Vector2(hip.w  * 0.44 * bulk, 0),
    new THREE.Vector2(hip.w  * 0.50 * bulk, H * 0.08),
    new THREE.Vector2(hip.w  * 0.46 * bulk, H * 0.18),
    new THREE.Vector2(waistR * bulk,         H * 0.30),
    new THREE.Vector2(torso.w * 0.42 * bulk, H * 0.46),
    new THREE.Vector2(torso.w * 0.47 * bulk, H * 0.60),
    new THREE.Vector2(torso.w * 0.50 * bulk, H * 0.76),
    new THREE.Vector2(torso.w * 0.52 * bulk, H * 0.87),
    new THREE.Vector2(torso.w * 0.46 * bulk, H),
  ], [hip.w, hip.h, torso.w, torso.h, waistR, bulk])

  const latheGeo   = useMemo(() => new THREE.LatheGeometry(points, 28), [points])
  const depthScale = Math.min(0.84, (torso.d * bulk * 1.12) / (torso.w * bulk))

  return (
    <group position={[0, geo.hip.y, 0]} scale={[1, 1, depthScale]}>
      <mesh geometry={latheGeo} castShadow>
        <meshStandardMaterial color={color} roughness={0.82} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ── Maglietta / Felpa / Giacchetto ────────────────────────────────────────────
function ShirtLayer({ geo, category, color }) {
  const bulk    = category === 'giacchetto' ? 1.13 : category === 'felpa' ? 1.08 : 1.05
  const isShort = category === 'maglietta'   // maniche corte
  const { upperArm, forearm, neck } = geo

  const collarColor = category === 'giacchetto' ? darkenHex(color, 0.80) : color

  return (
    <group>
      {/* Torso (silhouette umana ingrandita) */}
      <ClothTorso geo={geo} bulk={bulk} color={color} />

      {/* Giunti spalla ingranditi */}
      {[-1, 1].map(side => {
        const r = upperArm.r * 1.20 * bulk
        const y = geo.torso.botY + geo.torso.h - r * 0.35
        const x = side * (geo.torso.w / 2 * bulk + r * 0.30)
        return (
          <mesh key={side} position={[x, y, 0]} castShadow>
            <sphereGeometry args={[r, 14, 10]} />
            <meshStandardMaterial color={color} roughness={0.82} />
          </mesh>
        )
      })}

      {/* Maniche */}
      {[-1, 1].map(side => (
        <group key={side}>
          {/* Braccio superiore */}
          <ClothCapsule
            r={upperArm.r * 1.10 * bulk}
            h={upperArm.h * (isShort ? 0.50 : 1.02)}
            pos={[
              side * upperArm.x * 1.02,
              isShort ? upperArm.y + upperArm.h * 0.25 : upperArm.y,
              0,
            ]}
            rot={[0, 0, side * 0.14]}
            color={color}
          />
          {/* Braccio inferiore (solo maniche lunghe) */}
          {!isShort && (
            <ClothCapsule
              r={forearm.r * 1.08 * bulk}
              h={forearm.h * 1.02}
              pos={[side * forearm.x * 1.02, forearm.y, 0]}
              rot={[0, 0, side * 0.05]}
              color={color}
            />
          )}
        </group>
      ))}

      {/* Colletto */}
      <ClothCapsule
        r={neck.r * (category === 'giacchetto' ? 1.18 : 1.10)}
        h={neck.h * 0.50}
        pos={[0, neck.y - neck.h * 0.26, 0]}
        rot={[0, 0, 0]}
        color={collarColor}
        roughness={0.90}
      />

      {/* Bavero giacchetto */}
      {category === 'giacchetto' && [-1, 1].map(side => (
        <mesh
          key={side}
          position={[side * geo.torso.w * 0.22, geo.torso.botY + geo.torso.h * 0.82, geo.torso.d * 0.44]}
          rotation={[0, 0, side * 0.38]}
          castShadow
        >
          <boxGeometry args={[geo.torso.w * 0.14, geo.torso.h * 0.26, 0.025]} />
          <meshStandardMaterial color={darkenHex(color, 0.88)} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

// ── Pantaloni ─────────────────────────────────────────────────────────────────
function PantsLayer({ geo, color }) {
  const { hip, thigh, shin } = geo
  const bulk = 1.06

  return (
    <group>
      {/* Cintura (cilindro leggermente più scuro) */}
      <mesh position={[0, hip.y + hip.h * 0.82, 0]} castShadow>
        <cylinderGeometry args={[hip.w * 0.52, hip.w * 0.52, hip.h * 0.28, 28]} />
        <meshStandardMaterial color={darkenHex(color, 0.82)} roughness={0.90} metalness={0.0} />
      </mesh>

      {/* Parte superiore gamba (zona anca) */}
      {[-1, 1].map(side => (
        <group key={side}>
          <ClothCapsule
            r={thigh.r * bulk}
            h={thigh.h * 1.02}
            pos={[side * thigh.x, thigh.y, 0]}
            rot={[0, 0, 0]}
            color={color}
          />
          <ClothCapsule
            r={shin.r * bulk}
            h={shin.h * 1.02}
            pos={[side * shin.x, shin.y, 0]}
            rot={[0, 0, 0]}
            color={color}
          />
        </group>
      ))}
    </group>
  )
}

// ── Scarpe ────────────────────────────────────────────────────────────────────
function ShoeLayer({ geo, color }) {
  const { shoe } = geo
  const s    = shoe.scale
  const sole = '#111118'

  return (
    <>
      {[-1, 1].map(side => (
        <group key={side} position={[side * shoe.x, shoe.y, 0]}>
          {/* Suola */}
          <mesh position={[side * 0.02, 0.032 * s, 0.05 * s]} castShadow>
            <boxGeometry args={[0.28 * s, 0.075 * s, 0.62 * s]} />
            <meshStandardMaterial color={sole} roughness={0.95} />
          </mesh>
          {/* Tomaia principale */}
          <mesh position={[side * 0.01, 0.155 * s, 0.01 * s]} castShadow>
            <boxGeometry args={[0.26 * s, 0.19 * s, 0.52 * s]} />
            <meshStandardMaterial color={color} roughness={0.70} metalness={0.0} />
          </mesh>
          {/* Punta arrotondata */}
          <mesh position={[side * (-0.12 * s), 0.10 * s, -0.24 * s]} castShadow>
            <sphereGeometry args={[0.13 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.35]} />
            <meshStandardMaterial color={color} roughness={0.70} />
          </mesh>
          {/* Tallone */}
          <mesh position={[side * 0.01, 0.09 * s, 0.25 * s]} castShadow>
            <boxGeometry args={[0.23 * s, 0.20 * s, 0.13 * s]} />
            <meshStandardMaterial color={color} roughness={0.72} />
          </mesh>
          {/* Linguetta */}
          <mesh position={[side * 0.01, 0.28 * s, -0.12 * s]} castShadow>
            <boxGeometry args={[0.14 * s, 0.12 * s, 0.025]} />
            <meshStandardMaterial color={darkenHex(color, 0.85)} roughness={0.88} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// ── Cappello ──────────────────────────────────────────────────────────────────
function HatLayer({ geo, color }) {
  const { hat } = geo
  const r = hat.headR * 1.05
  return (
    <group position={[0, hat.y, 0]}>
      {/* Tesa */}
      <mesh castShadow>
        <cylinderGeometry args={[r * 1.62, r * 1.62, r * 0.13, 32]} />
        <meshStandardMaterial color={darkenHex(color, 0.88)} roughness={0.88} />
      </mesh>
      {/* Calotta */}
      <mesh position={[0, r * 0.56, 0]} castShadow>
        <cylinderGeometry args={[r * 0.90, r * 0.94, r * 1.08, 28]} />
        <meshStandardMaterial color={color} roughness={0.84} metalness={0.0} />
      </mesh>
      {/* Coperchio */}
      <mesh position={[0, r * 1.10, 0]}>
        <cylinderGeometry args={[r * 0.90, r * 0.90, 0.025, 28]} />
        <meshStandardMaterial color={darkenHex(color, 0.82)} roughness={0.88} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENA COMPLETA
// ═══════════════════════════════════════════════════════════════════════════════

function AvatarScene({ garments, geo }) {
  const getByCategory = (cat) => garments.find(g => g.category === cat)

  const hatG   = getByCategory('cappello')
  const shirtG = getByCategory('maglietta') ||
                 getByCategory('felpa')     ||
                 getByCategory('giacchetto')
  const pantsG = getByCategory('pantaloni')
  const shoeG  = getByCategory('scarpe')

  // Il corpo diventa ghost quando almeno torso o gambe sono vestiti
  const torsoVestito = !!shirtG
  const gambeVestite = !!pantsG
  const piedeVestito = !!shoeG

  const { head, neck, upperArm, forearm, thigh, shin } = geo

  return (
    <group>

      {/* ── CORPO OLOGRAFICO ─────────────────────────────────────────────── */}
      {/* Testa + occhi (mai coperta) */}
      <BodySphere r={head.r} pos={[0, head.y, 0]} dressed={false} />
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * head.r * 0.30, head.y + head.r * 0.12, head.r * 0.90]}>
          <sphereGeometry args={[head.r * 0.10, 8, 8]} />
          <meshStandardMaterial color="#1a0f08" />
        </mesh>
      ))}

      {/* Collo */}
      <BodyCapsule
        r={Math.max(0.01, neck.r)}
        h={neck.h + neck.r * 2}
        pos={[0, neck.y, 0]}
        rot={[0, 0, 0]}
        dressed={torsoVestito}
      />

      {/* Torso + fianchi */}
      <BodyTorso geo={geo} dressed={torsoVestito || gambeVestite} />

      {/* Giunti spalla */}
      <BodyShoulderJoint geo={geo} side={-1} dressed={torsoVestito} />
      <BodyShoulderJoint geo={geo} side={ 1} dressed={torsoVestito} />

      {/* Braccia */}
      {[-1, 1].map(side => (
        <group key={side}>
          <BodyCapsule
            r={upperArm.r}
            h={upperArm.h}
            pos={[side * upperArm.x, upperArm.y, 0]}
            rot={[0, 0, side * 0.14]}
            dressed={torsoVestito}
          />
          <BodyCapsule
            r={forearm.r}
            h={forearm.h}
            pos={[side * forearm.x, forearm.y, 0]}
            rot={[0, 0, side * 0.05]}
            dressed={torsoVestito}
          />
        </group>
      ))}

      {/* Gambe */}
      {[-1, 1].map(side => (
        <group key={side}>
          <BodyCapsule
            r={thigh.r}
            h={thigh.h}
            pos={[side * thigh.x, thigh.y, 0]}
            rot={[0, 0, 0]}
            dressed={gambeVestite}
          />
          <BodyCapsule
            r={shin.r}
            h={shin.h}
            pos={[side * shin.x, shin.y, 0]}
            rot={[0, 0, 0]}
            dressed={gambeVestite}
          />
          <BodyShoe geo={geo} side={side} dressed={piedeVestito} />
        </group>
      ))}

      {/* ── LAYER ABBIGLIAMENTO (sopra al corpo) ─────────────────────────── */}
      {shirtG && (
        <ShirtLayer
          geo={geo}
          category={shirtG.category}
          color={clothColor(shirtG)}
        />
      )}
      {pantsG && (
        <PantsLayer geo={geo} color={clothColor(pantsG)} />
      )}
      {shoeG && (
        <ShoeLayer geo={geo} color={clothColor(shoeG)} />
      )}
      {hatG && (
        <HatLayer geo={geo} color={clothColor(hatG)} />
      )}

    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AvatarOutfit({ garments = [], measurements = {}, style = {} }) {
  const geo = buildGeometry(measurements)

  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <Canvas
        camera={{ position: [0, geo.bodyMidY + 0.1, 7.8], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 7, 4]} intensity={1.1} castShadow />
        <directionalLight position={[-3, 2, -3]} intensity={0.35} />
        <pointLight position={[0, geo.head.y + 0.5, 1.5]} intensity={0.7} color="#818cf8" />
        <pointLight position={[0, geo.shoe.y - 0.5, 1]} intensity={0.3} color="#6366f1" />

        <Suspense fallback={null}>
          <AvatarScene garments={garments} geo={geo} />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={3}
          maxDistance={10}
          minPolarAngle={Math.PI / 10}
          maxPolarAngle={Math.PI - Math.PI / 10}
          target={[0, geo.bodyMidY, 0]}
        />
      </Canvas>
    </div>
  )
}
