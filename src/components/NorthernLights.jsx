import { useEffect, useRef } from "react";

/* ── Beam factory ── */
function createBeam(width, height) {
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 60 + Math.random() * 120,
    length: height * 2.5,
    angle: -35 + Math.random() * 10,
    speed: 0.3 + Math.random() * 0.5,
    opacity: 0.10 + Math.random() * 0.14,
    hue: 140 + Math.random() * 80,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.008 + Math.random() * 0.012,
  };
}

function resetBeam(beam, index, totalBeams, canvasW, canvasH) {
  const column = index % 3;
  const spacing = canvasW / 3;
  beam.y = canvasH + 100;
  beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
  beam.width = 80 + Math.random() * 140;
  beam.speed = 0.3 + Math.random() * 0.5;
  beam.hue = 140 + (index * 80) / totalBeams;
  beam.opacity = 0.2 + Math.random() * 0.1;
  return beam;
}

/* ── Stars ── */
function drawStars(ctx, stars, w, h, t) {
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.offset);
    const alpha = s.brightness * (0.3 + 0.7 * twinkle);
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
    if (s.r > 1.2) {
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${alpha * 0.08})`;
      ctx.fill();
    }
  }
}

export default function NorthernLights() {
  const canvasRef = useRef(null);
  const beamsRef = useRef([]);
  const starsRef = useRef([]);
  const frameRef = useRef(0);
  const BEAM_COUNT = 30;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Seeded random for stars
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    starsRef.current = [];
    for (let i = 0; i < 300; i++) {
      starsRef.current.push({
        x: rand(), y: rand(),
        r: rand() * 1.5 + 0.3,
        brightness: rand() * 0.5 + 0.5,
        speed: rand() * 1.5 + 0.5,
        offset: rand() * Math.PI * 2,
      });
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beamsRef.current = Array.from({ length: BEAM_COUNT }, () => createBeam(w, h));
    };

    resize();
    window.addEventListener("resize", resize);

    function animate() {
      const w = window.innerWidth, h = window.innerHeight;
      const t = Date.now() / 1000;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Sky gradient
      const skyGrad = ctx.createRadialGradient(w * 0.5, h * 0.1, 0, w * 0.5, h * 0.1, Math.max(w, h));
      skyGrad.addColorStop(0, "#0a1628");
      skyGrad.addColorStop(0.5, "#060d1a");
      skyGrad.addColorStop(1, "#030712");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Stars (no blur)
      ctx.filter = "none";
      drawStars(ctx, starsRef.current, w, h, t);

      // Beams (blurred)
      ctx.filter = "blur(50px)";
      const total = beamsRef.current.length;
      for (let i = 0; i < total; i++) {
        const beam = beamsRef.current[i];
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;

        if (beam.y + beam.length < -100) {
          resetBeam(beam, i, total, w, h);
        }

        // Draw beam
        ctx.save();
        ctx.translate(beam.x, beam.y);
        ctx.rotate((beam.angle * Math.PI) / 180);

        const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2);
        const grad = ctx.createLinearGradient(0, 0, 0, beam.length);
        grad.addColorStop(0, `hsla(${beam.hue}, 85%, 55%, 0)`);
        grad.addColorStop(0.1, `hsla(${beam.hue}, 85%, 55%, ${pulsingOpacity * 0.5})`);
        grad.addColorStop(0.4, `hsla(${beam.hue}, 85%, 55%, ${pulsingOpacity})`);
        grad.addColorStop(0.6, `hsla(${beam.hue}, 85%, 55%, ${pulsingOpacity})`);
        grad.addColorStop(0.9, `hsla(${beam.hue}, 85%, 55%, ${pulsingOpacity * 0.5})`);
        grad.addColorStop(1, `hsla(${beam.hue}, 85%, 55%, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
        ctx.restore();
      }

      // Reset filter
      ctx.filter = "none";

      // Horizon glow
      const horizGrad = ctx.createLinearGradient(0, h, 0, h * 0.65);
      horizGrad.addColorStop(0, "rgba(6, 12, 24, 0.95)");
      horizGrad.addColorStop(0.4, "rgba(8, 20, 40, 0.3)");
      horizGrad.addColorStop(1, "transparent");
      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, h * 0.65, w, h * 0.35);

      frameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#030712" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      {/* Noise grain */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
        backgroundImage: "url('https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png')",
        backgroundSize: 200, backgroundRepeat: "repeat",
        opacity: 0.2,
      }} />
    </div>
  );
}
