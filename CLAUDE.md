# Drone Rider — 한전 경남본부 송전망 점검 시뮬레이션

> 이 파일은 `drone_racing_game/` 작업 시작 시 Claude가 먼저 읽는 프로젝트 전용 메모.
> 상위 `project/CLAUDE.md`(사내 보안·삭제 정책 등)도 함께 적용된다.

---

## 한 줄 요약

Cesium + Vite + TypeScript 기반 웹 드론 시뮬레이션. 한전 경남본부(진주, 35.227N · 128.692E) 일대에서 송전 인프라(전주·전선)를 따라 비행하는 점검 코스 컨셉. GitHub: https://github.com/kepcokn5701/drone_rider · Vercel: https://drone-rider.vercel.app/

---

## 현재 상태 (마지막 작업: 2026-05-15)

**완료된 것 (큰 묶음)**

- Cesium 엔진 위에 3인칭 추적 카메라 + WASD/QE/Space/Shift 조작 + 모바일 가상 조이스틱+BOOST/DRIFT/▲▼
- 드론: 9-entity 쿼드콥터(본체·X암·4 모터·4 프로펠러·전방 빨강 LED·후방 녹색 LED). 프로펠러 매 프레임 회전, 부스트 시 후미 트레일(`PolylineGlowMaterialProperty`)
- 환경: 황혼 CSS 그라데이션 하늘, fog, 블룸 포스트프로세싱, 카메라 lag + 부스트/드리프트 셰이크
- 도시: `src/world.ts`의 procedural 도시(도로 격자·창문 그리드 GridMaterial·옥상 안테나/물탱크·항공장애등 펄스·도로 차선/횡단보도·강·녹지)
- 송전 인프라: 도시 도로 가장자리를 따라 전주 ~70개 분포 + 가로대 양 끝을 잇는 송전선 polyline(처짐 포함)

**현재 활성 모드 (3-tier 우선순위, `src/main.ts`)**

