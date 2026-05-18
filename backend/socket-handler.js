// backend/socket-handler.js
const { Pool } = require('pg');

// app.js에서 설정한 환경변수를 그대로 사용하기 위해 pool 생성
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 기기가 연결되었습니다. ID: ${socket.id}`);

    // 프런트엔드나 웹캠 프로그램에서 제스처 신호를 보냈을 때
    socket.on('gesture', async (data) => {
      console.log(`📥 받은 제스처 이름: ${data.gesture}`); // 'SWIPE_RIGHT'

      try {
        const queryText = 'SELECT action_command FROM gesture_mappings WHERE gesture_name = $1';
        const values = [data.gesture];
        
        const res = await pool.query(queryText, values);

        if (res.rows && res.rows.length > 0) {
          const row = res.rows;
          
          // 🚨 [긴급 수술] 대소문자 어떤 컬럼명이든 안전하게 'MOVE_RIGHT'를 찾아내는 로직
          let matchedAction = row.action_command || row.ACTION_COMMAND || row[Object.keys(row)];
          if (typeof matchedAction === 'object' && matchedAction !== null) {
            // 객체라면 그 안에 들어있는 첫 번째 벨류값('MOVE_RIGHT')을 직렬화해서 가져옵니다.
            matchedAction = matchedAction.action_command || matchedAction.ACTION_COMMAND || Object.values(matchedAction);
          }
          
          console.log(`🔍 DB 매핑 결과 발견: ${data.gesture} ➡️ ${matchedAction}`);

          // 에이전트(client.js)로 정확하게 쏘기
          io.emit('command', { action: matchedAction });
        } else {
          console.log(`⚠️ DB에 [${data.gesture}]에 대한 매핑 명령이 없습니다.`);
        }
      } catch (err) {
        console.error('❌ DB 조회 중 에러 발생:', err.stack);
      }
    });
    socket.on('disconnect', () => {
      console.log(`❌ 기기 연결 해제. ID: ${socket.id}`);
    });
  });
};