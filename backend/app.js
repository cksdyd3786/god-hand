// backend/app.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// PostgreSQL 연결 설정
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// DB 연결 테스트
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ DB 연결 실패:', err.stack);
  }
  console.log('🐘 PostgreSQL 데이터베이스 연결 성공!');
  release();
});

// CORS 설정
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const socketHandler = require('./socket-handler');
socketHandler(io, pool);

const PORT = process.env.PORT || 3000;

// 웹 테스트 UI 페이지
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>God Hand 제어 센터</title>
        <style>
          body { font-family: sans-serif; padding: 20px; text-align: center; }
          button { padding: 10px 20px; margin: 5px; font-size: 16px; cursor: pointer; }
          #trackpad { width: 400px; height: 250px; border: 2px dashed #ccc; margin: 20px auto; display: flex; align-items: center; justify-content: center; user-select: none; }
        </style>
      </head>
      <body>
        <h1> God Hand 컨트롤러 테스트 패널</h1>
        
        <h3>1. 개별 제스처 신호 보내기 (DB 매핑 테스트)</h3>
        <button onclick="sendGesture('SWIPE_UP')">⬆️ 위로 이동 (SWIPE_UP)</button><br>
        <button onclick="sendGesture('SWIPE_LEFT')">⬅️ 왼쪽 이동 (SWIPE_LEFT)</button>
        <button onclick="sendGesture('FOLD_HAND')">🖱️ 클릭 (FOLD_HAND)</button>
        <button onclick="sendGesture('SWIPE_RIGHT')">➡️ 오른쪽 이동 (SWIPE_RIGHT)</button><br>
        <button onclick="sendGesture('SWIPE_DOWN')">⬇️ 아래로 이동 (SWIPE_DOWN)</button>
        
        <h3>2. 마우스 절대 좌표 트래킹 (0.0 ~ 1.0 비율 전송)</h3>
        <div id="trackpad">여기 위에서 마우스를 움직여보세요 (실시간 좌표 전송)</div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();

          // 버튼 클릭 시 일반 제스처 전송
          function sendGesture(gestureName) {
            socket.emit('gesture', { gesture: gestureName });
            console.log('서버로 제스처 전송:', gestureName);
          }

          // 트랙패드 영역 마우스 움직임 감지
          const trackpad = document.getElementById('trackpad');
          trackpad.addEventListener('mousemove', (e) => {
            const rect = trackpad.getBoundingClientRect();
            // 패드 안에서의 가로, 세로 비율 계산 (0.0 ~ 1.0)
            const xRatio = (e.clientX - rect.left) / rect.width;
            const yRatio = (e.clientY - rect.top) / rect.height;

            // 좌표 이동은 매핑을 거치지 않고 직접 통신 규격을 맞추어 쏩니다.
            socket.emit('gesture', { 
              gesture: 'MOUSE_MOVE', 
              x: parseFloat(xRatio.toFixed(4)), 
              y: parseFloat(yRatio.toFixed(4)) 
            });
          });
        </script>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 작동 중입니다.`);
});