const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 웹소켓 서버 설정 (CORS 오류 방지)
const io = new Server(server, {
    cors: {
        origin: "*", // 임시로 모든 접근 허용 (나중에 프런트엔드 주소로 변경)
        methods: ["GET", "POST"]
    }
});

// 1. 기본 HTTP 라우터 (서버가 잘 떴는지 웹 브라우저에서 확인용)
app.get('/', (req, res) => {
    res.send('수화 번역 백엔드 서버가 정상 작동 중입니다!');
});

// 2. 웹소켓 이벤트 처리
io.on('connection', (socket) => {
    console.log(`[🟢 연결 성공] 프런트엔드가 접속했습니다! ID: ${socket.id}`);

    // 클라이언트가 연결을 끊었을 때
    socket.on('disconnect', () => {
        console.log(`[🔴 연결 해제] 접속이 끊어졌습니다. ID: ${socket.id}`);
    });
});

// 3. 3000번 포트에서 서버 실행
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다!`);
});