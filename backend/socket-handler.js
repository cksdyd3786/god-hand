// backend/socket-handler.js

module.exports = (io, pool) => {
  io.on('connection', (socket) => {
    console.log(`🔌 기기가 연결되었습니다. ID: ${socket.id}`);

    socket.on('gesture', async (data) => {
      if (!data || !data.gesture) return;

      // [특수 처리] MOUSE_MOVE 제스처는 DB 매핑을 생략하고 좌표와 함께 즉시 에이전트로 전송합니다.
      // 실시간 마우스 트래킹은 초당 수십 번 발생하므로 DB 조회를 생략해야 성능이 저하되지 않습니다.
      if (data.gesture === 'MOUSE_MOVE') {
        io.emit('command', { 
          action: 'MOUSE_MOVE', 
          x: data.x, 
          y: data.y 
        });
        return;
      }

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
            
            // 에이전트로 전송
            io.emit('command', { action: matchedAction });
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