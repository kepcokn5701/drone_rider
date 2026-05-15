// scripts/gen-html.js
// ---------------------------------------------------------------
// 영속 소스 → 휘발성 뷰 재생성 스크립트
// 사내 보안 정책으로 .html 파일이 매일 자동 삭제되므로,
// index.html은 항상 이 .js 영속 소스에서 다시 생성한다.
//
// 실행:
//   - 자동: `npm run dev` / `npm run build` 가 호출 전 실행 (package.json prescript)
//   - 수동: `node scripts/gen-html.js`
// ---------------------------------------------------------------

import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "index.html");

// HUD (데스크탑) 마크업
const hud = `
    <div id="hud">
      <div class="hud-row">
        <span class="hud-label">SPEED</span>
        <span id="hud-speed">0</span>
        <span class="hud-unit">km/h</span>
      </div>
      <div class="hud-row">
        <span class="hud-label">ALT</span>
        <span id="hud-alt">0</span>
        <span class="hud-unit">m</span>
      </div>
      <div class="hud-row">
        <span class="hud-label">HDG</span>
        <span id="hud-heading">0</span>
        <span class="hud-unit">&deg;</span>
      </div>
      <div class="hud-boost-wrap">
        <div class="hud-boost-label">BOOST</div>
        <div class="hud-boost-track">
          <div id="hud-boost-fill"></div>
        </div>
      </div>
    </div>`;

// 모바일 터치 컨트롤 마크업 (touch 감지 시 main.ts가 .touch-active 토글)
// 레이아웃: 조이스틱(왼쪽 아래) ↔ 액션 클러스터(오른쪽 아래).
// ▲▼ 알트 버튼은 오른쪽 클러스터의 BOOST/DRIFT 위쪽에 가로로 배치
// (왼쪽 조이스틱과 영역 분리해 손가락 충돌 방지).
const touchUI = `
    <div id="touch-ui" aria-hidden="true">
      <!-- 왼쪽: 가상 조이스틱 (방향 + 전진/후진) -->
      <div id="joystick" class="joystick">
        <div id="joystick-knob" class="joystick-knob"></div>
      </div>

      <!-- 오른쪽: 액션 버튼 클러스터 (▲▼ 위 / DRIFT BOOST 아래) -->
      <div class="action-cluster">
        <div class="alt-stack">
          <button id="btn-alt-up" class="btn-alt" type="button" aria-label="Ascend">&#9650;</button>
          <button id="btn-alt-down" class="btn-alt" type="button" aria-label="Descend">&#9660;</button>
        </div>
        <div class="action-row">
          <button id="btn-drift" class="btn-action btn-drift" type="button">DRIFT</button>
          <button id="btn-boost" class="btn-action btn-boost" type="button">BOOST</button>
        </div>
      </div>
    </div>`;

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#0a0e14" />
    <title>Drone Rider</title>
  </head>
  <body>
    <div id="cesiumContainer"></div>

    <div id="hint">
      W/S 전진·후진 · A/D 회전 · Q/E 고도 · Space 드리프트 · Shift 부스트
    </div>
${hud}
${touchUI}

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

writeFileSync(OUT_PATH, html, "utf8");

if (!existsSync(OUT_PATH)) {
  console.error("[gen-html] FAILED to write", OUT_PATH);
  process.exit(1);
}
console.log("[gen-html] regenerated", OUT_PATH);
