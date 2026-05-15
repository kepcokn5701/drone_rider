// src/world.ts
// ---------------------------------------------------------------
// 한전 경남본부 일대를 procedural primitive로 모델링.
// 사내 보안이 .png/.jpg를 매일 지우는 환경에서도 외부 텍스처 없이
// "사실적인 환경" 느낌을 내기 위한 모듈.
//
// 모든 좌표는 (lng, lat) 도(degree) 단위로 정의하고,
// buildWorld()가 viewer.entities에 도로/건물/녹지/강을 일괄 등록한다.
// ---------------------------------------------------------------

import {
  Cartesian2,
  Cartesian3,
  Color,
  GridMaterialProperty,
  PolygonHierarchy,
  PolylineGraphics,
  type Viewer,
} from "cesium";

/* -------------------------------------------------------------
 * Palette — 도시 자연 톤
 * ------------------------------------------------------------- */
const PALETTE = {
  road: Color.fromCssColorString("#22252a"),
  roadEdge: Color.fromCssColorString("#3a3d42"),
  laneYellow: Color.fromCssColorString("#d8b341"),
  crosswalk: Color.fromCssColorString("#cfd0c8"),
  bldgWarm: Color.fromCssColorString("#7a6f5c"),
  bldgCool: Color.fromCssColorString("#4f5b66"),
  bldgRoof: Color.fromCssColorString("#2d343a"),
  bldgAccent: Color.fromCssColorString("#8c7a5b"),
  bldgGlass: Color.fromCssColorString("#3a5a7a"),
  bldgBrick: Color.fromCssColorString("#7a4a3a"),
  bldgWhite: Color.fromCssColorString("#bcbcbc"),
  windowLit: Color.fromCssColorString("#f0c46a"),  // 노란 야간 창문
  windowDim: Color.fromCssColorString("#3a4858"),  // 꺼진 창문
  rooftopGear: Color.fromCssColorString("#1a1d22"),
  park: Color.fromCssColorString("#2f4a2c"),
  parkDeep: Color.fromCssColorString("#243d22"),
  water: Color.fromCssColorString("#1f3a55").withAlpha(0.9),
  waterEdge: Color.fromCssColorString("#2a4868"),
};

const BLDG_COLORS = [
  Color.fromCssColorString("#7a6f5c"),
  Color.fromCssColorString("#4f5b66"),
  Color.fromCssColorString("#8c7a5b"),
  Color.fromCssColorString("#3a5a7a"),
  Color.fromCssColorString("#7a4a3a"),
  Color.fromCssColorString("#bcbcbc"),
  Color.fromCssColorString("#5a6470"),
];

/* -------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------- */
function rectanglePolygon(
  lngMin: number,
  latMin: number,
  lngMax: number,
  latMax: number,
): Cartesian3[] {
  return Cartesian3.fromDegreesArray([
    lngMin, latMin,
    lngMax, latMin,
    lngMax, latMax,
    lngMin, latMax,
  ]);
}

// 시드 기반 의사 난수 (빌드마다 같은 도시 형태 유지)
function seedRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/* -------------------------------------------------------------
 * World builder
 * ------------------------------------------------------------- */
