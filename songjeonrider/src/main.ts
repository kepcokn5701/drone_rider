import "./style.css";
import {
  Engine,
  Scene,
  FollowCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  Vector3,
  Color3,
  ShaderMaterial,
  Effect,
  Texture,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Mesh,
  TransformNode,
  SceneLoader,
} from "@babylonjs/core";
import { CellMaterial } from "@babylonjs/materials";
import "@babylonjs/loaders/glTF";

Effect.ShadersStore["gradSkyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vPosition;
void main() {
  vPosition = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

Effect.ShadersStore["gradSkyFragmentShader"] = `
precision highp float;
varying vec3 vPosition;
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
void main() {
  float h = normalize(vPosition).y;
  float t = clamp(pow(max(h + offset, 0.0), exponent), 0.0, 1.0);
  vec3 col = h < 0.0
    ? mix(bottomColor, midColor, clamp(h * 4.0 + 1.0, 0.0, 1.0))
    : mix(midColor, topColor, t);
  gl_FragColor = vec4(col, 1.0);
}
`;

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { antialias: true, stencil: true });
const scene = new Scene(engine);

const skybox = MeshBuilder.CreateSphere(
  "skybox",
  { diameter: 1800, segments: 24, sideOrientation: Mesh.BACKSIDE },
  scene,
);
const skyMat = new ShaderMaterial("gradSky", scene, "gradSky", {
  attributes: ["position"],
  uniforms: ["worldViewProjection", "topColor", "midColor", "bottomColor", "offset", "exponent"],
});
skyMat.setColor3("topColor", new Color3(0.32, 0.55, 0.92));
skyMat.setColor3("midColor", new Color3(0.78, 0.9, 1.0));
skyMat.setColor3("bottomColor", new Color3(0.92, 0.95, 0.97));
skyMat.setFloat("offset", 0.05);
skyMat.setFloat("exponent", 0.55);
skyMat.backFaceCulling = false;
skyMat.disableDepthWrite = true;
skybox.material = skyMat;
skybox.infiniteDistance = true;
skybox.renderingGroupId = 0;

new HemisphericLight("hemi", new Vector3(0, 1, 0), scene).intensity = 1.0;
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
sun.intensity = 1.4;

const ground = MeshBuilder.CreateGround("ground", { width: 1000, height: 1000 }, scene);
const groundCell = new CellMaterial("groundCell", scene);
const grassTex = new Texture(
  "/forrest_ground_01_2k.blend/textures/forrest_ground_01_diff_2k.jpg",
  scene,
);
grassTex.uScale = 80;
grassTex.vScale = 80;
groundCell.diffuseTexture = grassTex;
groundCell.diffuseColor = new Color3(0.7, 0.95, 0.55);
groundCell.computeHighLevel = true;
ground.material = groundCell;

const addOutline = (mesh: Mesh, width = 0.18) => {
  mesh.renderOutline = true;
  mesh.outlineColor = new Color3(0.05, 0.05, 0.08);
  mesh.outlineWidth = width;
};

const TOWER_COUNT = 6;
const TOWER_SPACING = 80;
const TOWER_BASE_Z = -200;
const TOWER_SCALE = 3;

SceneLoader.LoadAssetContainerAsync(
  "/modular_electricity_poles_2k.gltf/",
  "modular_electricity_poles_2k.gltf",
  scene,
).then((container) => {
  container.addAllToScene();

  const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0);

  console.log("=== modular_electricity_poles 메쉬 분석 ===");
  meshes.forEach((m, i) => {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox.extendSize;
    const ratio = bb.y / Math.max(bb.x, bb.z, 0.01);
    console.log(
      `[${i}] ${m.name} verts:${m.getTotalVertices()} size:(${bb.x.toFixed(1)}, ${bb.y.toFixed(1)}, ${bb.z.toFixed(1)}) verticalRatio:${ratio.toFixed(2)}`,
    );
  });

  let mainPole: Mesh | null = null;
  let bestY = 0;
  meshes.forEach((m) => {
    const bb = m.getBoundingInfo().boundingBox.extendSize;
    const ratio = bb.y / Math.max(bb.x, bb.z, 0.01);
    if (ratio > 1.5 && bb.y > bestY && m.getTotalVertices() > 100) {
      bestY = bb.y;
      mainPole = m as Mesh;
    }
  });

  if (mainPole) {
    const pole = mainPole as Mesh;
    console.log("[메인 폴 선택]", pole.name, "height(extent):", bestY.toFixed(2));

    meshes.forEach((m) => {
      if (m !== pole) m.setEnabled(false);
    });

    pole.setParent(null);
    pole.position.set(0, 0, TOWER_BASE_Z);
    pole.rotation.set(0, 0, 0);
    pole.scaling.setAll(TOWER_SCALE);

    for (let i = 1; i < TOWER_COUNT; i++) {
      const inst = pole.createInstance(`pole_inst_${i}`);
      inst.position.set(0, 0, TOWER_BASE_Z + i * TOWER_SPACING);
      inst.scaling.setAll(TOWER_SCALE);
    }
  } else {
    console.warn("[메인 폴 미탐] fallback: 전체 키트를 6개 인스턴스화");
    for (let i = 0; i < TOWER_COUNT; i++) {
      const entries = container.instantiateModelsToScene(
        (name) => `tower_${i}_${name}`,
        false,
      );
      const root = entries.rootNodes[0] as TransformNode | undefined;
      if (root) {
        root.position.set(0, 0, TOWER_BASE_Z + i * TOWER_SPACING);
        root.scaling.setAll(TOWER_SCALE);
      }
    }
  }
});

