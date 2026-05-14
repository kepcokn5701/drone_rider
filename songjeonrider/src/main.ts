import "./style.css";
import {
  Viewer,
  Ion,
  Cartesian3,
  Cartesian2,
  Color,
  HeightReference,
  CallbackProperty,
  ConstantPositionProperty,
  HeadingPitchRoll,
  Transforms,
  PointGraphics,
  LabelStyle,
  VerticalOrigin,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

Ion.defaultAccessToken = (import.meta.env.VITE_CESIUM_ION_TOKEN as string) ?? "";

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

viewer.imageryLayers.removeAll();
viewer.scene.globe.baseColor = Color.fromCssColorString("#2a3441");
viewer.scene.globe.showGroundAtmosphere = false;
viewer.scene.globe.enableLighting = false;
if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
if (viewer.scene.sun) viewer.scene.sun.show = false;
if (viewer.scene.moon) viewer.scene.moon.show = false;
if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
if (viewer.scene.fog) viewer.scene.fog.enabled = false;
viewer.scene.backgroundColor = Color.fromCssColorString("#0a0e14");

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

const drone = {
  lng: KEPCO_GNB_LNG,
  lat: KEPCO_GNB_LAT - 0.001,
  alt: START_ALT,
  heading: 0,
  yawSpeed: 0,
  speed: 0,
};

const P = {
  accel: 14,
  reverseAccel: 8,
  naturalDecel: 0.93,
  maxSpeed: 30,
  yawAccel: 3.5,
  yawDecel: 0.88,
  maxYaw: 1.4,
  altRate: 12,
};

const dronePosCallback = new CallbackProperty(() => {
  return Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt);
}, false);

const droneOriCallback = new CallbackProperty(() => {
  const pos = Cartesian3.fromDegrees(drone.lng, drone.lat, drone.alt);
  const hpr = new HeadingPitchRoll(drone.heading, 0, 0);
  return Transforms.headingPitchRollQuaternion(pos, hpr);
}, false);

const droneEntity = viewer.entities.add({
  position: dronePosCallback as unknown as ConstantPositionProperty,
  orientation: droneOriCallback as any,
  viewFrom: new Cartesian3(0, -60, 30),
  box: {
    dimensions: new Cartesian3(4, 4, 1.2),
    material: Color.RED.withAlpha(0.95),
    outline: true,
    outlineColor: Color.BLACK,
  },
});

viewer.trackedEntity = droneEntity;

const input: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  input[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  input[e.key.toLowerCase()] = false;
});
const press = (...keys: string[]) => keys.some((k) => input[k.toLowerCase()]);

const speedEl = document.getElementById("hud-speed");
const altEl = document.getElementById("hud-alt");
const headingEl = document.getElementById("hud-heading");

let lastTime = performance.now();
viewer.scene.preRender.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (press("a", "arrowleft")) {
    drone.yawSpeed = Math.max(drone.yawSpeed - P.yawAccel * dt, -P.maxYaw);
  } else if (press("d", "arrowright")) {
    drone.yawSpeed = Math.min(drone.yawSpeed + P.yawAccel * dt, P.maxYaw);
  } else {
    drone.yawSpeed *= Math.pow(P.yawDecel, dt * 60);
  }
  drone.heading += drone.yawSpeed * dt;

  if (press("w", "arrowup")) {
    drone.speed = Math.min(drone.speed + P.accel * dt, P.maxSpeed);
  } else if (press("s", "arrowdown")) {
    drone.speed = Math.max(drone.speed - P.reverseAccel * dt, -P.maxSpeed * 0.4);
  } else {
    drone.speed *= Math.pow(P.naturalDecel, dt * 60);
    if (Math.abs(drone.speed) < 0.05) drone.speed = 0;
  }

  if (press("q")) drone.alt = Math.max(15, drone.alt - P.altRate * dt);
  if (press("e")) drone.alt = Math.min(500, drone.alt + P.altRate * dt);

  const dx = Math.sin(drone.heading) * drone.speed * dt;
  const dy = Math.cos(drone.heading) * drone.speed * dt;
  drone.lat += dy / 111111;
  drone.lng += dx / (111111 * Math.cos((drone.lat * Math.PI) / 180));

  if (speedEl) speedEl.textContent = Math.round(Math.abs(drone.speed) * 3.6).toString();
  if (altEl) altEl.textContent = Math.round(drone.alt).toString();
  if (headingEl)
    headingEl.textContent = Math.round(((drone.heading * 180) / Math.PI + 360) % 360).toString();
});

console.log("[Drone Rider v0.6 — Cesium] 드론 + 컨트롤러 + 자동 추적 카메라");