export function buildWorld(viewer: Viewer, centerLng: number, centerLat: number) {
  // 1도 ≈ 111km. 영역을 약 ±550m로 잡으면 ±0.005 deg.
  const SPAN = 0.005;
  const lngMin = centerLng - SPAN;
  const lngMax = centerLng + SPAN;
  const latMin = centerLat - SPAN;
  const latMax = centerLat + SPAN;

  /* ---- 1. 베이스 지면 (지면 자체는 globe baseColor가 담당하므로
   *       여기서는 큰 패치 몇 개로 자연스러운 색감 변화만 더한다)  ---- */
  // 북서 큰 녹지
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(
        rectanglePolygon(
          lngMin,
          centerLat + SPAN * 0.25,
          centerLng - SPAN * 0.3,
          latMax,
        ),
      ),
      material: PALETTE.park,
      height: 0.1,
    },
  });
  // 동남쪽 작은 녹지
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(
        rectanglePolygon(
          centerLng + SPAN * 0.5,
          latMin,
          centerLng + SPAN * 0.85,
          centerLat - SPAN * 0.5,
        ),
      ),
      material: PALETTE.parkDeep,
      height: 0.1,
    },
  });

  /* ---- 2. 남쪽 가로지르는 강 (남강 모티프) ---- */
  // 약간 굽이지게 다각형으로
  const riverNorth = centerLat - SPAN * 0.7;
  const riverSouth = centerLat - SPAN * 0.95;
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(
        Cartesian3.fromDegreesArray([
          lngMin,            riverNorth - SPAN * 0.05,
          centerLng - SPAN * 0.3, riverNorth,
          centerLng + SPAN * 0.2, riverNorth + SPAN * 0.04,
          lngMax,            riverNorth - SPAN * 0.02,
          lngMax,            riverSouth,
          lngMin,            riverSouth,
        ]),
      ),
      material: PALETTE.water,
      height: 0.05,
    },
  });

  /* ---- 3. 도로 그리드 ---- */
  // 메인 십자 (도로 폭 ≈ 14m, lat 1deg≈111km → 0.000063 deg ≈ 7m, 폭은 SPAN 비율로)
  const MAIN_HALF = SPAN * 0.012; // ≈ 13m
  const SUB_HALF  = SPAN * 0.007; // ≈ 7.7m
  const addRoad = (lng1: number, lat1: number, lng2: number, lat2: number, halfWidth: number) => {
    // 수평 또는 수직 도로 가정: 폭은 axis-aligned bbox로 그림
    if (Math.abs(lng2 - lng1) > Math.abs(lat2 - lat1)) {
      // 동서 도로
      const lat = (lat1 + lat2) / 2;
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(
            rectanglePolygon(
              Math.min(lng1, lng2),
              lat - halfWidth,
              Math.max(lng1, lng2),
              lat + halfWidth,
            ),
          ),
          material: PALETTE.road,
          height: 0.15,
        },
      });
    } else {
      // 남북 도로
      const lng = (lng1 + lng2) / 2;
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(
            rectanglePolygon(
              lng - halfWidth,
              Math.min(lat1, lat2),
              lng + halfWidth,
              Math.max(lat1, lat2),
            ),
          ),
          material: PALETTE.road,
          height: 0.15,
        },
      });
    }
  };

  // 메인 십자
  addRoad(lngMin, centerLat, lngMax, centerLat, MAIN_HALF);
  addRoad(centerLng, latMin, centerLng, latMax, MAIN_HALF);
  // 부도로 3x3 그리드 (메인 십자 외 추가 격자)
  const SUB_STEPS = [-0.6, -0.3, 0.3, 0.6];
  for (const k of SUB_STEPS) {
    addRoad(lngMin, centerLat + SPAN * k, lngMax, centerLat + SPAN * k, SUB_HALF);
    addRoad(centerLng + SPAN * k, latMin, centerLng + SPAN * k, latMax, SUB_HALF);
  }

  // ---- 도로 마킹: 메인 십자 중앙선(점선) + 교차점 횡단보도 ----
  // 중앙선 (동서 메인 도로) — 노란 점선
  const dashStepEW = (lngMax - lngMin) / 36;
  for (let i = 0; i < 36; i += 2) {
    const lng1 = lngMin + i * dashStepEW;
    const lng2 = lngMin + (i + 1) * dashStepEW;
    viewer.entities.add({
      polyline: new PolylineGraphics({
        positions: Cartesian3.fromDegreesArrayHeights([
          lng1, centerLat, 0.4,
          lng2, centerLat, 0.4,
        ]),
        width: 2,
        material: PALETTE.laneYellow,
      }),
    });
  }
  // 중앙선 (남북 메인 도로)
  const dashStepNS = (latMax - latMin) / 36;
  for (let i = 0; i < 36; i += 2) {
    const lat1 = latMin + i * dashStepNS;
    const lat2 = latMin + (i + 1) * dashStepNS;
    viewer.entities.add({
      polyline: new PolylineGraphics({
        positions: Cartesian3.fromDegreesArrayHeights([
          centerLng, lat1, 0.4,
          centerLng, lat2, 0.4,
        ]),
        width: 2,
        material: PALETTE.laneYellow,
      }),
    });
  }
  // 교차점 횡단보도 — 메인 ×메인 만나는 정중앙 네 방향에 줄무늬
  const cwLen = MAIN_HALF * 1.4;     // 횡단보도 줄무늬 길이 (lat 또는 lng 방향)
  const cwOff = MAIN_HALF * 1.05;    // 교차점에서 떨어진 거리
  const cwStripeCount = 5;
  // 동·서 방향 횡단보도 (가로 줄무늬가 도로 가로지름 — 즉 stripe가 남북 방향)
  for (const sgn of [-1, 1]) {
    for (let s = 0; s < cwStripeCount; s++) {
      const lng = centerLng + sgn * cwOff + sgn * (s * (MAIN_HALF * 0.32));
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(
            rectanglePolygon(
              lng - MAIN_HALF * 0.08,
              centerLat - cwLen / 2,
              lng + MAIN_HALF * 0.08,
              centerLat + cwLen / 2,
            ),
          ),
          material: PALETTE.crosswalk,
          height: 0.35,
        },
      });
    }
  }
  // 남·북 방향 횡단보도
  for (const sgn of [-1, 1]) {
    for (let s = 0; s < cwStripeCount; s++) {
      const lat = centerLat + sgn * cwOff + sgn * (s * (MAIN_HALF * 0.32));
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(
            rectanglePolygon(
              centerLng - cwLen / 2,
              lat - MAIN_HALF * 0.08,
              centerLng + cwLen / 2,
              lat + MAIN_HALF * 0.08,
            ),
          ),
          material: PALETTE.crosswalk,
          height: 0.35,
        },
      });
    }
  }

  /* ---- 4. 건물 — 블록마다 랜덤 박스 ---- */
  const rng = seedRand(2026);
  // 블록 그리드 좌표 (메인 십자 + 부도로 사이 9~16개 블록)
  const blockEdges = [-0.6, -0.3, 0, 0.3, 0.6].map((k) => SPAN * k);
  for (let bi = 0; bi < blockEdges.length - 1; bi++) {
    for (let bj = 0; bj < blockEdges.length - 1; bj++) {
      const bLngMin = centerLng + blockEdges[bi] + SUB_HALF * 1.5;
      const bLngMax = centerLng + blockEdges[bi + 1] - SUB_HALF * 1.5;
      const bLatMin = centerLat + blockEdges[bj] + SUB_HALF * 1.5;
      const bLatMax = centerLat + blockEdges[bj + 1] - SUB_HALF * 1.5;
      if (bLngMax <= bLngMin || bLatMax <= bLatMin) continue;

      // 한 블록당 건물 2~4개
      const count = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) {
        const cx = bLngMin + rng() * (bLngMax - bLngMin);
        const cy = bLatMin + rng() * (bLatMax - bLatMin);
        const w = 12 + rng() * 18;
        const d = 12 + rng() * 18;
        const h = 8 + rng() * 34;
        const color = BLDG_COLORS[Math.floor(rng() * BLDG_COLORS.length)];
        addBuilding(viewer, cx, cy, w, d, h, color, rng);
      }
    }
  }

  /* ---- 5. 한전 본부 건물 — 중심에 좀 더 큰 랜드마크 박스 ---- */
  viewer.entities.add({
    position: Cartesian3.fromDegrees(centerLng - SPAN * 0.05, centerLat + SPAN * 0.05, 28),
    box: {
      dimensions: new Cartesian3(42, 28, 56),
      material: Color.fromCssColorString("#3a4f6b"),
      outline: true,
      outlineColor: Color.fromCssColorString("#1f2a3a"),
    },
  });
  viewer.entities.add({
    position: Cartesian3.fromDegrees(centerLng - SPAN * 0.05, centerLat + SPAN * 0.05, 56),
    box: {
      dimensions: new Cartesian3(40, 26, 1.2),
      material: PALETTE.waterEdge,
    },
  });

  /* ---- 6. 전주 — 도로 가장자리를 따라 분포 (점검 시뮬레이션 동선) ---- */
  addPolesAlongRoads(viewer, centerLng, centerLat, SPAN);
}

