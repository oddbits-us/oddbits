// Oddbits CRT background effect — WGSL fragment shader.
//
// Single fullscreen triangle, samples the desktop wallpaper texture, applies
// (in order): barrel warp → glitch band offset → cover-fit UV + RGB chromatic
// split (stronger at edges) → optional edge blur mix → scanlines → vignette →
// film grain. All effect strengths are gated by a master multiplier so the
// controller can fade the whole thing in/out.
//
// Uniforms are packed into vec4 lanes so JS can update them with one
// Float32Array (matches @group(0) @binding(0) layout below).

struct CrtUniforms {
  // xy = canvas pixel resolution (CSS px * dpr); zw = image pixel size.
  resolution: vec4f,
  // x = time (s), y = master (0..1), z = motion (0/1), w = dpr.
  timeMaster: vec4f,
  // x = strength, y = softness.
  vignette: vec4f,
  // x = density (lines per CSS px), y = opacity, z = sharpness.
  scanlines: vec4f,
  // x = offsetPx (CSS px), y = angle (radians), z = glitchBoost (peak multiplier).
  chroma: vec4f,
  // x = current event amount (0..1), y = band height (CSS px),
  // z = max horizontal offset (CSS px), w = event seed.
  glitch: vec4f,
  // x = grain amplitude (0..1).
  noise: vec4f,
  // x = barrel strength, y = edge chroma weight, z = edge blur radius (CSS px at corners).
  lens: vec4f,
};

@group(0) @binding(0) var<uniform> u: CrtUniforms;
@group(0) @binding(1) var bgTexture: texture_2d<f32>;
@group(0) @binding(2) var bgSampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  // Oversized triangle that fully covers NDC [-1,1]^2 in one draw.
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0,  1.0),
    vec2f( 3.0,  1.0),
  );
  let p = positions[vi];
  var out: VsOut;
  out.pos = vec4f(p, 0.0, 1.0);
  // NDC -> [0,1] UV with Y flipped (texture origin is top-left).
  out.uv = vec2f((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  return out;
}

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let q2 = q + dot(q, q + 78.233);
  return fract(q2.x * q2.y);
}

// CSS background-size: cover — preserve image aspect, crop to canvas.
fn coverUv(uv: vec2f, canvasSize: vec2f, imageSize: vec2f) -> vec2f {
  let cAspect = canvasSize.x / max(canvasSize.y, 1.0);
  let iAspect = imageSize.x / max(imageSize.y, 1.0);
  var out = uv;
  if (cAspect > iAspect) {
    let crop = iAspect / cAspect;
    out.y = 0.5 + (uv.y - 0.5) * crop;
  } else {
    let crop = cAspect / iAspect;
    out.x = 0.5 + (uv.x - 0.5) * crop;
  }
  return out;
}

// 0 at center, ~1 at corners — drives edge chroma + edge blur.
fn viewportEdgeFactor(uv: vec2f) -> f32 {
  let centered = uv - vec2f(0.5);
  let d = length(centered) * 2.2;
  return clamp(d, 0.0, 1.0);
}

