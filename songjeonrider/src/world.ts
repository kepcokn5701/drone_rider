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
  Cartesian3,
  Color,
  PolygonHierarchy,
  type Viewer,
} from "cesium";

/* -------------------------------------------------------------
 * Palette — 도시 자연 톤
 * ------------------------------------------------------------- */
const PALETTE = {
  road: Color.fromCssColorString("#2a2c30"),
  roadEdge: Color.fromCssColorString("#3a3d42"),
  bldgWarm: Color.fromCssColorString("#6b6356"),
  bldgCool: Color.fromCssColorString("#4f5b66"),
  bldgRoof: Color.fromCssColorString("#2d343a"),
  bldgAccent: Color.fromCssColorString("#8c7a5b"),
  park: Color.fromCssColorString("#2f4a2c"),
  parkDeep: Color.fromCssColorString("#243d22"),
  water: Color.fromCssColorString("#1f3a55").withAlpha(0.9),
  waterEdge: Color.fromCssColorString("#2a4868"),
};

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
        // dimensions: 폭 12~30m, 깊이 12~30m, 높이 8~42m
        const w = 12 + rng() * 18;
        const d = 12 + rng() * 18;
        const h = 8 + rng() * 34;
        const color = [PALETTE.bldgWarm, PALETTE.bldgCool, PALETTE.bldgAccent][
          Math.floor(rng() * 3)
        ];
        viewer.entities.add({
          position: Cartesian3.fromDegrees(cx, cy, h / 2),
          box: {
            dimensions: new Cartesian3(w, d, h),
            material: color,
            outline: true,
            outlineColor: PALETTE.bldgRoof,
          },
        });
        // 옥상 (살짝 어두운 톤 — 평지붕 느낌)
        viewer.entities.add({
          position: Cartesian3.fromDegrees(cx, cy, h),
          box: {
            dimensions: new Cartesian3(w * 0.95, d * 0.95, 0.8),
            material: PALETTE.bldgRoof,
          },
        });
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
}
