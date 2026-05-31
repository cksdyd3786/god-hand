# God Hand 프론트엔드

`backend`와 `camera` 폴더를 수정하지 않고 God Hand의 Socket.IO 백엔드를 테스트하고 상태를 확인하는 React + Vite 프론트엔드입니다.

## 실행 방법

```powershell
cd frontend
npm install
npm run dev
```

Socket.IO 백엔드 주소는 `.env`에서 읽습니다.

```env
VITE_SOCKET_URL=http://localhost:3000
```

## 백엔드 통신 방식

- 프론트엔드는 `socket.io-client`로 `VITE_SOCKET_URL`에 연결합니다.
- 제스처 버튼은 `SWIPE_UP`, `SWIPE_DOWN`, `SWIPE_LEFT`, `SWIPE_RIGHT`, `FOLD_HAND` 같은 `gesture` 이벤트를 보냅니다.
- 가상 트랙패드는 아래 형식으로 마우스 이동 좌표를 보냅니다.

```js
socket.emit("gesture", {
  gesture: "MOUSE_MOVE",
  x: 0.5,
  y: 0.5
});
```

- 백엔드가 보내는 `command` 이벤트는 실시간 활동 로그와 상태 패널에 표시됩니다.

## 카메라 제스처 기능 위치

- 실제 손 인식은 `camera` 폴더의 파이썬 모듈에서 담당합니다.
- 컴퓨터 조작 명령 변환은 `backend` 폴더의 Socket.IO 서버와 매핑 로직에서 담당합니다.
- 이 프론트엔드는 카메라/백엔드를 직접 수정하지 않고, 브라우저 카메라와 MediaPipe Tasks Vision으로 손을 추적해 같은 `gesture` 이벤트를 백엔드에 전송합니다.
- 카메라 패널의 `카메라 켜기`를 누르면 손 랜드마크가 표시되고, 손 위치는 `MOUSE_MOVE`, 접힌 손은 `FOLD_HAND`, 큰 손목 이동은 `SWIPE_*` 제스처로 전송됩니다.
