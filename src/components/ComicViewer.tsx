import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  buildImageFilterCss,
  defaultImageAdjust,
  loadImageAdjust,
  saveImageAdjust,
  type ImageAdjustState,
} from '../lib/imageAdjust'

export type ViewerPage = {
  name: string
  url: string
}

type Props = {
  title: string
  pages: ViewerPage[]
  onClose: () => void
  /** Página inicial al reanudar lectura (0-based). */
  initialPageIndex?: number
  /** Se llama al cambiar de página (para guardar progreso). */
  onPageIndexChange?: (pageIndex: number) => void
}

const PRESET_ZOOM_1 = 1.75
const PRESET_ZOOM_2 = 2.5
const MIN_SCALE = 0.25
const MAX_SCALE = 8

type CanvasProps = {
  page: ViewerPage
  bodyRef: RefObject<HTMLDivElement | null>
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  imageFilter: string
}

function ComicPageCanvas({
  page,
  bodyRef,
  onPrev,
  onNext,
  canPrev,
  canNext,
  imageFilter,
}: CanvasProps) {
  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [originX, setOriginX] = useState(50)
  const [originY, setOriginY] = useState(50)

  const stageRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const dblStepRef = useRef(0)

  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    panStartX: number
    panStartY: number
    pointerId: number
  } | null>(null)

  const pinchRef = useRef<{
    dist: number
    scale: number
    panX: number
    panY: number
  } | null>(null)

  const tapRef = useRef<{ t: number; x: number; y: number } | null>(null)

  /** Arrastre con un dedo (respaldo si el puntero no mueve bien en algún dispositivo) */
  const touchPanRef = useRef<{
    startX: number
    startY: number
    panStartX: number
    panStartY: number
  } | null>(null)

  const [dragging, setDragging] = useState(false)

  /** Quita listeners globales de arrastre (ratón/lápiz); evita estado colgado con setPointerCapture. */
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)

  /** Siempre la última pan (evita arrastre con pan obsoleto tras zoom con rueda). */
  const panRef = useRef({ x: 0, y: 0 })
  useEffect(() => {
    panRef.current = { x: panX, y: panY }
  }, [panX, panY])

  const scaleRef = useRef(scale)
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  /** Misma posición que el estado React (los gestos leen panRef en el mismo tick que setPan). */
  const syncPanRef = useCallback((x: number, y: number) => {
    panRef.current = { x, y }
  }, [])

  const clearInteractionState = useCallback(() => {
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    const d = dragRef.current
    const stage = stageRef.current
    if (d && stage) {
      try {
        if (stage.hasPointerCapture(d.pointerId)) {
          stage.releasePointerCapture(d.pointerId)
        }
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null
    touchPanRef.current = null
    pinchRef.current = null
    setDragging(false)
  }, [])

  const resetView = useCallback(() => {
    clearInteractionState()
    setScale(1)
    setPanX(0)
    setPanY(0)
    syncPanRef(0, 0)
    scaleRef.current = 1
    setOriginX(50)
    setOriginY(50)
    dblStepRef.current = 0
  }, [clearInteractionState, syncPanRef])

  const applyDoubleZoomAt = useCallback(
    (clientX: number, clientY: number) => {
      const inner = innerRef.current
      if (!inner) return

      const rect = inner.getBoundingClientRect()
      const ox = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100
      const oy = ((clientY - rect.top) / Math.max(rect.height, 1)) * 100

      const next = (dblStepRef.current + 1) % 3
      dblStepRef.current = next
      clearInteractionState()

      if (next === 0) {
        // Tras limpiar captura/arrastre; el reset completo en el siguiente tick.
        queueMicrotask(() => {
          resetView()
        })
        return
      }

      setOriginX(ox)
      setOriginY(oy)
      setPanX(0)
      setPanY(0)
      const z = next === 1 ? PRESET_ZOOM_1 : PRESET_ZOOM_2
      setScale(z)
      syncPanRef(0, 0)
      scaleRef.current = z
    },
    [clearInteractionState, resetView, syncPanRef],
  )

  /** detail === 2: segundo click del par; ocurre tras los pointerup, más fiable que dblclick */
  const onStageClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail !== 2) return
      e.preventDefault()
      e.stopPropagation()
      applyDoubleZoomAt(e.clientX, e.clientY)
    },
    [applyDoubleZoomAt],
  )

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const fn = (e: WheelEvent) => {
      e.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      // Cortar arrastre a medio gesto: el zoom cambia pan/escala y el drag guardaba pan antiguo.
      clearInteractionState()

      const rect = stage.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cx = rect.width / 2
      const cy = rect.height / 2

      const delta = e.deltaY
      const zoomIntensity = 0.0012
      const factor = Math.exp(-delta * zoomIntensity)

      setScale((prev) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor))
        const ratio = next / prev
        setPanX((px) => px + (mx - cx) * (1 - ratio))
        setPanY((py) => py + (my - cy) * (1 - ratio))
        return next
      })
      dblStepRef.current = 0
    }
    body.addEventListener('wheel', fn, { passive: false })
    return () => body.removeEventListener('wheel', fn)
  }, [bodyRef, clearInteractionState])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (e.button !== 0) return
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      pinchRef.current = null
    } else if (pinchRef.current) {
      return
    }

    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    dragRef.current = null
    setDragging(false)

    const pid = e.pointerId
    const p = panRef.current
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panStartX: p.x,
      panStartY: p.y,
      pointerId: pid,
    }
    setDragging(true)

    function move(ev: PointerEvent): void {
      if (ev.pointerId !== pid) return
      const d = dragRef.current
      if (!d?.active) return
      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY
      const nx = d.panStartX + dx
      const ny = d.panStartY + dy
      setPanX(nx)
      setPanY(ny)
      panRef.current = { x: nx, y: ny }
    }

    function cleanup(): void {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }

    function up(ev: PointerEvent): void {
      if (ev.pointerId !== pid) return
      cleanup()
      pointerDragCleanupRef.current = null
      dragRef.current = null
      setDragging(false)
    }

    pointerDragCleanupRef.current = cleanup
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchPanRef.current = null
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const p = panRef.current
      pinchRef.current = {
        dist,
        scale: scaleRef.current,
        panX: p.x,
        panY: p.y,
      }
      dragRef.current = null
      setDragging(false)
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const p = panRef.current
      touchPanRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        panStartX: p.x,
        panStartY: p.y,
      }
    }
  }, [])

  const onTouchMoveNative = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const p = pinchRef.current
      const ratio = dist / Math.max(p.dist, 1e-6)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * ratio))
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const mx = (a.clientX + b.clientX) / 2 - rect.left
      const my = (a.clientY + b.clientY) / 2 - rect.top
      const rcx = rect.width / 2
      const rcy = rect.height / 2
      const scaleRatio = newScale / p.scale
      const nextPanX = p.panX + (mx - rcx) * (1 - scaleRatio)
      const nextPanY = p.panY + (my - rcy) * (1 - scaleRatio)
      setScale(newScale)
      scaleRef.current = newScale
      setPanX(nextPanX)
      setPanY(nextPanY)
      panRef.current = { x: nextPanX, y: nextPanY }
      dblStepRef.current = 0
      return
    }

    if (e.touches.length === 1 && touchPanRef.current) {
      e.preventDefault()
      const t = e.touches[0]
      const p = touchPanRef.current
      const nx = p.panStartX + (t.clientX - p.startX)
      const ny = p.panStartY + (t.clientY - p.startY)
      setPanX(nx)
      setPanY(ny)
      panRef.current = { x: nx, y: ny }
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const fn = (e: TouchEvent) => onTouchMoveNative(e)
    stage.addEventListener('touchmove', fn, { passive: false })
    return () => stage.removeEventListener('touchmove', fn)
  }, [onTouchMoveNative])

  const onTouchEndPan = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null
    }

    if (e.touches.length === 0) {
      touchPanRef.current = null
      return
    }

    /* Tras soltar un dedo del pinch, el dedo que sigue apoyado debe poder arrastrar sin levantar. */
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const p = panRef.current
      touchPanRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        panStartX: p.x,
        panStartY: p.y,
      }
    }
  }, [])

  const onTouchCancel = useCallback(() => {
    touchPanRef.current = null
    pinchRef.current = null
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      onTouchEndPan(e)
      if (e.touches.length > 0 || e.changedTouches.length !== 1) return
      const t = e.changedTouches[0]
      const now = Date.now()
      const prev = tapRef.current
      if (
        prev &&
        now - prev.t < 320 &&
        Math.abs(t.clientX - prev.x) < 45 &&
        Math.abs(t.clientY - prev.y) < 45
      ) {
        applyDoubleZoomAt(t.clientX, t.clientY)
        tapRef.current = null
        return
      }
      tapRef.current = { t: now, x: t.clientX, y: t.clientY }
    },
    [applyDoubleZoomAt, onTouchEndPan],
  )

  useEffect(() => {
    if (!dragging) return
    const prev = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    return () => {
      document.body.style.cursor = prev
    }
  }, [dragging])

  /** Pérdida de foco / pestaña: evita puntero “fantasma” a medio arrastre */
  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') {
        clearInteractionState()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [clearInteractionState])

  return (
    <>
      <button
        type="button"
        className="comic-edge-nav comic-edge-prev"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Página anterior"
      />
      <button
        type="button"
        className="comic-edge-nav comic-edge-next"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Página siguiente"
      />

      <div
        ref={stageRef}
        className={`comic-viewer-stage${dragging ? ' comic-viewer-stage--dragging' : ''}`}
        onClick={onStageClick}
        onPointerDown={onPointerDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <div
          ref={innerRef}
          className="comic-zoom-inner"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
            transformOrigin: `${originX}% ${originY}%`,
            filter: imageFilter,
          }}
        >
          <img
            src={page.url}
            alt={page.name}
            className="comic-page-img"
            decoding="async"
            loading="eager"
            draggable={false}
          />
        </div>
      </div>

      {scale !== 1 ? (
        <span className="comic-zoom-readout" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
      ) : null}
    </>
  )
}