const droneRoot = new TransformNode("droneRoot", scene);
droneRoot.position.set(0, 12, TOWER_BASE_Z - 60);

const droneBody = MeshBuilder.CreateBox("drone", { width: 2.2, height: 0.5, depth: 2.2 }, scene);
const droneCell = new CellMaterial("droneCell", scene);
droneCell.diffuseColor = new Color3(0.96, 0.28, 0.28);
droneCell.computeHighLevel = true;
droneBody.material = droneCell;
addOutline(droneBody, 0.28);
droneBody.parent = droneRoot;

for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2;
  const r = 1.4;
  const rotor = MeshBuilder.CreateCylinder(
    `rotor_${i}`,
    { diameter: 1.4, height: 0.15, tessellation: 16 },
    scene,
  );
  rotor.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
  const rotorMat = new CellMaterial(`rotorMat_${i}`, scene);
  rotorMat.diffuseColor = new Color3(0.15, 0.15, 0.18);
  rotorMat.computeHighLevel = true;
  rotor.material = rotorMat;
  addOutline(rotor, 0.12);
  rotor.parent = droneBody;
}

const camera = new FollowCamera("cam", new Vector3(0, 20, TOWER_BASE_Z - 80), scene);
camera.lockedTarget = droneBody;
camera.radius = 18;
camera.heightOffset = 7;
camera.rotationOffset = 180;
camera.cameraAcceleration = 0.04;
camera.maxCameraSpeed = 80;
scene.activeCamera = camera;

const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
pipeline.samples = 1;
pipeline.fxaaEnabled = true;
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.9;
pipeline.bloomWeight = 0.25;
pipeline.bloomKernel = 48;
pipeline.bloomScale = 0.5;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
pipeline.imageProcessing.contrast = 1.1;
pipeline.imageProcessing.exposure = 1.35;

const state = {
  velocity: 0,
  yaw: 0,
  yawSpeed: 0,
  visualRoll: 0,
  boostGauge: 100,
  boosting: false,
  boostTimeLeft: 0,
};

const P = {
  accel: 35,
  reverseAccel: 18,
  naturalDecel: 0.92,
  maxSpeed: 32,
  maxSpeedBoost: 56,
  yawAccel: 5,
  yawDecel: 0.88,
  maxYaw: 1.6,
  driftYawMul: 1.7,
  rollPerYawSpeed: 0.45,
  rollLerp: 0.12,
  boostMul: 1.75,
  boostDuration: 2.0,
  boostCost: 100,
  driftBoostGain: 28,
  passiveBoostGain: 8,
  altitude: 12,
  altitudeLerp: 0.08,
};

const input: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  input[e.key.toLowerCase()] = true;
  input[e.code] = true;
});
window.addEventListener("keyup", (e) => {
  input[e.key.toLowerCase()] = false;
  input[e.code] = false;
});
const press = (...keys: string[]) => keys.some((k) => input[k.toLowerCase()]);

const joystickEl = document.getElementById("joystick");
const joystickKnobEl = document.getElementById("joystick-knob");
const btnBoostEl = document.getElementById("btn-boost");
const btnDriftEl = document.getElementById("btn-drift");

