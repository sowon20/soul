# 🎨 Soul UI 설계 명세서

> **Version**: 1.0
> **Last Updated**: 2026-01-19
> **Target**: Phase 9 UI 완성

---

## 📐 전체 레이아웃 구조

```
┌────────────────────────────────────────────────────────────┐
│ [☰] soul        [🔔3] [@sowon] [⚙️]                       │ ← Header (고정, 60px)
├────────────────────────────────────────────────────────────┤
│ ┌────────┐                                                 │
│ │        │                                                 │
│ │ 슬라이딩 │          대화 영역                             │
│ │  메뉴   │      (단일 영속 대화방)                         │
│ │        │                                                 │
│ │ (왼쪽)  │                                      [패널]     │
│ │        │                                      (오른쪽)   │
│ └────────┘                                      (선택)     │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ [📎] [🎤] 메시지를 입력하세요...              [▶]         │ ← Input (고정, 80px)
└────────────────────────────────────────────────────────────┘

* 슬라이딩 메뉴: 왼쪽에서 나타남 (반투명 유리 효과)
* 패널: 오른쪽에서 나타남 (반투명 유리 효과, 선택적)
```

---

## 🎭 테마 시스템 (환경변수 기반)

### 1. 기본 스킨 옵션 (6가지)

#### **Default (샘플 디자인 - 따뜻한 톤)**
```css
--theme-name: 'default';
--background: #e0ded7;           /* 베이지/크림 */
--foreground: #292929;           /* 다크 그레이 */
--card: #615d5d;                 /* 다크 브라운-그레이 */
--card-foreground: #f5f5f5;      /* 밝은 그레이 */
--popover: rgba(250, 250, 250, 0.95);
--popover-foreground: #292929;
--primary: #d4a574;              /* 카푸치노/브라운 */
--primary-hover: #c9996a;        /* primary보다 약간 어두운 톤 */
--primary-foreground: #292929;   /* 다크 텍스트 */
--secondary: #8ea39d;            /* 세이지 그린 */
--secondary-foreground: #ffffff; /* 흰색 */
--muted: #ebe9e4;                /* 밝은 베이지 */
--muted-foreground: #706c6c;     /* 중간 그레이 */
--accent: #c9b8a0;               /* 샌드/베이지 */
--accent-foreground: #292929;
--destructive: #dc6868;          /* 소프트 레드 */
--destructive-foreground: #ffffff;
--border: rgba(97, 93, 93, 0.12); /* 반투명 브라운 */
--input: #f8f7f5;                /* 거의 흰색 베이지 */
--ring: #d4a574;                 /* primary와 동일 */
--text-primary: #292929;
--text-secondary: #706c6c;

/* 사이드바 전용 색상 */
--sidebar: #615d5d;
--sidebar-foreground: #e8e6e2;
--sidebar-primary: #d4a574;
--sidebar-primary-foreground: #292929;
--sidebar-accent: #726e6e;
--sidebar-accent-foreground: #e8e6e2;
--sidebar-border: rgba(0, 0, 0, 0.15);
--sidebar-ring: #d4a574;

/* 차트 색상 */
--chart-1: #d4a574;
--chart-2: #8ea39d;
--chart-3: #c9b8a0;
--chart-4: #b89b7f;
--chart-5: #a8c5bd;
```

#### **Basic**
```css
--theme-name: 'basic';
--primary: #3B82F6;
--primary-hover: #2563EB;
--background: #FFFFFF;
--surface: #F9FAFB;
--text-primary: #111827;
--text-secondary: #6B7280;
```

#### **Dark Mode**
```css
--theme-name: 'dark';
--primary: #fafafa;
--primary-hover: #e5e5e5;
--primary-foreground: #1a1a1a;
--background: #0a0a0a;
--surface: #0a0a0a;
--card: #0a0a0a;
--card-foreground: #fafafa;
--secondary: #262626;
--secondary-foreground: #fafafa;
--muted: #262626;
--muted-foreground: #a3a3a3;
--accent: #262626;
--accent-foreground: #fafafa;
--border: #262626;
--input: #262626;
--ring: #525252;
--text-primary: #fafafa;
--text-secondary: #a3a3a3;
```

#### **Ocean**
```css
--theme-name: 'ocean';
--primary: #06B6D4;
--primary-hover: #0891B2;
--background: #F0F9FF;
--surface: #E0F2FE;
--text-primary: #0C4A6E;
--text-secondary: #075985;
```

#### **Forest**
```css
--theme-name: 'forest';
--primary: #10B981;
--primary-hover: #059669;
--background: #F0FDF4;
--surface: #DCFCE7;
--text-primary: #064E3B;
--text-secondary: #065F46;
```