/* -------------------------------------------------------------
 * Building — 본체 + 옥상 + 창문 격자 + (랜덤) 옥상 구조물
 *   창문 격자는 GridMaterialProperty 한 줄로 박스 표면에 그려서
 *   entity 수를 늘리지 않고 야간 도시 느낌을 만든다.
 * ------------------------------------------------------------- */
function addBuilding(
  viewer: Viewer,
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number,
  baseColor: Color,
  rng: () => number,
) {
  // 창문 격자 — 폭/높이에 비례한 행/열
  const lineCountX = Math.max(2, Math.floor(w / 2.6));
  const lineCountZ = Math.max(2, Math.floor(h / 3.2));

  // 본체 (창문 그리드 material)
  viewer.entities.add({
    position: Cartesian3.fromDegrees(cx, cy, h / 2),
    box: {
      dimensions: new Cartesian3(w, d, h),
      material: new GridMaterialProperty({
        color: baseColor,
        cellAlpha: 0.88,
        lineCount: new Cartesian2(lineCountX, lineCountZ),
        lineThickness: new Cartesian2(1.6, 1.6),
      }),
      outline: true,
      outlineColor: PALETTE.bldgRoof,
    },
  });

  // 옥상 (평지붕)
  viewer.entities.add({
    position: Cartesian3.fromDegrees(cx, cy, h),
    box: {
      dimensions: new Cartesian3(w * 0.96, d * 0.96, 0.8),
      material: PALETTE.bldgRoof,
    },
  });

  // 옥상 구조물 — 30% 안테나 / 40% 물탱크 / 나머지 빈 옥상
  const r = rng();
  if (r < 0.3) {
    // 안테나 (얇은 cylinder)
    const ax = cx;
    const ay = cy;
    const aH = 4 + rng() * 6;
    viewer.entities.add({
      position: Cartesian3.fromDegrees(ax, ay, h + aH / 2),
      cylinder: {
        length: aH,
        topRadius: 0.08,
        bottomRadius: 0.12,
        material: PALETTE.rooftopGear,
      },
    });
    // 끝에 작은 빨간 점 (항공장애등 느낌)
    viewer.entities.add({
      position: Cartesian3.fromDegrees(ax, ay, h + aH + 0.2),
      point: {
        pixelSize: 5,
        color: Color.fromCssColorString("#ff3344"),
        outlineColor: Color.BLACK,
        outlineWidth: 1,
      },
    });
  } else if (r < 0.7) {
    // 물탱크 (작은 박스 두 개 — 받침대 + 탱크)
    const tw = Math.min(w * 0.3, 4);
    const td = Math.min(d * 0.3, 4);
    viewer.entities.add({
      position: Cartesian3.fromDegrees(cx, cy, h + 0.6),
      box: {
        dimensions: new Cartesian3(tw * 0.7, td * 0.7, 1.2),
        material: PALETTE.rooftopGear,
      },
    });
    viewer.entities.add({
      position: Cartesian3.fromDegrees(cx, cy, h + 2.0),
      box: {
        dimensions: new Cartesian3(tw, td, 1.6),
        material: PALETTE.bldgWhite,
        outline: true,
        outlineColor: PALETTE.bldgRoof,
      },
    });
  }
  // 나머지 30%는 빈 평지붕
}

