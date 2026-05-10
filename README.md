# 실시간 수화 번역 프로젝트 (Sign-Sync)
## 폴더 구조
/frontend: 프런트엔드 소스 코드 (React 등)

/backend: Node.js 서버 (실시간 데이터 중계)

/ai: 수화 인식 모델 및 파이썬 추론 서버

## 데이터 흐름 (예정)
프런트엔드: 웹캠 영상을 WebSocket으로 백엔드에 전송

백엔드(Node.js): 받은 데이터를 AI 서버(Python)로 전달

AI 서버: 번역 결과를 백엔드로 반환

백엔드: 최종 텍스트를 프런트엔드 실시간 전송

## 백엔드 시작하기 (팀원 필독)
cd backend (백엔드 폴더로 이동)

npm install (필수 부품 설치)

node main.js (서버 실행)