#### **Sunset**
```css
--theme-name: 'sunset';
--primary: #F59E0B;
--primary-hover: #D97706;
--background: #FFFBEB;
--surface: #FEF3C7;
--text-primary: #78350F;
--text-secondary: #92400E;
```

### 2. 글씨 크기 설정 (5단계)

```css
/* Extra Small */
--font-size-xs: {
  base: 12px;
  message: 13px;
  heading: 18px;
  small: 10px;
}

/* Small */
--font-size-sm: {
  base: 14px;
  message: 15px;
  heading: 20px;
  small: 12px;
}

/* Medium (기본값) */
--font-size-md: {
  base: 16px;
  message: 17px;
  heading: 24px;
  small: 14px;
}

/* Large */
--font-size-lg: {
  base: 18px;
  message: 19px;
  heading: 28px;
  small: 16px;
}

/* Extra Large */
--font-size-xl: {
  base: 20px;
  message: 21px;
  heading: 32px;
  small: 18px;
}
```

### 3. 유리 효과 (Glass Morphism) 설정

```css
/* 슬라이딩 메뉴 & 패널 공통 */
--glass-enabled: true;                    /* 유리 효과 활성화 */
--glass-opacity: 0.85;                    /* 투명도 (0.0 ~ 1.0) */
--glass-blur: 20px;                       /* 블러 강도 (0px ~ 40px) */
--glass-border-opacity: 0.2;              /* 테두리 투명도 */
--glass-shadow: rgba(0, 0, 0, 0.1);       /* 그림자 색상 */

/* 배경 이미지 */
--background-image: url('');              /* 배경 이미지 경로 */
--background-image-opacity: 0.3;          /* 배경 이미지 투명도 */
--background-image-blur: 5px;             /* 배경 이미지 블러 */
--background-image-position: center;      /* 배경 위치 */
--background-image-size: cover;           /* 배경 크기 */

/* 유리 효과 CSS */
.glass-panel {
  background: rgba(255, 255, 255, var(--glass-opacity));
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity));
  box-shadow: 0 8px 32px 0 var(--glass-shadow);
}
```

---

## 🧩 컴포넌트 상세 설계

### 1. Header (60px 고정 높이)

#### 구조
```html
<header class="header">
  <div class="header-left">
    <button class="hamburger-btn" aria-label="메뉴 열기">☰</button>
    <h1 class="logo">soul</h1>
  </div>

  <div class="header-right">
    <button class="notification-btn" aria-label="알림">
      🔔
      <span class="badge" v-if="unreadCount > 0">{{ unreadCount }}</span>
    </button>

    <button class="user-btn" aria-label="사용자 메뉴">
      @sowon
    </button>

    <button class="settings-btn" aria-label="설정">⚙️</button>
  </div>
</header>
```

#### 스타일
```css
.header {
  height: 60px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1.5rem;
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  font-size: var(--heading);
  font-weight: 700;
  color: var(--text-primary);
  margin-left: 1rem;
}

.notification-btn {
  position: relative;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #EF4444;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
}
```

#### 기능
- 햄버거 버튼 클릭 → 왼쪽 슬라이딩 메뉴 열기
- 알림 버튼 클릭 → 알림 패널 토글 (오른쪽)
- 사용자 버튼 클릭 → 사용자 메뉴 드롭다운
- 설정 버튼 클릭 → 설정 패널 열기 (오른쪽)

---

### 2. 슬라이딩 메뉴 (왼쪽, 280px)

#### 구조
```html
<aside class="sliding-menu glass-panel" :class="{ open: menuOpen }">
  <div class="menu-header">
    <h2>메뉴</h2>
    <button class="close-btn" @click="closeMenu">✕</button>
  </div>

  <nav class="menu-nav">
    <a href="#" class="menu-item" @click="openPanel('search')">
      <span class="icon">🔍</span>
      <span class="label">통합 검색</span>
    </a>

    <a href="#" class="menu-item" @click="openPanel('files')">
      <span class="icon">📁</span>
      <span class="label">파일 매니저</span>
    </a>

    <a href="#" class="menu-item" @click="openPanel('memory')">
      <span class="icon">🧠</span>
      <span class="label">메모리 탐색</span>
    </a>

    <a href="#" class="menu-item" @click="openPanel('mcp')">
      <span class="icon">🔌</span>
      <span class="label">MCP 관리</span>
    </a>

    <a href="#" class="menu-item" @click="openPanel('archive')">
      <span class="icon">📊</span>
      <span class="label">대화 아카이브</span>
    </a>

    <hr class="menu-divider">

    <a href="#" class="menu-item" @click="openPanel('settings')">
      <span class="icon">⚙️</span>
      <span class="label">설정</span>
    </a>
  </nav>
</aside>

<div class="menu-overlay" :class="{ visible: menuOpen }" @click="closeMenu"></div>
```

