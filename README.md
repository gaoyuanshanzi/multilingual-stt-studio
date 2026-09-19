# AI 다국어 음성인식 (STT) & 타임스탬프 분석 플랫폼

대용량 오디오(MP3, M4A 등 150MB 이상)를 업로드받아 다국어(한국어, 영어, 스페인어, 중국어, 일본어, 포르투갈어 등)를 구간별로 자동 구분하여 STT를 수행하고, 타임스탬프와 함께 시각화 및 오디오 동기화 재생, Neon PostgreSQL DB 관리를 지원하는 모던 화이트 모드 풀스택 애플리케이션입니다.

---

## 🌟 주요 기능 및 특징

1. **관리자 인증 시스템 (White Mode UI)**
   - 관리자 ID: `admin` / 비밀번호: `123jesus`
   - 깔끔하고 세련된 화이트 모드(Whitemode) 기반 대시보드

2. **화면 3대 영역 레이아웃 (첨부 레이아웃 충실 구현)**
   - **좌측 사이드바: `DB File directory`**
     - Neon PostgreSQL 클라우드 DB에 영구 저장된 STT 작업 목록 실시간 조회 및 검색
     - 파일별 재생 시간, 인식된 다국어 배지, 생성 일시 표시
     - **'다른 이름으로 저장'**: 텍스트(.txt) 또는 컬러 HTML 웹문서(.html) 다운로드
     - **'DB에서 완전 삭제'**: 확인 팝업 후 안전 삭제
   - **우측 상단 메인: `text` 공간**
     - 오디오 파일 드래그 앤 드롭 및 파일 선택 (MP3, M4A, WAV 등 대용량 지원)
     - **'작동' (STT 변환 시작) 버튼**
     - 실시간 진행 상태 게이지 (1MB 청크 업로드 -> VAD 분석 -> 구간별 다국어 인식 %)
     - 구간별 타임스탬프(`[00:12 -> 00:18]`) 및 언어별 고유 컬러 배지:
       * 🇰🇷 한국어 (`ko`): 파란색 배지
       * 🇺🇸 영어 (`en`): 초록색 배지
       * 🇪🇸 스페인어 (`es`): 주황색 배지
       * 🇨🇳 중국어 (`zh`): 빨간색 배지
       * 🇯🇵 일본어 (`ja`): 보라색 배지
       * 🇵🇹 포르투갈어 (`pt`): 분홍색 배지
       * 기타/미지정: 회색 배지
     - 타임스탬프 클릭 시 하단 플레이어 탐색 및 즉시 오디오 재생 연동
     - 언어별 필터링 드롭다운/버튼 및 전체 텍스트 클립보드 복사
     - 변환 완료 후 **'저장' 버튼**:
       * 저장 대상: `[DB에 저장]` / `[Local download에 저장]` / `[둘 다 저장]`
       * 파일 포맷: `[텍스트(.txt)]` / `[HTML(.html)]`
   - **하단 고정 바: `Audio file play progress`**
     - 오디오 재생/일시정지 (작동 버튼)
     - 오디오 탐색 슬라이더 (Seeking) 및 시간 표시 (`00:00 / 00:00`)
     - 10초 앞/뒤 건너뛰기 및 볼륨/음소거 조절
     - 재생 시점에 맞춰 우측 `text` 영역의 해당 세그먼트 자동 하이라이트 동기화

3. **백엔드 & 고성능 AI 엔진 (100% 무료 로컬 오픈소스)**
   - **FastAPI**: 1MB 단위 청크 스트리밍으로 150MB+ 대용량 오디오도 메모리 부담 없이 안정적으로 수신
   - **비동기 백그라운드 태스크**: 긴 오디오 처리 시 타임아웃 방지, `task_id` 발행 및 폴링
   - **faster-whisper**: `small` 모델, `int8` 양자화 연산 (CPU/CUDA 자동 감지)
   - **VAD 필터 (`vad_filter=True`)**: 무음 및 배경 소음 제거로 다국어 감지 정확도 극대화
   - **구간별 자동 언어 감지 (`language=None`)**: 다국어가 교차하는 오디오 자동 분류
   - **Neon PostgreSQL**: 연결 문자열 내장 및 자동 스키마 마이그레이션

---

## 🛠 실행 방법 (Local Run Guide)

### 1. 사전 요구사항 (Prerequisites)
- Python 3.9 이상
- Node.js 18 이상
- (선택) FFmpeg 설치 (시스템 PATH에 등록 권장):
  ```bash
  # Windows winget 사용 시
  winget install Gyan.FFmpeg
  ```

### 2. 백엔드 가동 (FastAPI)
```bash
# 루트 디렉토리에서 가상환경 활성화
.\venv\Scripts\activate

# 패키지 설치 (이미 완료된 경우 생략 가능)
pip install -r backend/requirements.txt

# FastAPI 서버 가동
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- 서버 주소: `http://127.0.0.1:8000`
- API 문서 (Swagger): `http://127.0.0.1:8000/docs`

### 3. 프론트엔드 가동 (React + Vite)
```bash
cd frontend

# 의존성 설치 (이미 완료된 경우 생략 가능)
npm install

# 개발 서버 가동
npm run dev
```
- 프론트엔드 주소: `http://localhost:3000`

---

## 🚀 GitHub 및 Vercel 배포 가이드

### GitHub 리포지토리
- 계정: `gaoyuanshanzi@gmail.com`
- 리포지토리 원격 연동 완료

### Vercel 배포
- Vercel 계정: `gaoyuanshanzi@gmail.com`
- 프론트엔드 디렉토리(`frontend/`)에서 Vercel 빌드 및 배포가 구성되어 있습니다.
- 백엔드 AI 모델(faster-whisper, PyTorch/ONNX, ffmpeg)은 고성능 로컬 머신 또는 전용 GPU 인스턴스에서 구동되며, Vercel 프론트엔드 배포본은 백엔드 엔드포인트를 환경변수로 유연하게 바라봅니다.