const setupJoystick = () => {
  if (!joystickEl || !joystickKnobEl) return;
  let activePointer: number | null = null;
  const maxRadius = 55;
  const threshold = 0.3;

  const resetInputs = () => {
    input["w"] = false;
    input["s"] = false;
    input["a"] = false;
    input["d"] = false;
    joystickKnobEl.style.transform = "translate(0px, 0px)";
  };

  const onMove = (clientX: number, clientY: number) => {
    const rect = joystickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    joystickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / maxRadius;
    const ny = dy / maxRadius;
    input["a"] = nx < -threshold;
    input["d"] = nx > threshold;
    input["w"] = ny < -threshold;
    input["s"] = ny > threshold;
  };

  joystickEl.addEventListener("pointerdown", (e) => {
    activePointer = e.pointerId;
    joystickEl.setPointerCapture(e.pointerId);
    onMove(e.clientX, e.clientY);
  });
  joystickEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointer) return;
    onMove(e.clientX, e.clientY);
  });
  const endTouch = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    resetInputs();
  };
  joystickEl.addEventListener("pointerup", endTouch);
  joystickEl.addEventListener("pointercancel", endTouch);
};

const bindButton = (btn: HTMLElement | null, key: string) => {
  if (!btn) return;
  const down = (e: Event) => {
    e.preventDefault();
    input[key] = true;
  };
  const up = (e: Event) => {
    e.preventDefault();
    input[key] = false;
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
};

setupJoystick();
bindButton(btnBoostEl, " ");
bindButton(btnDriftEl, "shift");

const speedEl = document.getElementById("hud-speed");
const boostEl = document.getElementById("hud-boost");
const boostBarEl = document.getElementById("hud-boost-bar");
const stateEl = document.getElementById("hud-state");

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);

  const drifting = press("shift") && Math.abs(state.yawSpeed) > 0.15 && Math.abs(state.velocity) > 5;
  const yawMul = drifting ? P.driftYawMul : 1;

  if (press("a", "arrowleft")) {
    state.yawSpeed = Math.max(state.yawSpeed - P.yawAccel * dt, -P.maxYaw * yawMul);
  } else if (press("d", "arrowright")) {
    state.yawSpeed = Math.min(state.yawSpeed + P.yawAccel * dt, P.maxYaw * yawMul);
  } else {
    state.yawSpeed *= Math.pow(P.yawDecel, dt * 60);
  }
  state.yaw += state.yawSpeed * dt;

  const targetRoll = -state.yawSpeed * P.rollPerYawSpeed;
  state.visualRoll += (targetRoll - state.visualRoll) * P.rollLerp;
  droneRoot.rotation.y = state.yaw;
  droneBody.rotation.z = state.visualRoll;

  const maxV = state.boosting ? P.maxSpeedBoost : P.maxSpeed;
  if (press("w", "arrowup")) {
    state.velocity = Math.min(state.velocity + P.accel * dt, maxV);
  } else if (press("s", "arrowdown")) {
    state.velocity = Math.max(state.velocity - P.reverseAccel * dt, -P.maxSpeed * 0.35);
  } else {
    state.velocity *= Math.pow(P.naturalDecel, dt * 60);
    if (Math.abs(state.velocity) < 0.05) state.velocity = 0;
  }

  if (press(" ", "space") && !state.boosting && state.boostGauge >= P.boostCost) {
    state.boosting = true;
    state.boostTimeLeft = P.boostDuration;
    state.boostGauge = Math.max(0, state.boostGauge - P.boostCost);
  }
  if (state.boosting) {
    state.boostTimeLeft -= dt;
    if (state.boostTimeLeft <= 0) state.boosting = false;
  }

  const gain = drifting ? P.driftBoostGain : P.passiveBoostGain;
  state.boostGauge = Math.min(100, state.boostGauge + gain * dt);

  const forward = new Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  droneRoot.position.addInPlace(forward.scale(state.velocity * dt));
  droneRoot.position.y += (P.altitude - droneRoot.position.y) * P.altitudeLerp;

  if (speedEl) speedEl.textContent = Math.round(Math.abs(state.velocity) * 3.6).toString();
  if (boostEl) boostEl.textContent = Math.round(state.boostGauge).toString();
  if (boostBarEl) (boostBarEl as HTMLElement).style.width = state.boostGauge + "%";
  if (stateEl) {
    let s = "";
    if (state.boosting) s += "🔥BOOST ";
    if (drifting) s += "🌀DRIFT";
    stateEl.textContent = s || "—";
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

console.log("[Drone Rider M2] 컨트롤러 v1: WASD + Space(부스터) + Shift(드리프트)");