/* -------------------------------------------------------------
 * 전주 — 도로 가장자리에 분포
 *  점검 시뮬레이션 컨셉상 도시 전역에 흩어져 있는 게 자연스러움.
 *  메인 십자 도로 양쪽 + 일부 부도로 가장자리에 약 30m 간격 배치.
 * ------------------------------------------------------------- */
function addPolesAlongRoads(
  viewer: Viewer,
  centerLng: number,
  centerLat: number,
  SPAN: number,
) {
  const POLE_HEIGHT = 12; // m
  const POLE_COLOR = Color.fromCssColorString("#3a3f47");
  const MAIN_HALF = SPAN * 0.012;
  // lat 1deg ≈ 111km, lng 1deg ≈ 111km * cos(lat)
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const POLE_STEP_DEG_NS = 30 / 111111;            // 30m in lat
  const POLE_STEP_DEG_EW = 30 / (111111 * cosLat); // 30m in lng

  // axis: 가로대가 뻗을 방향. 'ns'=가로대 남북(도로가 동서일 때),
  //       'ew'=가로대 동서(도로가 남북일 때). 도로와 가로대는 직각.
  const addPole = (lng: number, lat: number, axis: "ew" | "ns") => {
    // 본체 (cylinder)
    viewer.entities.add({
      position: Cartesian3.fromDegrees(lng, lat, POLE_HEIGHT / 2),
      cylinder: {
        length: POLE_HEIGHT,
        topRadius: 0.22,
        bottomRadius: 0.32,
        material: POLE_COLOR,
        outline: true,
        outlineColor: Color.BLACK,
      },
    });
    // 가로대 (cross-arm) — axis에 따라 dimensions swap
    const dims =
      axis === "ns"
        ? new Cartesian3(0.18, 2.6, 0.18) // 가로대 길이가 남북
        : new Cartesian3(2.6, 0.18, 0.18); // 가로대 길이가 동서
    viewer.entities.add({
      position: Cartesian3.fromDegrees(lng, lat, POLE_HEIGHT - 0.8),
      box: {
        dimensions: dims,
        material: POLE_COLOR,
        outline: true,
        outlineColor: Color.BLACK,
      },
    });
  };

  // 동서 메인 도로 (centerLat 가로) — 도로 양옆(±MAIN_HALF + 약간 더)에 배치
  const sideOffsetLat = MAIN_HALF + 3 / 111111; // 도로 가장자리 + 3m
  const lngFrom = centerLng - SPAN * 0.95;
  const lngTo   = centerLng + SPAN * 0.95;
  const ewPoles: Array<[number, number]> = [];
  for (let lng = lngFrom; lng <= lngTo; lng += POLE_STEP_DEG_EW) {
    if (Math.abs(lng - (centerLng - SPAN * 0.05)) < SPAN * 0.04) continue;
    addPole(lng, centerLat + sideOffsetLat, "ns");
    ewPoles.push([lng, centerLat + sideOffsetLat]);
  }

  // 남북 메인 도로 (centerLng 세로) — 도로 양옆에 배치
  const sideOffsetLng = MAIN_HALF + 3 / (111111 * cosLat);
  const latFrom = centerLat - SPAN * 0.95;
  const latTo   = centerLat + SPAN * 0.95;
  const nsPoles: Array<[number, number]> = [];
  for (let lat = latFrom; lat <= latTo; lat += POLE_STEP_DEG_NS) {
    if (Math.abs(lat - (centerLat + SPAN * 0.05)) < SPAN * 0.04) continue;
    addPole(centerLng + sideOffsetLng, lat, "ew");
    nsPoles.push([centerLng + sideOffsetLng, lat]);
  }

  // 부도로 일부 — 동쪽 SUB_STEPS 0.3 라인을 따라 추가
  const subLat = centerLat + SPAN * 0.3 + SPAN * 0.007 + 3 / 111111;
  const subPoles: Array<[number, number]> = [];
  for (let lng = lngFrom; lng <= lngTo; lng += POLE_STEP_DEG_EW * 1.5) {
    addPole(lng, subLat, "ns");
    subPoles.push([lng, subLat]);
  }

  // 전선 — 인접 전주 사이를 polyline으로 잇기 (가로대 양 끝, 처짐 포함)
  addPowerLines(viewer, ewPoles, "ns", centerLat, POLE_HEIGHT);
  addPowerLines(viewer, nsPoles, "ew", centerLat, POLE_HEIGHT);
  addPowerLines(viewer, subPoles, "ns", centerLat, POLE_HEIGHT);
}