#### 스타일
```css
.sliding-menu {
  position: fixed;
  top: 60px;
  left: 0;
  width: 280px;
  height: calc(100vh - 60px);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 90;
  overflow-y: auto;
}

.sliding-menu.open {
  transform: translateX(0);
}

/* 유리 효과 적용 */
.sliding-menu.glass-panel {
  background: rgba(255, 255, 255, var(--glass-opacity));
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-right: 1px solid rgba(255, 255, 255, var(--glass-border-opacity));
  box-shadow: 4px 0 24px 0 var(--glass-shadow);
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  color: var(--text-primary);
  text-decoration: none;
  transition: background 0.2s;
}

.menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.menu-item .icon {
  font-size: 1.5rem;
  margin-right: 1rem;
}

.menu-overlay {
  position: fixed;
  top: 60px;
  left: 0;
  width: 100vw;
  height: calc(100vh - 60px);
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
  z-index: 80;
}

.menu-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}
```

#### 기능
- 햄버거 버튼 또는 오버레이 클릭 시 닫힘
- 각 메뉴 항목 클릭 시 해당 패널 열기 (오른쪽)
- 스크롤 가능 (메뉴 항목이 많을 경우)
- ESC 키로 닫기

---

### 3. 채팅 영역 (중앙, 유동적)

#### 구조
```html
<main class="chat-container" :style="{ marginRight: panelOpen ? '400px' : '0' }">
  <div class="messages-area" ref="messagesArea">
    <div v-for="message in messages" :key="message.id"
         class="message" :class="message.role">
      <div class="message-avatar">
        <span v-if="message.role === 'user'">👤</span>
        <span v-else>🤖</span>
      </div>

      <div class="message-content">
        <div class="message-header">
          <span class="message-author">
            {{ message.role === 'user' ? userName : 'Soul' }}
          </span>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
        </div>
        <div class="message-text" v-html="formatMessage(message.content)"></div>
      </div>
    </div>

    <div v-if="isTyping" class="typing-indicator">
      <span></span><span></span><span></span>
    </div>
  </div>

  <form class="input-area" @submit.prevent="sendMessage">
    <button type="button" class="attach-btn" aria-label="파일 첨부">📎</button>
    <button type="button" class="voice-btn" aria-label="음성 입력">🎤</button>

    <input
      type="text"
      v-model="inputText"
      placeholder="메시지를 입력하세요..."
      class="message-input"
      @keydown.enter.exact.prevent="sendMessage"
    >

    <button type="submit" class="send-btn" aria-label="전송" :disabled="!inputText.trim()">
      ▶
    </button>
  </form>
</main>
```

#### 스타일
```css
.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px); /* 60px header + 80px input */
  transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  scroll-behavior: smooth;
}

.message {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  animation: fadeIn 0.3s ease;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  font-size: 1.5rem;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  background: var(--surface);
  padding: 1rem 1.25rem;
  border-radius: 1rem;
}

.message.user .message-content {
  background: var(--primary);
  color: white;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: var(--small);
  color: var(--text-secondary);
}

.message.user .message-header {
  color: rgba(255, 255, 255, 0.8);
}

.message-text {
  font-size: var(--message);
  line-height: 1.6;
  word-wrap: break-word;
}

.typing-indicator {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.input-area {
  height: 80px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.5rem;
  background: var(--surface);
}

.attach-btn, .voice-btn, .send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.25rem;
  transition: background 0.2s;
}

.attach-btn:hover, .voice-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.send-btn {
  background: var(--primary);
  color: white;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-input {
  flex: 1;
  height: 48px;
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 0 1.25rem;
  font-size: var(--base);
  background: var(--background);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.message-input:focus {
  border-color: var(--primary);
}
```

#### 기능
- 자동 스크롤 (새 메시지 도착 시)
- Enter 키로 전송 (Shift+Enter는 줄바꿈)
- 타이핑 인디케이터 표시
- 메시지 마크다운 렌더링 지원
- 파일 첨부 버튼 (향후 확장)
- 음성 입력 버튼 (향후 확장)

---

### 4. 오른쪽 패널 (400px, 선택적)

