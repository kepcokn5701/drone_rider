import "./style.css";
import {
  Viewer,
  Ion,
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  CallbackProperty,
  HeadingPitchRoll,
  Transforms,
  Matrix4,
  PointGraphics,
  LabelStyle,
  VerticalOrigin,
  UrlTemplateImageryProvider,
  ImageryLayer,
  Math as CMath,
} from "cesium";
import type { ConstantPositionProperty } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { buildWorld } from "./world";

const ENV = import.meta.env as Record<string, string | undefined>;
Ion.defaultAccessToken = ENV.VITE_CESIUM_ION_TOKEN ?? "";
const VWORLD_KEY = ENV.VITE_VWORLD_KEY ?? "";

const KEPCO_GNB_LNG = 128.692;
const KEPCO_GNB_LAT = 35.227;
const START_ALT = 80;

const viewer = new Viewer("cesiumContainer", {
  baseLayerPicker: false,
  timeline: false,
  animation: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: true,
});

/* -------------------------------------------------------------
 * Offline / corporate-proxy fallback (먼저 모드 결정)
 *  사내 SSL 인터셉트 프록시 + 매일 node_modules의 PNG/JPG를 지우는
 *  보안 정책 때문에 Cesium 기본 imagery·skyBox·sun·moon 텍스처가
 *  디코딩 실패함 (InvalidStateError: The source image could not be decoded).
 *  localhost(개발)에서는 외부 텍스처에 의존하는 씬 요소를 전부 끄고
 *  단색 globe + 어두운 배경으로 fallback. 배포(외부망) 호스트에서는
 *  기본 Cesium Ion imagery + V-World 오버레이가 활성화됨.
 * ------------------------------------------------------------- */
const offlineMode =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

if (offlineMode) {
  viewer.imageryLayers.removeAll();
  // 흙·식생 mix 톤 (도시 외곽의 자연 지면 느낌)
  viewer.scene.globe.baseColor = Color.fromCssColorString("#3a4636");
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.globe.enableLighting = false;
  if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
  if (viewer.scene.sun) viewer.scene.sun.show = false;
  if (viewer.scene.moon) viewer.scene.moon.show = false;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
  if (viewer.scene.fog) viewer.scene.fog.enabled = false;
  // 그라데이션 같은 하늘 톤 — CSS 배경이 cesiumContainer 뒤에 보이므로
  // 여기서는 약간 푸르스름한 어두운 톤으로
  viewer.scene.backgroundColor = Color.fromCssColorString("#0e1622");
  console.log("[Drone Rider] offline fallback active (localhost)");
} else {
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
  if (viewer.scene.fog) viewer.scene.fog.enabled = true;
  viewer.scene.globe.enableLighting = false;
}

/* -------------------------------------------------------------
 * Imagery layers (배포 모드에서만)
 *  - Default: Cesium Ion (Bing aerial) — needs VITE_CESIUM_ION_TOKEN
 *  - Overlay: V-World satellite (Korean high-detail) — needs VITE_VWORLD_KEY
 *  사내(localhost)에서는 imagery 호출 자체가 프록시에 막혀 텍스처
 *  디코딩 실패를 유발하므로 offlineMode일 때는 imagery 추가를 건너뜀.
 * ------------------------------------------------------------- */
