import cv2
from camera import CameraManager
from tracker import HandTracker
from controller import MouseController

def main():
    print("시스템 가동 (모듈화 아키텍처 적용)")
    SHOW_DEBUG_WINDOW = True

    # 모듈 초기화
    cam = CameraManager()
    tracker = HandTracker()
    controller = MouseController()

    cam.start()

    try:
        while True:
            frame = cam.get_frame()
            if frame is not None:
                frame = cv2.flip(frame, 1)
                results = tracker.process(frame)

                if results.multi_hand_landmarks:
                    for hand_landmarks in results.multi_hand_landmarks:
                        if SHOW_DEBUG_WINDOW:
                            tracker.draw(frame, hand_landmarks)
                        
                        # 제어 로직 호출
                        controller.process_landmarks(frame, hand_landmarks, SHOW_DEBUG_WINDOW)
                else:
                    controller.reset_state()

                if SHOW_DEBUG_WINDOW:
                    cv2.imshow('AI Mouse Architecture', frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
    finally:
        # 리소스 안전 해제
        controller.reset_state()
        cam.stop()
        cv2.destroyAllWindows()

if __name__ == '__main__':
    main()