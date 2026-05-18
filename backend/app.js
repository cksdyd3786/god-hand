// backend/app.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
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

// CORS 설정 (프런트엔드 연동 대비)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 파일명 오타 주의! 반드시 경로가 정확해야 합니다.
// 아까 에러가 났던 부분이니 파일 이름을 socket-handler.js로 통일하세요.
const socketHandler = require('./socket-handler');

// 소켓 핸들러 실행
socketHandler(io);

const PORT = process.env.PORT || 3000;

// backend/app.js 수정
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>God Hand Backend Server is Running!</h1>
        <button onclick="sendGesture()">오른쪽 이동 신호 보내기</button>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();
          function sendGesture() {
            socket.emit('gesture', { gesture: 'SWIPE_RIGHT' });
            console.log('서버에 제스처를 보냈습니다!');
          }
        </script>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 작동 중입니다.`);
});