if (!offlineMode && VWORLD_KEY) {
  const vworldSatellite = new UrlTemplateImageryProvider({
    url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
    maximumLevel: 19,
    credit: "V-World 위성영상 (국토교통부)",
  });
  viewer.imageryLayers.add(new ImageryLayer(vworldSatellite, {}));
  // V-World 하이브리드(도로/지명 오버레이) — 필요하면 활성화
  const vworldHybrid = new UrlTemplateImageryProvider({
    url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`,
    maximumLevel: 19,
    credit: "V-World",
  });
  const hybridLayer = new ImageryLayer(vworldHybrid, {});
  hybridLayer.alpha = 0.85;
  viewer.imageryLayers.add(hybridLayer);
  console.log("[Drone Rider] V-World imagery active");
} else if (!offlineMode) {
  console.log("[Drone Rider] V-World key not set, using Cesium Ion default imagery");
}

/* -------------------------------------------------------------
 * Procedural city — 도로/건물/녹지/강을 코드로 생성.
 *  사내 보안이 .png/.jpg를 매일 지우는 환경에서도 외부 텍스처 없이
 *  "사실적인 환경"을 유지하기 위한 모듈. 정의는 src/world.ts.
 * ------------------------------------------------------------- */
buildWorld(viewer, KEPCO_GNB_LNG, KEPCO_GNB_LAT);

/* -------------------------------------------------------------
 * Entities: KEPCO HQ marker + electricity pole(s)
 * ------------------------------------------------------------- */
viewer.entities.add({
  position: Cartesian3.fromDegrees(KEPCO_GNB_LNG, KEPCO_GNB_LAT, 50),
  point: new PointGraphics({
    pixelSize: 14,
    color: Color.YELLOW,
    outlineColor: Color.BLACK,
    outlineWidth: 2,
    heightReference: HeightReference.RELATIVE_TO_GROUND,
  }),
  label: {
    text: "한전 경남본부",
    font: "13px 'Segoe UI', 'Malgun Gothic', sans-serif",
    fillColor: Color.WHITE,
    outlineColor: Color.BLACK,
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: VerticalOrigin.BOTTOM,
    pixelOffset: new Cartesian2(0, -18),
    heightReference: HeightReference.RELATIVE_TO_GROUND,
  },
});

// 전주는 도시 모듈(world.ts)의 addPolesAlongRoads에서 도로 가장자리를 따라
// 분포 배치. 점검 시뮬레이션 동선이 자연스럽게 형성됨.

/* -------------------------------------------------------------
 * Drone state + tunables
 * ------------------------------------------------------------- */
const drone = {
  lng: KEPCO_GNB_LNG,
  lat: KEPCO_GNB_LAT - 0.001,
  alt: START_ALT,
  heading: 0,        // radians
  yawSpeed: 0,
  speed: 0,          // m/s along facing direction
  lateralSpeed: 0,   // m/s perpendicular (drift slip)
  boost: 1.0,        // 0..1
  isDrifting: false,
  isBoosting: false,
};

const P = {
  accel: 18,
  reverseAccel: 10,
  naturalDecel: 0.94,
  maxSpeed: 38,
  boostMaxSpeed: 64,
  boostAccelMult: 1.9,
  yawAccel: 3.6,
  yawDecel: 0.86,
  maxYaw: 1.6,
  driftYawMult: 1.6,      // 드리프트 중 yaw 가속 증가
  driftSlipAccel: 12,     // 드리프트 측면 슬립 가속
  driftSlipDecay: 0.92,
  altRate: 14,
  boostDrain: 0.55,       // /sec
  boostRegen: 0.22,       // /sec
};

/* -------------------------------------------------------------
 * Drone visual — 쿼드콥터 모델
 *  단일 박스 대신 본체 + X자 암 + 4개 프로펠러 + 전후 핀라이트로
 *  여러 entity 조합. 모든 부품의 position은 dronePartPos()로 매 프레임
 *  드론 위치 + 회전된 local offset(ENU 좌표)으로 계산.
 *  본체 크기 ≈ 1m 급 (산업용 점검 드론 스케일).
 * ------------------------------------------------------------- */
const dronePosCallback = new CallbackProperty(
  () => Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt),
  false,
);
const droneOriCallback = new CallbackProperty(() => {
  const pos = Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt);
  // 드리프트 시 약간의 roll 추가, 가속 시 약간의 pitch 다운
  const roll = drone.isDrifting ? CMath.clamp(-drone.yawSpeed * 0.35, -0.45, 0.45) : 0;
  const pitch = -drone.speed / P.boostMaxSpeed * 0.18;
  const hpr = new HeadingPitchRoll(drone.heading, pitch, roll);
  return Transforms.headingPitchRollQuaternion(pos, hpr);
}, false);

// 드론 body-local offset(x=오른쪽, y=앞, z=위)을 world position으로 변환
function dronePartPos(offX: number, offY: number, offZ: number): CallbackProperty {
  return new CallbackProperty(() => {
    const centerPos = Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt);
    const enu = Transforms.eastNorthUpToFixedFrame(centerPos);
    const sinH = Math.sin(drone.heading);
    const cosH = Math.cos(drone.heading);
    // body(x=right, y=forward) → ENU(east, north)
    const east = offX * cosH + offY * sinH;
    const north = -offX * sinH + offY * cosH;
    const enuLocal = new Cartesian3(east, north, offZ);
    return Matrix4.multiplyByPoint(enu, enuLocal, new Cartesian3());
  }, false);
}

const DRONE_BODY = Color.fromCssColorString("#c8362e");
const DRONE_ARM  = Color.fromCssColorString("#222428");
const DRONE_PROP = Color.fromCssColorString("#cfd5dd").withAlpha(0.55);
const DRONE_LED_FRONT = Color.fromCssColorString("#ff2a44");
const DRONE_LED_REAR  = Color.fromCssColorString("#36ff6a");

// 본체 (사각형 캐빈)
viewer.entities.add({
  position: dronePosCallback as unknown as ConstantPositionProperty,
  orientation: droneOriCallback as any,
  box: {
    dimensions: new Cartesian3(0.55, 0.75, 0.18),
    material: DRONE_BODY,
    outline: true,
    outlineColor: Color.BLACK,
  },
});

// 본체 상단 캐노피 (살짝 어두운 톤, 약간 더 작은 박스)
viewer.entities.add({
  position: dronePartPos(0, 0, 0.12) as unknown as ConstantPositionProperty,
  orientation: droneOriCallback as any,
  box: {
    dimensions: new Cartesian3(0.4, 0.5, 0.1),
    material: Color.fromCssColorString("#1a1d22"),
  },
});

// X자 암 2개 (대각선 박스)
const ARM_LEN = 0.95;
const ARM_THICK = 0.06;
// 암 좌표 — X자: NE-SW와 NW-SE 두 개. 각각 heading 기준 45도/-45도 박스.
// 가장 간단한 방식: 4개 짧은 암(각 모서리 → 본체)으로 구성.
const armOffsets: Array<[number, number]> = [
  [ ARM_LEN * 0.35,  ARM_LEN * 0.35], // 전방-우
  [-ARM_LEN * 0.35,  ARM_LEN * 0.35], // 전방-좌
  [ ARM_LEN * 0.35, -ARM_LEN * 0.35], // 후방-우
  [-ARM_LEN * 0.35, -ARM_LEN * 0.35], // 후방-좌
];
for (const [ox, oy] of armOffsets) {
  // 본체 → 모터까지 가는 막대. 박스로 표현 (방향은 본체 orientation 따라감)
  // 대각선 방향이라 box dimensions 그대로 두고 본체 orientation에서 살짝 다른 방향으로 회전된 모양처럼 보이게 하기 위해
  // 우선 각 암을 (반쪽 길이의 가는 박스)로, 본체와 같은 orientation으로 두면 X자 비주얼이 약해지므로
  // 모터(원통)만 강조하고 암은 짧고 가는 박스로 단순화.
  viewer.entities.add({
    position: dronePartPos(ox * 0.6, oy * 0.6, 0) as unknown as ConstantPositionProperty,
    orientation: droneOriCallback as any,
    box: {
      dimensions: new Cartesian3(Math.abs(ox) * 1.4, Math.abs(oy) * 1.4, ARM_THICK),
      material: DRONE_ARM,
    },
  });
  // 모터 (작은 cylinder, 수직)
  viewer.entities.add({
    position: dronePartPos(ox, oy, 0.05) as unknown as ConstantPositionProperty,
    cylinder: {
      length: 0.12,
      topRadius: 0.08,
      bottomRadius: 0.08,
      material: DRONE_ARM,
    },
  });
  // 프로펠러 (납작한 cylinder, 반투명)
  viewer.entities.add({
    position: dronePartPos(ox, oy, 0.15) as unknown as ConstantPositionProperty,
    cylinder: {
      length: 0.02,
      topRadius: 0.22,
      bottomRadius: 0.22,
      material: DRONE_PROP,
      outline: true,
      outlineColor: Color.fromCssColorString("#888").withAlpha(0.6),
    },
  });
}

// 핀라이트 — 전방 빨강, 후방 녹색 (방향성 인지)
viewer.entities.add({
  position: dronePartPos(0, 0.42, -0.02) as unknown as ConstantPositionProperty,
  point: {
    pixelSize: 7,
    color: DRONE_LED_FRONT,
    outlineColor: Color.BLACK,
    outlineWidth: 1,
  },
});
viewer.entities.add({
  position: dronePartPos(0, -0.42, -0.02) as unknown as ConstantPositionProperty,
  point: {
    pixelSize: 7,
    color: DRONE_LED_REAR,
    outlineColor: Color.BLACK,
    outlineWidth: 1,
  },
});

/* -------------------------------------------------------------
 * Input
 * ------------------------------------------------------------- */
const input: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  input[e.key.toLowerCase()] = true;
  // 스크롤 방지
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  input[e.key.toLowerCase()] = false;
});
const press = (...keys: string[]) => keys.some((k) => input[k.toLowerCase()]);

/* -------------------------------------------------------------
 * Touch UI — 가상 조이스틱 + BOOST/DRIFT/고도 버튼
 *  데스크탑 키보드와 같은 `input` 레코드의 키를 토글해서
 *  게임 루프 코드 변경 없이 통일된 입력 추상화 유지.
 * ------------------------------------------------------------- */
const isTouch =
  "ontouchstart" in window ||
  (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0);

if (isTouch) {
  document.body.classList.add("touch-active");
}

// 가상 조이스틱 — touchstart/move/end로 (-1..+1, -1..+1) 입력 산출
const joystick = document.getElementById("joystick");
const joystickKnob = document.getElementById("joystick-knob");
if (joystick && joystickKnob) {
  const MAX_KNOB_OFFSET = 45; // px
  const DEADZONE = 0.22;
  let activeTouchId: number | null = null;
  let joystickCenter = { x: 0, y: 0 };

  const setJoystickKeys = (nx: number, ny: number) => {
    // nx, ny: -1..+1 (ny 양수 = 위로 = 전진)
    input["w"] = ny > DEADZONE;
    input["s"] = ny < -DEADZONE;
    input["a"] = nx < -DEADZONE;
    input["d"] = nx > DEADZONE;
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const dx = clientX - joystickCenter.x;
    const dy = clientY - joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, MAX_KNOB_OFFSET);
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * clamped;
    const knobY = Math.sin(angle) * clamped;
    joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    const nx = knobX / MAX_KNOB_OFFSET;
    const ny = -knobY / MAX_KNOB_OFFSET; // 화면 위 = -y → 전진
    setJoystickKeys(nx, ny);
  };

  const releaseJoystick = () => {
    activeTouchId = null;
    joystickKnob.style.transform = "translate(0px, 0px)";
    joystick.classList.remove("dragging");
    setJoystickKeys(0, 0);
  };

  joystick.addEventListener(
    "touchstart",
    (ev) => {
      ev.preventDefault();
      const t = ev.changedTouches[0];
      const rect = joystick.getBoundingClientRect();
      joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      activeTouchId = t.identifier;
      joystick.classList.add("dragging");
      updateJoystick(t.clientX, t.clientY);
    },
    { passive: false },
  );

  joystick.addEventListener(
    "touchmove",
    (ev) => {
      if (activeTouchId === null) return;
      ev.preventDefault();
      for (const t of Array.from(ev.changedTouches)) {
        if (t.identifier === activeTouchId) {
          updateJoystick(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false },
  );

  const endHandler = (ev: TouchEvent) => {
    if (activeTouchId === null) return;
    for (const t of Array.from(ev.changedTouches)) {
      if (t.identifier === activeTouchId) {
        releaseJoystick();
        break;
      }
    }
  };
  joystick.addEventListener("touchend", endHandler);
  joystick.addEventListener("touchcancel", endHandler);

  // 마우스로도 조작 가능 (개발/디버깅 편의)
  let mouseDown = false;
  joystick.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const rect = joystick.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    mouseDown = true;
    joystick.classList.add("dragging");
    updateJoystick(ev.clientX, ev.clientY);
  });
  window.addEventListener("mousemove", (ev) => {
    if (!mouseDown) return;
    updateJoystick(ev.clientX, ev.clientY);
  });
  window.addEventListener("mouseup", () => {
    if (!mouseDown) return;
    mouseDown = false;
    releaseJoystick();
  });
}

// 액션 버튼 — key 매핑으로 input 레코드 토글
const bindHoldButton = (id: string, key: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (ev: Event) => {
    ev.preventDefault();
    input[key] = true;
    el.classList.add("pressed");
  };
  const up = (ev: Event) => {
    ev.preventDefault();
    input[key] = false;
    el.classList.remove("pressed");
  };
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up);
  el.addEventListener("touchcancel", up);
  el.addEventListener("mousedown", down);
  el.addEventListener("mouseup", up);
  el.addEventListener("mouseleave", up);
};
bindHoldButton("btn-boost", "shift");
bindHoldButton("btn-drift", " ");
bindHoldButton("btn-alt-up", "e");
bindHoldButton("btn-alt-down", "q");

/* -------------------------------------------------------------
 * HUD
 * ------------------------------------------------------------- */
const speedEl = document.getElementById("hud-speed");
const altEl = document.getElementById("hud-alt");
const headingEl = document.getElementById("hud-heading");
const boostFillEl = document.getElementById("hud-boost-fill") as HTMLElement | null;
const hudEl = document.getElementById("hud");

/* -------------------------------------------------------------
 * Game loop — runs once per frame via Cesium preRender
 * ------------------------------------------------------------- */
let lastTime = performance.now();
viewer.scene.preRender.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // --- Drift / Boost state flags ---
  drone.isDrifting = press(" ", "space") && Math.abs(drone.speed) > 6;
  drone.isBoosting = press("shift") && drone.boost > 0.02 && drone.speed > 0;

  // --- Yaw (회전) ---
  const yawMult = drone.isDrifting ? P.driftYawMult : 1.0;
  const maxYaw = P.maxYaw * yawMult;
  if (press("a", "arrowleft")) {
    drone.yawSpeed = Math.max(drone.yawSpeed - P.yawAccel * yawMult * dt, -maxYaw);
  } else if (press("d", "arrowright")) {
    drone.yawSpeed = Math.min(drone.yawSpeed + P.yawAccel * yawMult * dt, maxYaw);
  } else {
    drone.yawSpeed *= Math.pow(P.yawDecel, dt * 60);
  }
  drone.heading += drone.yawSpeed * dt;

  // --- Forward / reverse ---
  const accel = P.accel * (drone.isBoosting ? P.boostAccelMult : 1);
  const cap = drone.isBoosting ? P.boostMaxSpeed : P.maxSpeed;
  if (press("w", "arrowup")) {
    drone.speed = Math.min(drone.speed + accel * dt, cap);
  } else if (press("s", "arrowdown")) {
    drone.speed = Math.max(drone.speed - P.reverseAccel * dt, -P.maxSpeed * 0.4);
  } else {
    drone.speed *= Math.pow(P.naturalDecel, dt * 60);
    if (Math.abs(drone.speed) < 0.05) drone.speed = 0;
  }
  // 부스트 최대 속도 위로 가 있으면 천천히 끌어내림
  if (!drone.isBoosting && drone.speed > P.maxSpeed) {
    drone.speed = Math.max(P.maxSpeed, drone.speed - 20 * dt);
  }

  // --- Drift slip (측면 슬립) ---
  if (drone.isDrifting) {
    drone.lateralSpeed += -drone.yawSpeed * P.driftSlipAccel * dt;
  }
  drone.lateralSpeed *= Math.pow(P.driftSlipDecay, dt * 60);

  // --- Altitude (Q/E) ---
  if (press("q")) drone.alt = Math.max(15, drone.alt - P.altRate * dt);
  if (press("e")) drone.alt = Math.min(500, drone.alt + P.altRate * dt);

  // --- Boost gauge ---
  if (drone.isBoosting) drone.boost = Math.max(0, drone.boost - P.boostDrain * dt);
  else drone.boost = Math.min(1, drone.boost + P.boostRegen * dt);

  // --- Position update (heading 방향 + 측면) ---
  const sinH = Math.sin(drone.heading);
  const cosH = Math.cos(drone.heading);
  const forwardDx = sinH * drone.speed * dt;
  const forwardDy = cosH * drone.speed * dt;
  const lateralDx = cosH * drone.lateralSpeed * dt;
  const lateralDy = -sinH * drone.lateralSpeed * dt;
  const totalDx = forwardDx + lateralDx;
  const totalDy = forwardDy + lateralDy;
  drone.lat += totalDy / 111111;
  drone.lng += totalDx / (111111 * Math.cos((drone.lat * Math.PI) / 180));

  // --- HUD ---
  if (speedEl) speedEl.textContent = Math.round(Math.abs(drone.speed) * 3.6).toString();
  if (altEl) altEl.textContent = Math.round(drone.alt).toString();
  if (headingEl)
    headingEl.textContent = Math.round(((drone.heading * 180) / Math.PI + 360) % 360).toString();
  if (boostFillEl) boostFillEl.style.width = `${(drone.boost * 100).toFixed(0)}%`;
  if (hudEl) {
    hudEl.classList.toggle("drifting", drone.isDrifting);
    hudEl.classList.toggle("boosting", drone.isBoosting);
  }

  /* -----------------------------------------------------------
   * 3인칭 추적 카메라
   * - 드론 뒤(heading 반대) 8m, 위 3.5m
   * - 부스트 중에는 약간 더 멀리·낮게 → 속도감
   * - lookAt 으로 부드럽게 따라보기
   * --------------------------------------------------------- */
  const dronePos = Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt);
  const enuTransform = Transforms.eastNorthUpToFixedFrame(dronePos);

  // 드론 크기를 ~1m로 줄였으므로 카메라를 더 멀리 두고 시야 확보
  const backDist = drone.isBoosting ? 24 : 18;
  const upDist = drone.isBoosting ? 5.5 : 6.5;
  // ENU local: east=+x, north=+y, up=+z
  // forward direction in ENU = (sin(h), cos(h), 0)
  const localOffset = new Cartesian3(
    -Math.sin(drone.heading) * backDist,
    -Math.cos(drone.heading) * backDist,
    upDist,
  );
  const cameraWorldPos = Matrix4.multiplyByPoint(enuTransform, localOffset, new Cartesian3());

  // 보는 지점은 드론 앞 + 살짝 위 — 거리 늘려 시야 확보
  const lookForward = new Cartesian3(
    Math.sin(drone.heading) * 12,
    Math.cos(drone.heading) * 12,
    2.5,
  );
  const lookTarget = Matrix4.multiplyByPoint(enuTransform, lookForward, new Cartesian3());

  const dir = Cartesian3.subtract(lookTarget, cameraWorldPos, new Cartesian3());
  Cartesian3.normalize(dir, dir);
  const up = Cartesian3.normalize(cameraWorldPos, new Cartesian3()); // 지구 중심→카메라 방향 = 대략 위
  const right = Cartesian3.cross(dir, up, new Cartesian3());
  Cartesian3.normalize(right, right);
  const realUp = Cartesian3.cross(right, dir, new Cartesian3());
  Cartesian3.normalize(realUp, realUp);

  viewer.camera.setView({
    destination: cameraWorldPos,
    orientation: {
      direction: dir,
      up: realUp,
    },
  });
});

console.log("[Drone Rider v0.7 — Cesium] 3인칭 카메라 · 드리프트 · 부스트");
