const { io } = require('socket.io-client');
const robot = require('robotjs');

// 백엔드 서버 주소로 연결 (연동 테스트 시 백엔드 IP 주소로 변경)
const socket = io('http://localhost:3000'); 

// 마우스 반응 속도 최적화 (딜레이 없음)
robot.setMouseDelay(0);

socket.on('connect', () => {
  console.log('🚀 마우스 제어 에이전트가 백엔드 서버에 연결되었습니다!');
});

// 백엔드가 전달해준 최종 명령 수신
socket.on('agent_action', (data) => {
  const action = data.action;

  switch (action) {
    // 1. 실시간 마우스 포인터 좌표 이동
    case 'MOVE':
      if (data.x !== undefined && data.y !== undefined) {
        robot.moveMouse(data.x, data.y);
        console.log(`📍 마우스 이동 좌표 수신 -> X: ${data.x}, Y: ${data.y}`);
      }
      break;

    // 2. 찬용님 DB 데이터(action_command)와 100% 일치하는 스위치문
    case 'LEFT_CLICK':
      robot.mouseClick('left');
      console.log('🖱️ 좌클릭(LEFT_CLICK) 실행');
      break;

    case 'RIGHT_CLICK':
      robot.mouseClick('right');
      console.log('🖱️ 우클릭(RIGHT_CLICK) 실행');
      break;

    case 'DRAG_START':
      robot.mouseToggle('down', 'left');
      console.log('✋ 드래그 시작(DRAG_START)');
      break;

    case 'DRAG_END':
      robot.mouseToggle('up', 'left');
      console.log('🤚 드래그 종료(DRAG_END)');
      break;

    default:
      console.log('❓ 정의되지 않은 액션 신호 수신:', action);
  }
});

socket.on('disconnect', () => {
  console.log('❌ 서버와의 연결이 끊어졌습니다.');
});