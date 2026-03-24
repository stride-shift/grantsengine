import { useEffect, useRef } from "react";

/* ── Beam factory ── */
function createBeam(width, height) {
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 100 + Math.random() * 200,
    length: height * 2.5,
    angle: -35 + Math.random() * 10,
    speed: 2.5 + Math.random() * 3.0,
    opacity: 0.10 + Math.random() * 0.14,
    hue: 140 + Math.random() * 80,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.06 + Math.random() * 0.08,
    pushX: 0, pushY: 0, glow: 0,
  };
}

function resetBeam(beam, index, totalBeams, canvasW, canvasH) {
  const column = index % 3;
  const spacing = canvasW / 3;
  beam.y = canvasH + 100;
  beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
  beam.width = 120 + Math.random() * 200;
  beam.speed = 2.5 + Math.random() * 3.0;
  beam.hue = 140 + (index * 80) / totalBeams;
  beam.opacity = 0.2 + Math.random() * 0.1;
  beam.pushX = 0; beam.pushY = 0; beam.glow = 0;
  return beam;
}

export default function NorthernLights() {
  const starsCanvasRef = useRef(null);
  const beamsCanvasRef = useRef(null);
  const beamsRef = useRef([]);
  const starsRef = useRef([]);
  const frameRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });
  const skyRef = useRef(null);
  const BEAM_COUNT = 12;
  const INTERACT_RADIUS = 200;

  useEffect(() => {
    const starsCanvas = starsCanvasRef.current;
    const beamsCanvas = beamsCanvasRef.current;
    if (!starsCanvas || !beamsCanvas) return;
    const starsCtx = starsCanvas.getContext("2d");
    const beamsCtx = beamsCanvas.getContext("2d");
    if (!starsCtx || !beamsCtx) return;

    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    starsRef.current = [];
    for (let i = 0; i < 120; i++) {
      starsRef.current.push({
        x: rand(), y: rand(),
        r: rand() * 1.5 + 0.3,
        brightness: rand() * 0.5 + 0.5,
        speed: rand() * 1.5 + 0.5,
        offset: rand() * Math.PI * 2,
      });
    }

    let w, h;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth; h = window.innerHeight;

      for (const c of [starsCanvas, beamsCanvas]) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = w + "px";
        c.style.height = h + "px";
      }
      starsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beamsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      beamsRef.current = Array.from({ length: BEAM_COUNT }, () => createBeam(w, h));

      // Cache sky gradient
      const sky = document.createElement("canvas");
      sky.width = w; sky.height = h;
      const sctx = sky.getContext("2d");
      const grad = sctx.createRadialGradient(w * 0.5, h * 0.1, 0, w * 0.5, h * 0.1, Math.max(w, h));
      grad.addColorStop(0, "#0a1628");
      grad.addColorStop(0.5, "#060d1a");
      grad.addColorStop(1, "#030712");
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, w, h);
      skyRef.current = sky;
    };

    resize();
    window.addEventListener("resize", resize);

    let lastFrame = 0;
    const FRAME_INTERVAL = 1000 / 30;

    function animate(now) {
      frameRef.current = requestAnimationFrame(animate);
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;

      const t = now / 1000;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      // ── Stars layer (no blur) ──
      if (skyRef.current) starsCtx.drawImage(skyRef.current, 0, 0);
      else { starsCtx.fillStyle = "#030712"; starsCtx.fillRect(0, 0, w, h); }

      // Cursor glow on sky
      if (mx >= 0 && my >= 0) {
        const cg = starsCtx.createRadialGradient(mx, my, 0, mx, my, 150);
        cg.addColorStop(0, "rgba(74, 222, 128, 0.06)");
        cg.addColorStop(1, "transparent");
        starsCtx.fillStyle = cg;
        starsCtx.fillRect(mx - 150, my - 150, 300, 300);
      }

      for (const s of starsRef.current) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.offset);
        let alpha = s.brightness * (0.3 + 0.7 * twinkle);
        const sx = s.x * w, sy = s.y * h;

        if (mx >= 0 && my >= 0) {
          const dx = sx - mx, dy = sy - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) alpha = Math.min(1, alpha + (1 - dist / 120) * 0.6);
        }

        // Star dot
        starsCtx.globalAlpha = alpha;
        starsCtx.fillStyle = "#fff";
        starsCtx.beginPath();
        starsCtx.arc(sx, sy, s.r, 0, Math.PI * 2);
        starsCtx.fill();

        // Star glow halo
        if (s.r > 1.2) {
          starsCtx.beginPath();
          starsCtx.arc(sx, sy, s.r * 3, 0, Math.PI * 2);
          starsCtx.fillStyle = `rgba(200,220,255,${alpha * 0.08})`;
          starsCtx.fill();
        }
      }
      starsCtx.globalAlpha = 1;

      // Horizon glow (on stars layer)
      const hg = starsCtx.createLinearGradient(0, h, 0, h * 0.65);
      hg.addColorStop(0, "rgba(6, 12, 24, 0.95)");
      hg.addColorStop(0.4, "rgba(8, 20, 40, 0.3)");
      hg.addColorStop(1, "transparent");
      starsCtx.fillStyle = hg;
      starsCtx.fillRect(0, h * 0.65, w, h * 0.35);

      // ── Beams layer (CSS-blurred via the canvas element) ──
      beamsCtx.clearRect(0, 0, w, h);

      const total = beamsRef.current.length;
      for (let i = 0; i < total; i++) {
        const beam = beamsRef.current[i];
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;

        if (beam.y + beam.length < -100) resetBeam(beam, i, total, w, h);

        // Mouse interaction
        if (mx >= 0 && my >= 0) {
          const bcx = beam.x + beam.pushX, bcy = beam.y + beam.length * 0.5 + beam.pushY;
          const dx = bcx - mx, dy = bcy - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < INTERACT_RADIUS) {
            const strength = 1 - dist / INTERACT_RADIUS;
            const force = strength * strength * 40;
            const angle = Math.atan2(dy, dx);
            beam.pushX += Math.cos(angle) * force * 0.3;
            beam.pushY += Math.sin(angle) * force * 0.15;
            beam.glow += (strength * 0.5 - beam.glow) * 0.15;
          } else {
            beam.glow *= 0.92;
          }
        } else {
          beam.glow *= 0.92;
        }
        beam.pushX *= 0.94;
        beam.pushY *= 0.94;

        beamsCtx.save();
        beamsCtx.translate(beam.x + beam.pushX, beam.y + beam.pushY);
        beamsCtx.rotate((beam.angle * Math.PI) / 180);

        const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) + beam.glow;
        const lightness = 55 + beam.glow * 20;

        const grad = beamsCtx.createLinearGradient(0, 0, 0, beam.length);
        grad.addColorStop(0, `hsla(${beam.hue}, 85%, ${lightness}%, 0)`);
        grad.addColorStop(0.1, `hsla(${beam.hue}, 85%, ${lightness}%, ${pulsingOpacity * 0.5})`);
        grad.addColorStop(0.4, `hsla(${beam.hue}, 85%, ${lightness}%, ${pulsingOpacity})`);
        grad.addColorStop(0.6, `hsla(${beam.hue}, 85%, ${lightness}%, ${pulsingOpacity})`);
        grad.addColorStop(0.9, `hsla(${beam.hue}, 85%, ${lightness}%, ${pulsingOpacity * 0.5})`);
        grad.addColorStop(1, `hsla(${beam.hue}, 85%, ${lightness}%, 0)`);

        beamsCtx.fillStyle = grad;
        beamsCtx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
        beamsCtx.restore();
      }
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handleMouseMove = (e) => {
    const rect = starsCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseLeave = () => {
    mouseRef.current = { x: -1, y: -1 };
  };

  return (
    <div
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#030712" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Stars + sky — crisp, no blur */}
      <canvas ref={starsCanvasRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      {/* Beams — CSS blur applied to the whole canvas element (GPU-accelerated) */}
      <canvas ref={beamsCanvasRef} style={{ position: "absolute", inset: 0, zIndex: 1, filter: "blur(50px)" }} />
      {/* Noise grain */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
        backgroundImage: "url('https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png')",
        backgroundSize: 200, backgroundRepeat: "repeat",
        opacity: 0.15,
      }} />
    </div>
  );
}
