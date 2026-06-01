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
// app.js (테스트 UI 페이지 라우터 부분)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>God Hand 제어 센터 (테스트 리모컨)</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        body { font-family: sans-serif; padding: 20px; text-align: center; }
        button { padding: 15px 25px; margin: 10px; font-size: 16px; cursor: pointer; border-radius: 8px; border: none; background-color: #007bff; color: white; }
        button:hover { background-color: #0056b3; }
        .move-btn { background-color: #28a745; }
      </style>
    </head>
    <body>
      <h1>🛠️ God Hand 테스트 리모컨</h1>
      <p>버튼을 누르면 프론트엔드 앱을 대신해서 소켓 신호를 쏩니다.</p>

      <button onclick="sendGesture('FIST')">✊ 주먹 (좌클릭)</button>
      <button onclick="sendGesture('VICTORY')">✌️ 브이 (우클릭)</button>
      <button onclick="sendGesture('PINCH')">🤏 꼬집기 (드래그 시작)</button>
      <button onclick="sendGesture('OPEN_PALM')">✋ 손바닥 (드래그 종료)</button>
      
      <br><hr><br>
      
      <button class="move-btn" onclick="sendMove(500, 500)">➡️ 마우스 (500, 500) 위치로 이동</button>

      <script>
        const socket = io(); // 현재 접속한 주소(localhost:3000)로 자동 연결

        socket.on('connect', () => {
          console.log('테스트 리모컨이 서버에 연결되었습니다!');
        });

        // 클릭, 드래그 등 DB를 거치는 제스처 신호 쏘기
        function sendGesture(gestureName) {
          console.log('발송 -> 제스처:', gestureName);
          socket.emit('gesture', { gesture: gestureName });
        }

        // 실시간 좌표 이동 신호 쏘기
        function sendMove(xPos, yPos) {
          console.log('발송 -> 마우스 이동:', xPos, yPos);
          socket.emit('gesture', { action: 'MOVE', x: xPos, y: yPos });
        }
      </script>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 작동 중입니다.`);
});