#### 구조
```html
<aside class="right-panel glass-panel" :class="{ open: panelOpen }">
  <div class="panel-header">
    <h2>{{ currentPanel.title }}</h2>
    <button class="close-btn" @click="closePanel">✕</button>
  </div>

  <div class="panel-content">
    <!-- 동적 컴포넌트 로드 -->
    <component :is="currentPanel.component" />
  </div>
</aside>
```

#### 스타일
```css
.right-panel {
  position: fixed;
  top: 60px;
  right: 0;
  width: 400px;
  height: calc(100vh - 60px);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 90;
  overflow-y: auto;
}

.right-panel.open {
  transform: translateX(0);
}

/* 유리 효과 */
.right-panel.glass-panel {
  background: rgba(255, 255, 255, var(--glass-opacity));
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-left: 1px solid rgba(255, 255, 255, var(--glass-border-opacity));
  box-shadow: -4px 0 24px 0 var(--glass-shadow);
}

.panel-header {
  height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--border);
}

.panel-content {
  padding: 1.5rem;
}
```

#### 지원 패널 (10개)
1. **검색 (search)** - 통합 검색 인터페이스
2. **파일 (files)** - 파일 매니저
3. **메모리 (memory)** - 메모리 탐색 (타임라인, 관계 그래프)
4. **MCP (mcp)** - MCP 서버 관리
5. **아카이브 (archive)** - 대화 아카이브
6. **알림 (notifications)** - 알림 센터
7. **설정 (settings)** - 설정 메뉴
8. **컨텍스트 (context)** - 컨텍스트 관리
9. **TODO (todo)** - TODO 관리
10. **터미널 (terminal)** - 터미널 (향후 확장)

---

## 🎨 설정 패널 상세

### 설정 메뉴 구조

```
⚙️ 설정
├── 🎨 테마 & 외관
│   ├── 색상 스킨 (5가지)
│   ├── 글씨 크기 (5단계)
│   ├── 유리 효과
│   │   ├── 투명도 슬라이더 (0-100%)
│   │   ├── 블러 강도 슬라이더 (0-40px)
│   │   └── 활성화/비활성화 토글
│   └── 배경 이미지
│       ├── 이미지 업로드
│       ├── 투명도 슬라이더
│       ├── 블러 슬라이더
│       └── 위치/크기 설정
│
├── 👤 프로필
│   ├── 이름
│   ├── 아바타
│   └── 언어 (한국어/English)
│
├── 🤖 AI 모델
│   ├── 주 모델 선택
│   ├── 백그라운드 작업 모델
│   └── 서비스 관리 (API 키 등)
│
├── 🔔 알림
│   ├── 작업 완료 알림
│   ├── 에러 알림
│   ├── 안부 시스템
│   └── 알림 빈도
│
├── 💾 메모리 & 저장소
│   ├── 메모리 저장 경로
│   ├── 파일 저장 경로
│   ├── 자동 압축 설정
│   └── 백업 설정
│
└── 🔌 MCP 서버
    ├── 활성 서버 목록
    └── 서버 추가/편집
```

### 테마 설정 UI 예시

```html
<div class="settings-section">
  <h3>🎨 테마 & 외관</h3>

  <!-- 색상 스킨 -->
  <div class="setting-group">
    <label>색상 스킨</label>
    <div class="theme-selector">
      <button
        v-for="theme in themes"
        :key="theme.name"
        class="theme-option"
        :class="{ active: currentTheme === theme.name }"
        @click="setTheme(theme.name)"
      >
        <div class="theme-preview" :style="{ background: theme.primary }"></div>
        <span>{{ theme.label }}</span>
      </button>
    </div>
  </div>

  <!-- 글씨 크기 -->
  <div class="setting-group">
    <label>글씨 크기</label>
    <div class="font-size-selector">
      <button
        v-for="size in fontSizes"
        :key="size.value"
        :class="{ active: currentFontSize === size.value }"
        @click="setFontSize(size.value)"
      >
        {{ size.label }}
      </button>
    </div>
  </div>

  <!-- 유리 효과 -->
  <div class="setting-group">
    <label>
      <input type="checkbox" v-model="glassEnabled">
      유리 효과 활성화
    </label>

    <div v-if="glassEnabled" class="glass-settings">
      <label>
        투명도
        <input
          type="range"
          v-model="glassOpacity"
          min="0"
          max="100"
          step="5"
        >
        <span>{{ glassOpacity }}%</span>
      </label>

      <label>
        블러 강도
        <input
          type="range"
          v-model="glassBlur"
          min="0"
          max="40"
          step="2"
        >
        <span>{{ glassBlur }}px</span>
      </label>
    </div>
  </div>

  <!-- 배경 이미지 -->
  <div class="setting-group">
    <label>배경 이미지</label>
    <input type="file" @change="uploadBackgroundImage" accept="image/*">

    <div v-if="backgroundImage" class="background-settings">
      <label>
        투명도
        <input
          type="range"
          v-model="backgroundOpacity"
          min="0"
          max="100"
          step="5"
        >
        <span>{{ backgroundOpacity }}%</span>
      </label>

      <label>
        블러
        <input
          type="range"
          v-model="backgroundBlur"
          min="0"
          max="20"
          step="1"
        >
        <span>{{ backgroundBlur }}px</span>
      </label>

      <button @click="removeBackgroundImage" class="btn-danger">
        배경 이미지 제거
      </button>
    </div>
  </div>
</div>
```