/* -------------------------------------------------------------
 * Power lines — 전주 가로대 양 끝을 polyline으로 연결.
 *   sag(처짐)을 중간점 z를 살짝 낮춰 자연스럽게 표현.
 * ------------------------------------------------------------- */
function addPowerLines(
  viewer: Viewer,
  points: Array<[number, number]>,
  axis: "ew" | "ns",
  centerLat: number,
  poleHeight: number,
) {
  if (points.length < 2) return;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const CROSS_HALF_M = 1.2;                                   // 가로대 절반 길이
  const crossLatHalf = CROSS_HALF_M / 111111;
  const crossLngHalf = CROSS_HALF_M / (111111 * cosLat);
  const wireZ = poleHeight - 0.8;
  const sagZ = wireZ - 0.45;                                  // 처짐 깊이
  const wireColor = Color.fromCssColorString("#15171b");

  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1] = points[i];
    const [lng2, lat2] = points[i + 1];
    // 인접 거리가 너무 멀면(=다른 라인 끝) 스킵
    const dDeg = Math.hypot(lng2 - lng1, lat2 - lat1);
    if (dDeg > 0.0008) continue;

    let lng1L: number, lat1L: number, lng1R: number, lat1R: number;
    let lng2L: number, lat2L: number, lng2R: number, lat2R: number;
    if (axis === "ns") {
      lng1L = lng1; lat1L = lat1 - crossLatHalf;
      lng1R = lng1; lat1R = lat1 + crossLatHalf;
      lng2L = lng2; lat2L = lat2 - crossLatHalf;
      lng2R = lng2; lat2R = lat2 + crossLatHalf;
    } else {
      lng1L = lng1 - crossLngHalf; lat1L = lat1;
      lng1R = lng1 + crossLngHalf; lat1R = lat1;
      lng2L = lng2 - crossLngHalf; lat2L = lat2;
      lng2R = lng2 + crossLngHalf; lat2R = lat2;
    }

    // 왼쪽 선 (3-point polyline으로 sag 표현)
    viewer.entities.add({
      polyline: new PolylineGraphics({
        positions: Cartesian3.fromDegreesArrayHeights([
          lng1L, lat1L, wireZ,
          (lng1L + lng2L) / 2, (lat1L + lat2L) / 2, sagZ,
          lng2L, lat2L, wireZ,
        ]),
        width: 1.5,
        material: wireColor,
      }),
    });
    // 오른쪽 선
    viewer.entities.add({
      polyline: new PolylineGraphics({
        positions: Cartesian3.fromDegreesArrayHeights([
          lng1R, lat1R, wireZ,
          (lng1R + lng2R) / 2, (lat1R + lat2R) / 2, sagZ,
          lng2R, lat2R, wireZ,
        ]),
        width: 1.5,
        material: wireColor,
      }),
    });
  }
}
