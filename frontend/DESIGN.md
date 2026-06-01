# God Hand Control Center Design

## 방향

God Hand Control Center는 Windows용 Tauri 데스크톱 앱 UI다. 웹 대시보드처럼 보이는 화면이 아니라, 카메라 입력과 손 인식, 마우스 제어를 한 화면에서 바로 확인하고 조작하는 데스크톱 컨트롤 센터를 목표로 한다.

프론트 UI는 React + TypeScript로 작성하고, 실제 손 인식은 MediaPipe WASM이 처리한다. Windows 마우스 제어는 프론트에서 직접 하지 않고 Tauri IPC를 통해 Rust 명령으로 위임한다.

## 기술 구조

```text
ai_mouse_tauri/
└─ src-tauri/
   └─ Rust Tauri desktop shell
      - screen_size
      - move_mouse
      - click_mouse
      - set_drag

frontend/
└─ React + TypeScript + Vite UI
   - Camera preview
   - MediaPipe WASM HandLandmarker
   - Gesture state
   - Calibration state
   - Tauri IPC client
```

## 화면 원칙

- 첫 화면은 실제 사용 가능한 컨트롤 센터여야 한다.
- 마케팅 랜딩 페이지, 웹 관리자 대시보드, 장식용 통계 화면처럼 만들지 않는다.
- 가짜 수치나 연결되지 않은 confidence, CPU, latency 값은 표시하지 않는다.
- 실제로 측정하거나 연결된 상태만 보여준다.
- 아직 연결되지 않은 기능은 “연결 예정”으로 방치하지 말고, 가능한 범위에서 동작하는 최소 기능을 구현한다.

## 레이아웃 규칙

- 상단: 앱 이름, 현재 실행 설명, 카메라/마우스 주요 액션.
- 메인: 실제 카메라 프리뷰와 손 랜드마크 오버레이.
- 보조 패널: 카메라 상태, 제스처 인식, 마우스 제어, 캘리브레이션, 활동 로그, 시스템 상태, 설정.
- 카드 반경은 `8px` 기준으로 유지한다.
- 사이드바 중심의 웹 대시보드 구조는 사용하지 않는다.
- 데스크톱 창 크기 변경에 대응하되, 모바일 웹을 우선하지 않는다.

## 시각 규칙

- Background: `#f5f5f7`
- Text: `#1d1d1f`
- Accent: Apple blue `#007aff`
- Success: `#34c759`
- Warning: `#ff9500`
- Error: `#ff3b30`
- 표면 깊이는 얕은 shadow와 blur만 사용한다.
- 보라색 그라디언트, 어두운 SF 스타일, 과한 hero 영역은 피한다.

## 필수 기능

- God Hand Control Center
- 실제 카메라 프리뷰
- MediaPipe WASM 손 랜드마크 감지
- 손 랜드마크 캔버스 오버레이
- 제스처 상태 표시
- Tauri IPC 연결 상태 표시
- Rust 기반 Windows 마우스 이동
- 핀치 제스처 기반 클릭
- 캘리브레이션 샘플 수집
- 활동 로그
- 시스템 상태
- 설정 패널

## 제스처 규칙

- 손 없음: 감지된 손이 없을 때 표시한다.
- 포인터 이동: 검지가 펴져 있고 핀치가 아닐 때 표시한다.
- 손바닥 이동: 여러 손가락이 펴져 있을 때 표시한다.
- 핀치 클릭: 엄지와 검지 거리가 임계값보다 작을 때 표시하고 왼쪽 클릭을 발생시킨다.

## 마우스 제어 규칙

- 마우스 제어는 기본적으로 꺼져 있어야 한다.
- 사용자가 “마우스 제어 켜기”를 눌렀을 때만 Rust IPC로 커서 이동과 클릭을 보낸다.
- 프론트는 OS 마우스를 직접 제어하지 않는다.
- 커서 이동은 `move_mouse` Tauri command를 사용한다.
- 클릭은 `click_mouse` Tauri command를 사용한다.
- 드래그 확장은 `set_drag` Tauri command를 사용한다.

## 통합 경계

프론트의 역할:

- 카메라 스트림 획득
- MediaPipe WASM 모델 로딩
- 손 랜드마크 처리
- 제스처 상태 계산
- 캘리브레이션 범위 수집
- Tauri command 호출

Rust/Tauri의 역할:

- Windows 데스크톱 창 제공
- 화면 크기 조회
- OS 마우스 이동
- OS 마우스 클릭
- 향후 드래그 및 네이티브 설정 저장

## 금지 사항

- Node/Express/Socket.IO 백엔드를 새로 만들지 않는다.
- `backend/frontend/camera` 구조로 되돌리지 않는다.
- 프론트 UI를 웹사이트나 웹 대시보드처럼 설계하지 않는다.
- 연결되지 않은 장식용 데이터를 표시하지 않는다.
- React 컴포넌트 내부에 Rust 구현 세부사항을 섞지 않는다.