---

## 💾 환경변수 저장 방식

### 1. 사용자 프로필에 저장 (MongoDB)

```javascript
// User Profile Schema
{
  userId: String,
  preferences: {
    // 테마 설정
    theme: {
      skin: 'default',              // default, dark, ocean, forest, sunset
      fontSize: 'md',               // xs, sm, md, lg, xl
      glassEnabled: true,
      glassOpacity: 85,             // 0-100
      glassBlur: 20,                // 0-40
      backgroundImage: '/uploads/bg/user123.jpg',
      backgroundOpacity: 30,        // 0-100
      backgroundBlur: 5             // 0-20
    },

    // 기타 설정
    language: 'ko',
    notifications: { ... },
    aiModel: { ... }
  }
}
```

### 2. CSS 변수 동적 적용

```javascript
// theme-manager.js
class ThemeManager {
  applyTheme(themeConfig) {
    const root = document.documentElement;

    // 색상 스킨 적용
    const theme = THEMES[themeConfig.skin];
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // 글씨 크기 적용
    const fontSize = FONT_SIZES[themeConfig.fontSize];
    Object.entries(fontSize).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // 유리 효과 적용
    root.style.setProperty('--glass-enabled', themeConfig.glassEnabled);
    root.style.setProperty('--glass-opacity', themeConfig.glassOpacity / 100);
    root.style.setProperty('--glass-blur', `${themeConfig.glassBlur}px`);

    // 배경 이미지 적용
    if (themeConfig.backgroundImage) {
      root.style.setProperty('--background-image', `url('${themeConfig.backgroundImage}')`);
      root.style.setProperty('--background-image-opacity', themeConfig.backgroundOpacity / 100);
      root.style.setProperty('--background-image-blur', `${themeConfig.backgroundBlur}px`);
    }
  }
}
```

### 3. API 엔드포인트

```javascript
// GET /api/profile/user/:userId/theme - 테마 설정 조회
// PATCH /api/profile/user/:userId/theme - 테마 설정 업데이트

// Example Request:
PATCH /api/profile/user/sowon/theme
{
  "skin": "ocean",
  "fontSize": "lg",
  "glassEnabled": true,
  "glassOpacity": 90,
  "glassBlur": 25
}
```

---

## 📱 반응형 디자인

### 데스크톱 (1200px+)
- 슬라이딩 메뉴: 280px
- 오른쪽 패널: 400px
- 채팅 영역: 유동적

### 태블릿 (768px ~ 1199px)
- 슬라이딩 메뉴: 260px
- 오른쪽 패널: 350px
- 채팅 영역: 유동적

### 모바일 (~ 767px)
- 슬라이딩 메뉴: 100% (전체 화면)
- 오른쪽 패널: 100% (전체 화면)
- 채팅 영역: 100%
- 메시지 최대 너비: 90%

---

## 🎬 애니메이션 & 인터랙션

### 1. 슬라이딩 애니메이션
```css
transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### 2. 페이드 인
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 3. 호버 효과
```css
transition: all 0.2s ease;
```

### 4. 버튼 리플 효과 (선택적)
```css
.btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.btn:active::after {
  width: 300px;
  height: 300px;
}
```

---

## 🚀 다음 단계

1. ✅ 설계도 작성 완료
2. ⏳ 프론트엔드 프레임워크 선택 및 설정
3. ⏳ 기본 레이아웃 구현 (Header, Menu, Chat)
4. ⏳ 테마 시스템 구현
5. ⏳ 패널 시스템 구현
6. ⏳ 백엔드 API 연결
7. ⏳ 반응형 최적화
8. ⏳ 접근성 개선

---

**작성자**: Claude (Soul Assistant)
**버전**: 1.0
**날짜**: 2026-01-19
