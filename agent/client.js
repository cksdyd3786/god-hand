// client.js
const io = require('socket.io-client');
const robot = require('robotjs');

const socket = io('http://localhost:3000');
robot.setMouseDelay(2); // 반응 속도 최적화

socket.on('connect', () => {
  console.log('✅ OS 제어 에이전트가 서버에 연결되었습니다!');
});

socket.on('command', (data) => {
  if (!data || !data.action) return;

  console.log('📥 서버로부터 받은 명령:', data);
  const currentPos = robot.getMousePos();

  switch (data.action) {
    case 'MOUSE_MOVE':
      // 0.0 ~ 1.0 비율 좌표를 해상도 픽셀(1920x1080)로 정밀 변환
      if (data.x !== undefined && data.y !== undefined) {
        const targetX = Math.floor(data.x * 1920);
        const targetY = Math.floor(data.y * 1080);
        robot.moveMouse(targetX, targetY);
      }
      break;

    case 'MOVE_RIGHT':
      robot.moveMouse(currentPos.x + 150, currentPos.y);
      console.log('👉 우측 이동 (+150px)');
      break;

    case 'MOVE_LEFT':
      robot.moveMouse(currentPos.x - 150, currentPos.y);
      console.log('👈 좌측 이동 (-150px)');
      break;

    case 'MOVE_UP':
      // 🚨 추가됨: 위쪽 이동은 Y축 값을 차감합니다.
      robot.moveMouse(currentPos.x, currentPos.y - 150);
      console.log('☝️ 위로 이동 (-150px)');
      break;

    case 'MOVE_DOWN':
      // 🚨 추가됨: 아래쪽 이동은 Y축 값을 증가시킵니다.
      robot.moveMouse(currentPos.x, currentPos.y + 150);
      console.log('👇 아래로 이동 (+150px)');
      break;

    case 'CLICK':
      robot.mouseClick();
      console.log('🖱️ 마우스 클릭 수행');
      break;

    case 'START_TRACKING':
      console.log('🎯 트래킹 시작 신호 감지');
      break;

    default:
      console.log('⚠️ 지원하지 않는 액션 명령입니다:', data.action);
  }
});

socket.on('disconnect', () => {
  console.log('❌ 서버와 연결이 끊어졌습니다.');
});