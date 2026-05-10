🤟 실시간 수화 번역 서비스 - Backend
실시간 수화 인식을 통한 웹 기반 번역 서비스의 백엔드 저장소입니다.

🛠 Tech Stack
Runtime: Node.js (v20+)

Framework: Express

Real-time: Socket.io

Language: JavaScript

📂 Project Structure
Plaintext
/backend
  ├── main.js         # 서버 진입점 (Express & Socket.io 설정)
  ├── /routes         # API 엔드포인트 관리 (예정)
  ├── /services       # AI 서버 통신 및 로직 (예정)
  └── package.json    # 의존성 관리
🚀 Getting Started
팀원분들은 아래 순서대로 로컬 환경을 세팅해 주세요.

1. 의존성 설치
node_modules는 포함되어 있지 않으므로, 프로젝트 루트에서 아래 명령어를 실행해 주세요.

Bash
npm install
2. 서버 실행
Bash
node backend/main.js
서버가 실행되면 http://localhost:3000에서 확인 가능합니다.

📡 System Architecture (Draft)
현재 구상 중인 실시간 데이터 흐름입니다. 내일 회의에서 확정할 예정입니다.

Frontend: 웹캠 프레임을 WebSocket(send_frame)으로 전송

Backend: 받은 데이터를 AI 추론 서버(Python)로 중계

AI Server: 분석 결과를 Backend로 반환

Backend: 최종 번역 텍스트를 클라이언트에 전송(receive_translation)

📝 배포 및 시연 계획
개발 단계: ngrok을 활용한 로컬 터널링으로 외부 접속 허용

최종 단계: 클라우드 서버(AWS/NCP 등) 배포 검토 중