1. `VITE_GOOGLE_3D_TILES_KEY` 있으면 → **Google Photorealistic 3D Tiles** + 전주/전선
2. `VITE_VWORLD_KEY` 있으면(현재 사용 중) → **V-World 위성영상** + **OSM Buildings(회색 #6e7884 / α0.88 / 60m clip)** + 전주/전선
3. 둘 다 없으면 → **Procedural city** (사내 오프라인 fallback)

---

## 다음 작업 우선순위

### 1. Google Photorealistic 3D Tiles 키 발급 + 적용 (최우선)

**왜**: 현재 V-World+OSM은 임시. OSM 한국 데이터에 `building:height` 태그가 빈약해서 박스 높이가 위성 사진과 안 맞고, 진주 도심 일부만 매핑돼 있음. Google 3D Tiles는 진주 포함 한국 주요 지역 **항공 사진 메쉬** — 옆면까지 진짜 사진. 시연·홍보용 임팩트 가장 큼.

**작업**:

1. https://console.cloud.google.com → 새 프로젝트 → **Map Tiles API** 사용 설정 → API 키 발급 (결제 카드 등록 필요하지만 무료 할당량 월 10,000 tile loads 안에서 과금 0원)
2. `.env.local`에 추가:
   ```
   VITE_GOOGLE_3D_TILES_KEY=<발급키>
   ```
3. Vercel 환경 변수에도 같은 키 추가 → 자동 재배포
4. **코드 변경 0줄**. 3-tier 분기가 자동으로 Google 우선으로 전환.

**파일 위치**: 분기는 `songjeonrider/src/main.ts`의 `if (GOOGLE_3D_TILES_KEY) { ... }` 블록.

### 2. Vercel 배포 마무리 (아직 미완)

V-World 신청서 서비스 URL로 `https://drone-rider.vercel.app/`을 적었으니 그 URL이 실제로 살아 있어야 함.

1. https://vercel.com → GitHub 로그인 → Add New → Project → `kepcokn5701/drone_rider` Import
2. **Root Directory** Edit → `songjeonrider` 선택 (필수, 모노레포 구조)
3. Framework: Vite 자동 감지
4. Environment Variables:
   - `VITE_CESIUM_ION_TOKEN`
   - `VITE_VWORLD_KEY`
   - (있으면) `VITE_GOOGLE_3D_TILES_KEY`
5. Deploy

### 3. 차후 후보 (필요시)

- **트랙 모드** — 체크포인트 N개를 전주 따라 배치, 랩 타임 측정, 베스트 타임은 `sessionStorage`
- **충돌** — 전주/건물 box AABB 충돌 검출 + 속도 감속 + 화면 흔들림
- **사운드** — Web Audio로 합성(부스트 jet, 드리프트 스키드, 프로펠러 휘잉) — 파일 0개
- **V-World GeoData(WFS) API 통합** — 한국 정부 공식 건물 footprint+높이로 OSM 대체. 1~2시간 작업. Google 키 발급이 정말 안 될 때 차선책으로만.
- **어안 렌즈 / 디지털 노이즈 등 PostProcess** — 셰이더 직접 작성 비용 대비 효과 검토 필요

---

## 환경 변수 (`songjeonrider/.env.local`)

영속 확장자(`.local`)라 사내 보안 자동 삭제 대상 아님. 단 git ignore돼서 다른 환경에 복사 안 됨.

| 키 | 용도 | 현재 |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion (OSM Buildings, default imagery) | 설정됨 |
| `VITE_VWORLD_KEY` | V-World 위성/하이브리드 WMTS | 설정됨 |
| `VITE_GOOGLE_3D_TILES_KEY` | Google Photorealistic 3D Tiles | **미설정** (다음 작업 1번) |

---

## 아키텍처 핵심

### "영속 소스 + 휘발성 뷰 + 재생성 스크립트" 패턴 (사내 보안 대응)

- `index.html`은 사내 보안이 하루 2번 삭제하는 `.html` 확장자
- `songjeonrider/scripts/gen-html.js`(영속 `.js`)가 마크업 본체
- `package.json`의 `predev`/`prebuild`가 자동 호출 → `npm run dev` 한 번이면 매번 새로 만들어짐

### `offlineMode` 자동 감지

`src/main.ts`에서 `location.hostname === "localhost"`로 판정. localhost에선 skyBox/sun/moon/skyAtmosphere 등 텍스처 의존 요소 끔(사내 PNG/JPG 삭제 대응). fog는 텍스처 의존 없는 거리 페이드라 try-catch 후 활성화.

### `commit-and-push.ps1` (배포 스크립트)

`drone_racing_game/scripts/commit-and-push.ps1`. virtiofs 마운트 캐싱 + PowerShell here-string 인자 파싱 문제 등으로 컨테이너 bash에서 git이 자주 막혀서, Windows host에서 직접 실행하는 7단계 PowerShell 스크립트로 묶음. 메시지 부분만 갈아끼면 재사용.

실행: PowerShell에서
```
& 'C:\Users\Admin\Desktop\project\drone_racing_game\scripts\commit-and-push.ps1'
```

---

## 알려진 한계 / 주의사항

- **OSM Buildings 한국 데이터 빈약**: 진주 도심 일부만 매핑, height 정보 거의 없음 → 박스 높이 부정확. Google 3D Tiles로 해결.
- **V-World 3D는 외부 Cesium에 직접 통합 안 됨**: V-World 자체 뷰어/SDK용. 외부 통합하려면 GeoData WFS API로 footprint를 별도로 받아서 자체 extrude해야 함.
- **사내 SSL 프록시**: 일부 외부 API 차단됨. V-World·OSM Buildings(Cesium Ion)는 현재 사내에서 작동 확인. Google 3D Tiles 사내 작동 여부 미실측.
- **마운트 sync 이슈**: Linux 컨테이너의 `/sessions/.../mnt/`가 host Windows를 virtiofs로 마운트하는데, 큰 Edit 직후 부분만 반영되거나 stale lock 잔재가 남는 경우 있음 → host에서 Read로 확인 또는 PowerShell로 직접 처리.

---

## 자주 쓰는 명령

```bash
# dev 서버 (predev가 gen-html.js 자동 실행)
cd songjeonrider && npm run dev

# 빌드 (prebuild가 gen-html.js 자동 실행)
cd songjeonrider && npm run build

# index.html만 재생성
cd songjeonrider && node scripts/gen-html.js
```

```powershell
# commit + push (Windows host에서)
& 'C:\Users\Admin\Desktop\project\drone_racing_game\scripts\commit-and-push.ps1'
```
