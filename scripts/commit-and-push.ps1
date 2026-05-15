# commit-and-push.ps1  (v2)
# ---------------------------------------------------------------
# v1 에서 발생한 두 문제 해결:
#   (a) PowerShell here-string 을 `git commit -m $msg` 에 넘기면
#       줄 단위로 쪼개져서 메시지의 단어들이 pathspec 인자로 새는 사고
#       → 메시지를 임시 파일에 저장하고 `git commit -F file` 로 전달.
#   (b) 이전 컨테이너 시도로 .git/index 에 stale 항목이 박혀
#       의도치 않은 파일까지 staged 되던 문제
#       → 먼저 `git reset` 으로 staging 을 깨끗이 비우고 다시 add.
#
# 실행:
#   PowerShell> & 'C:\Users\Admin\Desktop\project\drone_racing_game\scripts\commit-and-push.ps1'
# (정책 막힐 경우:
#   PowerShell> Set-ExecutionPolicy -Scope Process Bypass -Force; & '...\commit-and-push.ps1')
# ---------------------------------------------------------------

$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\Admin\Desktop\project\drone_racing_game"
Set-Location $repoRoot

# 1. stale lock 제거
$lock = Join-Path $repoRoot ".git\index.lock"
if (Test-Path $lock) {
    Write-Host "[1/7] removing stale lock"
    Remove-Item -Force $lock
} else {
    Write-Host "[1/7] no stale lock"
}

# 2. index.html 을 최신 gen-html.js 결과로 재생성 (모바일 UI 마크업 변경 반영)
Write-Host "[2/7] regenerating index.html from gen-html.js"
Push-Location (Join-Path $repoRoot "songjeonrider")
node scripts/gen-html.js
Pop-Location

# 3. 이전 잘못된 staging 풀기 (working tree 는 그대로 둠)
Write-Host "[3/7] git reset (clearing previous staging)"
git reset --mixed HEAD | Out-Null

# 4. 의도된 파일들 staging
#    - 코드 변경 6개 + 배포 스크립트 자체(scripts/commit-and-push.ps1)
Write-Host "[4/7] git add (intentional files only)"
git add `
    "songjeonrider/index.html" `
    "songjeonrider/package.json" `
    "songjeonrider/scripts/gen-html.js" `
    "songjeonrider/src/main.ts" `
    "songjeonrider/src/style.css" `
    "songjeonrider/src/world.ts" `
    "scripts/commit-and-push.ps1"

# 5. staged 확인
Write-Host "[5/7] staged files:"
git diff --cached --stat

# 6. commit (메시지 파일로 -F 전달)
$msgFile = Join-Path $repoRoot ".git\COMMIT_MSG_TMP.txt"
$msg = @"
Quadcopter model, distributed poles, wider camera, fixed mobile layout

Drone visual
- Single red box replaced with a 9-entity quadcopter: cabin body,
  dark canopy, X-frame arms, 4 motors, 4 semi-transparent props,
  and front (red) / rear (green) navigation LEDs for orientation
  cues at distance.
- Body size scaled down from ~4.6m to ~0.75m (realistic inspection
  drone footprint).
- New dronePartPos() helper converts body-local offsets to ENU
  world positions every frame so parts follow heading rotation.

Camera
- Chase camera distance: 8m -> 18m back (24m on boost).
- Vertical offset: 3.5m -> 6.5m up.
- lookForward distance: 3m -> 12m so the camera looks further ahead.
- Result: drone no longer fills the screen; flight feels spacious.

Pole distribution (inspection course)
- Old: 8 poles in a single row east of KEPCO HQ.
- New: ~70 poles auto-placed along the road edges
  (main east-west + north-south + one east sub-road), 30m spacing,
  with a clearance zone around the HQ building. Implemented in
  src/world.ts addPolesAlongRoads().
- Forms a natural inspection-flight course threading the city.

Mobile UI layout
- Old: alt-stack (UP/DOWN) on the left side of the action cluster,
  which physically overlapped with the joystick zone on narrow
  phones (<=380px). Right thumb area also felt cramped.
- New: action cluster is a vertical stack -> top row = UP/DOWN
  horizontal, bottom row = DRIFT/BOOST horizontal. All consolidated
  on the right side, joystick alone on the left.
- Sizes trimmed (joystick 150 -> 130, big buttons 96 -> 84, alt
  buttons 56 -> 50) so even on a 360px screen both clusters fit
  with margin.
- alt-stack uses align-self: stretch to auto-match action-row width.
"@
Set-Content -Path $msgFile -Value $msg -Encoding utf8

Write-Host "[6/7] git commit"
git commit -F $msgFile
Remove-Item -Force $msgFile

# 7. push
Write-Host "[7/7] git push origin main"
git push origin main

Write-Host ""
Write-Host "DONE."
