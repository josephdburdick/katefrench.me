import { CELLS, cityLayout } from "@/lib/block-city"
import {
  AmbientLight,
  BoxGeometry,
  Color,
  ColorManagement,
  DirectionalLight,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three"

export type CityScene = { light: (count: number) => void; dispose: () => void }

type Block = {
  mesh: Mesh<BoxGeometry, MeshLambertMaterial>
  rank: number
  h: number
  c: number
  target: number
  next: number
  at: number
}

const UNLIT_HEIGHT = 0.12
// A full city hides its empty lots behind tall blocks, so blocks get shorter as more are lit.
const CROWDED_SPAN = 0.4

function tokenColor(name: string) {
  const [h, s, l] = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map(parseFloat)
  return new Color().setHSL(h / 360, s / 100, l / 100)
}

/**
 * Draws the block city into `canvas`, sized to `stage`. Returns null when the
 * browser has no WebGL 2. Calls `onFirstFrame` once, after the first render.
 */
export function createCityScene(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  onFirstFrame: () => void,
): CityScene | null {
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true })
  if (!context) return null

  // The concept ran on three r128, which mixed colors in sRGB and scaled
  // light by PI. These two settings keep its shading with the same values.
  ColorManagement.enabled = false
  const renderer = new WebGLRenderer({ canvas, context, alpha: true })
  renderer.outputColorSpace = LinearSRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new Scene()
  const camera = new OrthographicCamera(-8, 8, 6, -6, 0.1, 100)
  camera.position.set(13, 16.5, 13)
  camera.lookAt(0, 0.3, 0)
  scene.add(new AmbientLight(0xffffff, 0.64 * Math.PI))
  const sun = new DirectionalLight(0xffffff, 0.52 * Math.PI)
  sun.position.set(4, 10, 7)
  scene.add(sun)

  const group = new Group()
  scene.add(group)
  const geometry = new BoxGeometry(0.78, 1, 0.78)
  geometry.translate(0, 0.5, 0)
  const low = tokenColor("--background")
  const high = tokenColor("--primary")

  const { rank, height } = cityLayout()
  const blocks: Block[] = Array.from({ length: CELLS }, (_, n) => {
    const mesh = new Mesh(
      geometry,
      new MeshLambertMaterial({ color: low.clone() }),
    )
    mesh.position.set((n % 10) - 4.5, 0, Math.floor(n / 10) - 4.5)
    mesh.scale.y = UNLIT_HEIGHT
    group.add(mesh)
    return {
      mesh,
      rank: rank[n],
      h: height[n],
      c: 0,
      target: 0,
      next: 0,
      at: 0,
    }
  })

  let span = 1
  let spanTarget = 1
  const apply = (b: Block) => {
    b.mesh.scale.y = UNLIT_HEIGHT + (b.h * span - UNLIT_HEIGHT) * b.c
    b.mesh.material.color.copy(low).lerp(high, b.c)
  }

  let drawn = false
  const draw = () => {
    renderer.render(scene, camera)
    if (!drawn) {
      drawn = true
      onFirstFrame()
    }
  }

  const fit = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    const aspect = w / h
    let halfH = 5.9
    let halfW = halfH * aspect
    if (halfW < 7.5) {
      halfW = 7.5
      halfH = halfW / aspect
    }
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.updateProjectionMatrix()
    draw()
  }

  let visible = false
  let request = 0
  const frame = (now: number) => {
    request = 0
    const ds = spanTarget - span
    span = Math.abs(ds) > 0.002 ? span + ds * 0.14 : spanTarget
    for (const b of blocks) {
      if (b.next !== b.target && now >= b.at) b.target = b.next
      const d = b.target - b.c
      if (Math.abs(d) > 0.002) b.c += d * 0.14
      else b.c = b.target
      apply(b)
    }
    group.rotation.y = Math.sin(now / 4200) * 0.1
    draw()
    if (visible) kick()
  }
  const kick = () => {
    if (!request) request = requestAnimationFrame(frame)
  }

  const onScreen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) kick()
  })
  onScreen.observe(stage)
  const resize = new ResizeObserver(fit)
  resize.observe(stage)
  fit()

  return {
    light(count) {
      const now = performance.now()
      spanTarget = 1 - (1 - CROWDED_SPAN) * (count / CELLS)
      for (const b of blocks) {
        b.next = b.rank < count ? 1 : 0
        b.at = now + b.rank * 9
      }
      if (visible) kick()
    },
    dispose() {
      cancelAnimationFrame(request)
      request = 0
      onScreen.disconnect()
      resize.disconnect()
      geometry.dispose()
      for (const b of blocks) b.mesh.material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
