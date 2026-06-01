// backend/socket-handler.js

module.exports = (io, pool) => {
  io.on('connection', (socket) => {
    console.log(`🔌 기기가 연결되었습니다. ID: ${socket.id}`);

    socket.on('gesture', async (data) => {
      if (!data) return;

      // 🎯 [교정 1] 마우스 이동(MOVE) 특수 처리 구역을 맨 위로 격리
      // 프론트(App.tsx)에서 보낸 action: 'MOVE' 신호를 가로챕니다. (gesture 키가 없어도 통과 가능)
      if (data.action === 'MOVE' || data.gesture === 'MOUSE_MOVE') {
        
        // 🎯 [교정 2] 에이전트가 들을 수 있도록 이벤트 채널명을 'agent_action'으로 통일!
        io.emit('agent_action', { 
          action: 'MOVE', 
          x: data.x, 
          y: data.y 
        });
        return;
      }

      // 🎯 [교정 3] 클릭/드래그 제스처는 기존처럼 gesture 키가 있을 때만 DB를 조회하도록 가드 배치
      if (!data.gesture) return;

      try {
        const queryText = 'SELECT action_command FROM gesture_mappings WHERE gesture_name = $1';
        const values = [data.gesture];
        const res = await pool.query(queryText, values);

        if (res.rows && res.rows.length > 0) {
          const row = res.rows[0];
          console.log('🚨 DB 원본 데이터:', row);
          
          let matchedAction = '';
          if (Array.isArray(row) && row.length > 0) {
            matchedAction = row[0].action_command;
          } else {
            matchedAction = row.action_command;
          }
          
          if (matchedAction) {
            console.log(`🔍 DB 매핑 성공: ${data.gesture} ➡️ ${matchedAction}`);
            
            // 🎯 [교정 4] DB에서 매핑된 제스처 명령도 'agent_action' 채널로 에이전트에게 전송!
            io.emit('agent_action', { action: matchedAction });
          } else {
            console.log(`⚠️ DB 결과는 있으나 action_command 값을 추출하지 못했습니다.`);
          }
        }
      } 
      catch (err) {
        console.error('❌ DB 조회 중 에러 발생:', err.stack);
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ 기기 연결 해제. ID: ${socket.id}`);
    });
  });
};