@fragment
fn fs_main(@location(0) uvIn: vec2f) -> @location(0) vec4f {
  let canvasSize = u.resolution.xy;
  let imageSize = u.resolution.zw;
  let dpr = max(u.timeMaster.w, 1.0);
  let master = clamp(u.timeMaster.y, 0.0, 1.0);
  // 1 CSS pixel expressed in UV space (so px values stay device-density invariant).
  let cssPxToUv = vec2f(dpr / max(canvasSize.x, 1.0), dpr / max(canvasSize.y, 1.0));

  let edgeFac = viewportEdgeFactor(uvIn);

  // 0. Barrel warp — curved CRT faceplate (before glitch / chroma).
  var uvScreen = uvIn;
  let barrelK = u.lens.x * master;
  if (barrelK > 0.00001) {
    let c = uvScreen - vec2f(0.5);
    let r2 = dot(c, c);
    uvScreen = vec2f(0.5) + c * (1.0 + barrelK * r2 * 4.0);
  }

  // 1. Glitch: horizontal UV nudge per vertical band. CPU sets x=envelope, w=seed.
  var sampleUv = uvScreen;
  let glitchAmt = u.glitch.x * master;
  if (glitchAmt > 0.001) {
    let bandPx = max(u.glitch.y, 1.0);
    let bandsCount = max(canvasSize.y / (bandPx * dpr), 1.0);
    let bandIdx = floor(uvScreen.y * bandsCount);
    let r = hash21(vec2f(bandIdx, u.glitch.w));
    let signed = (r - 0.5) * 2.0;
    let offsetPx = signed * u.glitch.z * glitchAmt;
    sampleUv.x = sampleUv.x + offsetPx * cssPxToUv.x;
  }

  // 2. RGB chromatic split — ramps up with glitch; extra toward screen edges (lens.y).
  let glitchEnv = clamp(u.glitch.x, 0.0, 1.0);
  let chromaMul = mix(1.0, max(u.chroma.z, 1.0), glitchEnv);
  let edgeChromaMul = 1.0 + u.lens.y * edgeFac * master;
  let chromaPx = u.chroma.x * master * chromaMul * edgeChromaMul;
  let dir = vec2f(cos(u.chroma.y), sin(u.chroma.y));
  let chromaUvOff = dir * chromaPx * cssPxToUv;

  let uvR = coverUv(sampleUv + chromaUvOff, canvasSize, imageSize);
  let uvG = coverUv(sampleUv,                canvasSize, imageSize);
  let uvB = coverUv(sampleUv - chromaUvOff, canvasSize, imageSize);

  let r = textureSample(bgTexture, bgSampler, uvR).r;
  let g = textureSample(bgTexture, bgSampler, uvG).g;
  let b = textureSample(bgTexture, bgSampler, uvB).b;
  var color = vec3f(r, g, b);

  // 2b. Edge softness — 5-tap box blur (unchromatic) mixed in toward corners.
  // Always sample all taps (no branching): avoids non-uniform control flow issues
  // on some drivers; when blur radius is 0, taps are identical.
  let blurRadUv = u.lens.z * cssPxToUv * edgeFac * master;
  let blurMix = clamp(edgeFac * edgeFac * master * 0.85, 0.0, 0.78);
  let dux = vec2f(blurRadUv.x, 0.0);
  let duy = vec2f(0.0, blurRadUv.y);
  let c0 = textureSample(bgTexture, bgSampler, coverUv(sampleUv,       canvasSize, imageSize)).rgb;
  let c1 = textureSample(bgTexture, bgSampler, coverUv(sampleUv + dux, canvasSize, imageSize)).rgb;
  let c2 = textureSample(bgTexture, bgSampler, coverUv(sampleUv - dux, canvasSize, imageSize)).rgb;
  let c3 = textureSample(bgTexture, bgSampler, coverUv(sampleUv + duy, canvasSize, imageSize)).rgb;
  let c4 = textureSample(bgTexture, bgSampler, coverUv(sampleUv - duy, canvasSize, imageSize)).rgb;
  let blurred = (c0 + c1 + c2 + c3 + c4) * 0.2;
  color = mix(color, blurred, blurMix);

  // 3. Scanlines — sin wave along Y in CSS pixels, sharpened by exponent.
  let yPx = uvScreen.y * canvasSize.y / dpr;
  let s = sin(yPx * u.scanlines.x * 6.28318530718);
  let band = pow(s * 0.5 + 0.5, max(u.scanlines.z, 0.0001));
  let scan = mix(1.0, band, clamp(u.scanlines.y * master, 0.0, 1.0));
  color = color * scan;

  // 4. Vignette — soft radial darkening at the corners.
  let centered = uvIn - vec2f(0.5);
  let d = length(centered) * 1.41421356;
  let edge = smoothstep(1.0 - clamp(u.vignette.y, 0.0, 1.0), 1.0, d);
  let vignetteAmt = edge * clamp(u.vignette.x, 0.0, 1.0) * master;
  color = color * (1.0 - vignetteAmt);

  // 5. Film grain — tiny per-pixel noise. Time is folded in only when motion=1.
  let timeSeed = u.timeMaster.x * 60.0 * u.timeMaster.z;
  let grain = hash21(uvIn * canvasSize + vec2f(timeSeed, -timeSeed)) - 0.5;
  color = color + grain * u.noise.x * master;

  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
