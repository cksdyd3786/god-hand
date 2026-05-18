import math
import numpy as np
import pyautogui
import time
from pynput.mouse import Controller, Button
import cv2

class MouseController:
    def __init__(self, smoothing_factor=2, drag_delay=0.25, double_click_threshold=0.3):
        self.mouse = Controller()
        self.screen_w, self.screen_h = pyautogui.size()
        
        # 설정 파라미터
        self.smoothing_factor = smoothing_factor
        self.drag_delay = drag_delay
        self.double_click_threshold = double_click_threshold
        self.frame_margin = 100

        # 내부 상태(State) 변수
        self.prev_x, self.prev_y = 0, 0
        self.is_pinching = False
        self.drag_mode = False
        self.pinch_start_time = 0
        self.locked_x, self.locked_y = 0, 0
        
        self.is_right_pinching = False
        self.locked_right_x, self.locked_right_y = 0, 0
        self.last_click_time = 0

    def process_landmarks(self, frame, hand_landmarks, show_debug):
        h, w, _ = frame.shape
        
        if show_debug:
            cv2.rectangle(frame, (self.frame_margin, self.frame_margin), 
                         (w - self.frame_margin, h - self.frame_margin), (255, 0, 255), 2)

        # 랜드마크 매핑
        wrist = hand_landmarks.landmark[0]
        index_mcp = hand_landmarks.landmark[5]
        thumb_tip = hand_landmarks.landmark[4]
        index_tip = hand_landmarks.landmark[8]
        middle_tip = hand_landmarks.landmark[12]

        # 픽셀 좌표 변환
        wrist_x, wrist_y = int(wrist.x * w), int(wrist.y * h)
        mcp_x, mcp_y = int(index_mcp.x * w), int(index_mcp.y * h)
        thumb_x, thumb_y = int(thumb_tip.x * w), int(thumb_tip.y * h)
        index_x, index_y = int(index_tip.x * w), int(index_tip.y * h)
        middle_x, middle_y = int(middle_tip.x * w), int(middle_tip.y * h)

        center_x = (thumb_x + index_x) // 2
        center_y = (thumb_y + index_y) // 2

        # 동적 임계값 및 거리 연산
        hand_size = math.hypot(mcp_x - wrist_x, mcp_y - wrist_y)
        dynamic_click_threshold = hand_size * 0.25
        index_pinch_dist = math.hypot(index_x - thumb_x, index_y - thumb_y)
        middle_pinch_dist = math.hypot(middle_x - thumb_x, middle_y - thumb_y)

        # 데드존 및 동적 스무딩 적용 구간
        # 1. 화면 비율에 맞춰 좌표 반환
        screen_x = np.interp(center_x, (self.frame_margin, w - self.frame_margin), (0, self.screen_w))
        screen_y = np.interp(center_y, (self.frame_margin, h - self.frame_margin), (0, self.screen_h))

        # 2. 직전 위치와 현재 위치의 '이동 거리(픽셀)' 을 계산
        move_distance = math.hypot(screen_x - self.prev_x, screen_y - self.prev_y)

        # 3. 데드존 : 이동 거리가 3픽셀 미만이면 안 움직인 것으로 간주 (떨림 무시)
        deadzone_threshold = 3.0 # [튜닝 포인트] 떨림이 심하면 5.0 정도로 조정
        if move_distance < deadzone_threshold:
            screen_x = self.prev_x
            screen_y = self.prev_y
            move_distance = 0 # 데드존에 걸렸으므로 이동 거리 0으로 초기화

        # 4. 동적 스무딩
        if move_distance < 20:
            # 멈춰있거나 미세 조정 중: 묵직하게 잡아줌
            dynamic_smooth = 5.0
        else:
            # 빠르게 움직일 때: 보정을 줄여 지연 없이 따라오게 함
            dynamic_smooth = 1.5

        # 최종 목표 좌표 계산
        target_x = self.prev_x + (screen_x - self.prev_x) / dynamic_smooth
        target_y = self.prev_y + (screen_y - self.prev_y) / dynamic_smooth

        # # 목표 좌표 및 스무딩 연산
        # screen_x = np.interp(center_x, (self.frame_margin, w - self.frame_margin), (0, self.screen_w))
        # screen_y = np.interp(center_y, (self.frame_margin, h - self.frame_margin), (0, self.screen_h))
        # target_x = self.prev_x + (screen_x - self.prev_x) / self.smoothing_factor
        # target_y = self.prev_y + (screen_y - self.prev_y) / self.smoothing_factor

        self._handle_left_click(frame, center_x, center_y, index_pinch_dist, dynamic_click_threshold, target_x, target_y, show_debug)
        self._handle_right_click(frame, thumb_x, thumb_y, middle_x, middle_y, middle_pinch_dist, dynamic_click_threshold, show_debug)

        # 최종 커서 적용
        self.mouse.position = (self.curr_x, self.curr_y)
        self.prev_x, self.prev_y = self.curr_x, self.curr_y

    def _handle_left_click(self, frame, center_x, center_y, index_pinch_dist, threshold, target_x, target_y, show_debug):
        if index_pinch_dist < threshold:
            if show_debug: cv2.circle(frame, (center_x, center_y), 15, (0, 255, 0), cv2.FILLED)
            
            if not self.is_pinching:
                self.is_pinching = True
                self.pinch_start_time = time.time()
                self.locked_x, self.locked_y = self.prev_x, self.prev_y
            else:
                if not self.drag_mode and (time.time() - self.pinch_start_time) >= self.drag_delay:
                    self.drag_mode = True
                    self.mouse.position = (self.locked_x, self.locked_y)
                    self.mouse.press(Button.left)
                    print("시스템 상태: 드래그 모드 활성화")

            self.curr_x, self.curr_y = (target_x, target_y) if self.drag_mode else (self.locked_x, self.locked_y)
        else:
            if show_debug: cv2.circle(frame, (center_x, center_y), 10, (0, 0, 255), cv2.FILLED)
            
            if self.is_pinching:
                if self.drag_mode:
                    self.mouse.release(Button.left)
                    print("시스템 상태: 드래그 해제")
                else:
                    self.mouse.position = (self.locked_x, self.locked_y)
                    current_time = time.time()
                    if current_time - self.last_click_time < self.double_click_threshold:
                        self.mouse.click(Button.left, 2)
                        print("이벤트 발생: 좌측 더블 클릭")
                        self.last_click_time = 0
                    else:
                        self.mouse.click(Button.left, 1)
                        print("이벤트 발생: 좌측 단발 클릭")
                        self.last_click_time = current_time
                
                self.is_pinching = False
                self.drag_mode = False

            self.curr_x, self.curr_y = target_x, target_y

    def _handle_right_click(self, frame, thumb_x, thumb_y, middle_x, middle_y, middle_pinch_dist, threshold, show_debug):
        if middle_pinch_dist < threshold and not self.is_pinching:
            if show_debug:
                cv2.line(frame, (thumb_x, thumb_y), (middle_x, middle_y), (255, 0, 0), 3)
                cv2.circle(frame, (middle_x, middle_y), 15, (255, 0, 0), cv2.FILLED)
            
            if not self.is_right_pinching:
                self.is_right_pinching = True
                self.locked_right_x, self.locked_right_y = self.prev_x, self.prev_y
                self.mouse.position = (self.locked_right_x, self.locked_right_y)
                self.mouse.click(Button.right, 1)
                print("이벤트 발생: 우측 단발 클릭")
            
            self.curr_x, self.curr_y = self.locked_right_x, self.locked_right_y
        else:
            self.is_right_pinching = False

    def reset_state(self):
        """인식 범위 이탈 시 상태 초기화"""
        if self.is_pinching and self.drag_mode:
            self.mouse.release(Button.left)
            print("시스템 상태: 화면 이탈에 따른 드래그 강제 해제")
        self.is_pinching = False
        self.drag_mode = False
        self.is_right_pinching = False