function clampPageIndex(i: number, len: number): number {
  if (len <= 0) return 0
  return Math.max(0, Math.min(i, len - 1))
}

export function ComicViewer({
  title,
  pages,
  onClose,
  initialPageIndex = 0,
  onPageIndexChange,
}: Props) {
  const [index, setIndex] = useState(() => clampPageIndex(initialPageIndex, pages.length))
  const bodyRef = useRef<HTMLDivElement>(null)
  const [imageAdjust, setImageAdjust] = useState<ImageAdjustState>(() => loadImageAdjust())
  const [adjustPanelOpen, setAdjustPanelOpen] = useState(false)
  const [pagesPanelOpen, setPagesPanelOpen] = useState(false)
  const adjustWrapRef = useRef<HTMLDivElement>(null)
  const activePageItemRef = useRef<HTMLLIElement | null>(null)

  const imageFilter = useMemo(() => buildImageFilterCss(imageAdjust), [imageAdjust])

  useEffect(() => {
    onPageIndexChange?.(index)
  }, [index, onPageIndexChange])

  /** Evita scroll del documento detrás del visor (iOS/Android: la barra fija y los botones se comportan mejor). */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    saveImageAdjust(imageAdjust)
  }, [imageAdjust])

  useEffect(() => {
    if (!adjustPanelOpen) return
    const close = (e: MouseEvent): void => {
      if (adjustWrapRef.current && !adjustWrapRef.current.contains(e.target as Node)) {
        setAdjustPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [adjustPanelOpen])

  useEffect(() => {
    if (!pagesPanelOpen) return
    activePageItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pagesPanelOpen, index])

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(pages.length - 1, i + 1))
  }, [pages.length])

  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        if (pagesPanelOpen) {
          setPagesPanelOpen(false)
          return
        }
        if (adjustPanelOpen) {
          setAdjustPanelOpen(false)
          return
        }
        onClose()
        return
      }
      if (ev.key === 'ArrowLeft') {
        ev.preventDefault()
        goPrev()
        return
      }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [adjustPanelOpen, goNext, goPrev, onClose, pagesPanelOpen])

  const page = pages[index]
  if (!page) {
    return null
  }

  return (
    <div className="comic-viewer" role="dialog" aria-label="Visor de cómic">
      <svg
        className="comic-filter-defs"
        xmlns="http://www.w3.org/2000/svg"
        width="0"
        height="0"
        aria-hidden
      >
        <defs>
          <filter
            id="comic-sharpen-soft"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            colorInterpolationFilters="sRGB"
          >
            <feConvolveMatrix
              order="3"
              kernelMatrix="0 -0.12 0 -0.12 1.48 -0.12 0 -0.12 0"
              divisor="1"
              bias="0"
              edgeMode="duplicate"
            />
          </filter>
          <filter
            id="comic-sharpen-med"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            colorInterpolationFilters="sRGB"
          >
            <feConvolveMatrix
              order="3"
              kernelMatrix="0 -0.25 0 -0.25 2 -0.25 0 -0.25 0"
              divisor="1"
              bias="0"
              edgeMode="duplicate"
            />
          </filter>
          <filter
            id="comic-sharpen-strong"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feConvolveMatrix
              order="3"
              kernelMatrix="0 -0.4 0 -0.4 2.6 -0.4 0 -0.4 0"
              divisor="1"
              bias="0"
              edgeMode="duplicate"
            />
          </filter>
        </defs>
      </svg>
      <header className="comic-viewer-bar">
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="comic-viewer-title">
          <strong className="comic-viewer-title-text" title={title}>
            {title}
          </strong>
          <span className="comic-page-count">
            {index + 1} / {pages.length}
          </span>
        </div>
        <div className="comic-viewer-nav">
          <button
            type="button"
            className={`comic-pages-trigger${pagesPanelOpen ? ' comic-pages-trigger--open' : ''}`}
            onClick={() => setPagesPanelOpen((o) => !o)}
            aria-expanded={pagesPanelOpen}
            aria-controls="comic-pages-panel"
            title="Lista de páginas: abrir o cerrar"
          >
            📑
          </button>
          <div className="comic-adjust-wrap" ref={adjustWrapRef}>
            <button
              type="button"
              className={`comic-adjust-trigger${adjustPanelOpen ? ' comic-adjust-trigger--open' : ''}`}
              onClick={() => setAdjustPanelOpen((o) => !o)}
              aria-expanded={adjustPanelOpen}
              aria-haspopup="dialog"
              aria-controls="comic-image-adjust-panel"
              title="Ajuste de imagen (brillo, contraste, saturación, nitidez)"
            >
              🖼
            </button>
            {adjustPanelOpen ? (
              <div
                id="comic-image-adjust-panel"
                className="comic-adjust-panel"
                role="dialog"
                aria-label="Ajuste de imagen"
              >
                <div className="comic-adjust-mode">
                  <label className="comic-adjust-radio">
                    <input
                      type="radio"
                      name="comic-img-mode"
                      checked={imageAdjust.mode === 'auto'}
                      onChange={() => setImageAdjust((s) => ({ ...s, mode: 'auto' }))}
                    />
                    Automático
                  </label>
                  <label className="comic-adjust-radio">
                    <input
                      type="radio"
                      name="comic-img-mode"
                      checked={imageAdjust.mode === 'manual'}
                      onChange={() => setImageAdjust((s) => ({ ...s, mode: 'manual' }))}
                    />
                    Manual
                  </label>
                </div>
                {imageAdjust.mode === 'auto' ? (
                  <p className="comic-adjust-hint muted">
                    Refuerzo suave de brillo, contraste y color para lectura. Cambia a manual para
                    afinar tú mismo.
                  </p>
                ) : (
                  <div className="comic-adjust-sliders">
                    <label className="comic-adjust-row">
                      <span>Brillo {imageAdjust.brightness}%</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={imageAdjust.brightness}
                        onChange={(e) =>
                          setImageAdjust((s) => ({
                            ...s,
                            brightness: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="comic-adjust-row">
                      <span>Contraste {imageAdjust.contrast}%</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={imageAdjust.contrast}
                        onChange={(e) =>
                          setImageAdjust((s) => ({
                            ...s,
                            contrast: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="comic-adjust-row">
                      <span>Saturación {imageAdjust.saturation}%</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={imageAdjust.saturation}
                        onChange={(e) =>
                          setImageAdjust((s) => ({
                            ...s,
                            saturation: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                )}
                <div className="comic-adjust-sharp-block">
                  <label className="comic-adjust-row">
                    <span>Nitidez {imageAdjust.sharpness}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={imageAdjust.sharpness}
                      onChange={(e) =>
                        setImageAdjust((s) => ({
                          ...s,
                          sharpness: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <p className="comic-adjust-sharp-hint muted">
                    0 = sin efecto. Por encima de 0 se aplica un refuerzo de bordes (suave / medio /
                    fuerte según el valor). Puede acentuar ruido en escaneados muy granosos.
                  </p>
                </div>
                <button
                  type="button"
                  className="comic-adjust-reset btn-secondary"
                  onClick={() => setImageAdjust({ ...defaultImageAdjust })}
                >
                  Restaurar predeterminado
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={goPrev}
            disabled={index <= 0}
            aria-label="Página anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={index >= pages.length - 1}
            aria-label="Página siguiente"
          >
            ›
          </button>
        </div>
      </header>

      {pagesPanelOpen ? (
        <>
          <aside
            id="comic-pages-panel"
            className="comic-pages-drawer"
            role="complementary"
            aria-label="Páginas del cómic"
          >
            <div className="comic-pages-drawer-head">
              <strong>Páginas</strong>
              <span className="comic-pages-drawer-count">{pages.length}</span>
            </div>
            <ul className="comic-pages-list">
              {pages.map((p, i) => (
                <li
                  key={`${i}-${p.name}`}
                  ref={i === index ? activePageItemRef : undefined}
                >
                  <button
                    type="button"
                    className={`comic-pages-item${i === index ? ' comic-pages-item--current' : ''}`}
                    onClick={() => setIndex(i)}
                  >
                    <span className="comic-pages-thumb-wrap">
                      <img
                        src={p.url}
                        alt=""
                        className="comic-pages-thumb"
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="comic-pages-item-text">
                      <span className="comic-pages-item-num">{i + 1}</span>
                      <span className="comic-pages-item-name" title={p.name}>
                        {p.name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </>
      ) : null}

      <div ref={bodyRef} className="comic-viewer-body">
        <ComicPageCanvas
          key={index}
          page={page}
          bodyRef={bodyRef}
          onPrev={goPrev}
          onNext={goNext}
          canPrev={index > 0}
          canNext={index < pages.length - 1}
          imageFilter={imageFilter}
        />
      </div>
    </div>
  )
}
