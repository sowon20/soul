/**
 * Chat Manager
 * 채팅 메시지 관리 및 렌더링 (Claude Style)
 */

import dashboardManager from '../../utils/dashboard-manager.js';
import { TTSManager } from '../../utils/tts-manager.js';

export class ChatManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.messagesArea = document.getElementById('messagesArea');
    this.userMessageTemplate = document.getElementById('userMessageTemplate');
    this.assistantMessageTemplate = document.getElementById('assistantMessageTemplate');
    this.typingIndicatorTemplate = document.getElementById('typingIndicatorTemplate');
    this.messages = [];
    this.conversationId = 'main-conversation';
    this.isLoadingHistory = false;
    this.hasMoreHistory = true;
    this.oldestMessageId = null;
    this.oldestMessageTimestamp = null;
    this.tts = new TTSManager();

    // Configure marked for markdown rendering (if available)
    if (window.marked) {
      window.marked.setOptions({
        breaks: true,
        gfm: true,
      });
    }

    // Setup infinite scroll
    this.setupInfiniteScroll();

    // Setup selection restriction (드래그 선택 범위 제한)
    this.setupSelectionRestriction();
  }

  /**
   * 선택 범위 제한 설정 (메시지 간 선택 확장 방지)
   */
  setupSelectionRestriction() {
    let selectionStartMessage = null;
    let isAdjusting = false;

    // 선택 시작 시 메시지 추적
    this.messagesArea.addEventListener('mousedown', (e) => {
      // thinking 토글 버튼은 무시
      if (e.target.closest('.ai-thinking-toggle')) {
        return;
      }
      const messageContent = e.target.closest('.message-content');
      selectionStartMessage = messageContent ? messageContent.closest('.chat-message') : null;
      console.log('🖱️ mousedown on message:', selectionStartMessage?.classList?.value);
    });

    // 선택 변경 시 범위 제한
    document.addEventListener('selectionchange', () => {
      if (!selectionStartMessage || isAdjusting) return;

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (range.collapsed) return;

      // 선택 시작/끝 위치의 메시지 확인
      const getMessageFromNode = (node) => {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return element?.closest?.('.chat-message');
      };

      const startMessage = getMessageFromNode(range.startContainer);
      const endMessage = getMessageFromNode(range.endContainer);

      // 메시지 콘텐츠 내에서만 선택 허용 (메시지 영역 밖으로 나가면 취소)
      const isValidSelection = startMessage && endMessage &&
        startMessage.closest('.chat-messages') && endMessage.closest('.chat-messages');

      if (!isValidSelection) {
        console.log('❌ Selection outside message area, clearing');
        isAdjusting = true;
        selection.removeAllRanges();
        setTimeout(() => {
          isAdjusting = false;
        }, 0);
      }
    });

    // 선택 끝나면 추적 해제
    document.addEventListener('mouseup', () => {
      selectionStartMessage = null;
    });
  }

  /**
   * 무한 스크롤 설정
   */
  setupInfiniteScroll() {
    // chatContainer가 실제 스크롤 담당
    const scrollContainer = this.messagesArea.parentElement;
    
    // 로딩 인디케이터 생성
    this.historyLoader = document.createElement('div');
    this.historyLoader.className = 'history-loader';
    this.historyLoader.innerHTML = '<span class="history-loader-spinner"></span> 이전 대화 불러오는 중...';
    this.historyLoader.style.display = 'none';
    this.messagesArea.insertBefore(this.historyLoader, this.messagesArea.firstChild);
    
    scrollContainer.addEventListener('scroll', () => {
      // 스크롤이 맨 위에 거의 도달했을 때 과거 메시지 로드
      if (scrollContainer.scrollTop < 150 && !this.isLoadingHistory && this.hasMoreHistory) {
        this.loadOlderMessages();
      }
    });
  }

  /**
   * 과거 메시지 로드 (무한 스크롤)
   */
  async loadOlderMessages() {
    if (this.isLoadingHistory || !this.hasMoreHistory) return;

    this.isLoadingHistory = true;
    
    // 로딩 인디케이터 표시
    if (this.historyLoader) {
      this.historyLoader.style.display = 'flex';
    }
    
    const scrollContainer = this.messagesArea.parentElement;
    const currentScrollHeight = this.messagesArea.scrollHeight;

    try {
      const options = {
        limit: 20,
      };

      if (this.oldestMessageTimestamp) {
        options.before = this.oldestMessageTimestamp;
      }

      const history = await this.apiClient.getConversationHistory(this.conversationId, options);

      if (history && history.messages && history.messages.length > 0) {
        // 과거 메시지를 배열 앞에 추가
        this.messages.unshift(...history.messages);
        this.oldestMessageId = history.messages[0].id;
        this.oldestMessageTimestamp = history.messages[0].timestamp;

        // DOM에 메시지 추가 (맨 위에)
        history.messages.reverse().forEach(message => {
          const messageElement = this.createMessageElement(message);
          this.messagesArea.insertBefore(messageElement, this.messagesArea.firstChild);
        });

        // 스크롤 위치 유지
        const newScrollHeight = this.messagesArea.scrollHeight;
        this.messagesArea.scrollTop = newScrollHeight - currentScrollHeight;

        // 더 이상 메시지가 없으면
        if (history.messages.length < options.limit) {
          this.hasMoreHistory = false;
        }
      } else {
        this.hasMoreHistory = false;
      }
    } catch (error) {
      console.error('과거 메시지 로드 실패:', error);
      // API 실패 시 무한 스크롤 비활성화
      this.hasMoreHistory = false;
    } finally {
      this.isLoadingHistory = false;
      // 로딩 인디케이터 숨김
      if (this.historyLoader) {
        this.historyLoader.style.display = 'none';
      }
    }
  }

  /**
   * 로딩 인디케이터 표시
   */
  showLoadingIndicator() {
    if (this._loadingEl) return;
    this._loadingEl = document.createElement('div');
    this._loadingEl.className = 'chat-initial-loading';
    this._loadingEl.innerHTML = `
      <div class="chat-loading-spinner"></div>
      <div class="chat-loading-text">대화 불러오는 중...</div>
    `;
    this.messagesArea.appendChild(this._loadingEl);
    // 로딩 중에도 영역 보이게
    this.messagesArea.classList.add('loaded');
  }

  /**
   * 로딩 인디케이터 제거
   */
  hideLoadingIndicator() {
    if (this._loadingEl) {
      this._loadingEl.remove();
      this._loadingEl = null;
    }
  }

  /**
   * 최근 메시지 로드 (초기 로딩, 마지막 대화 위치)
   * 서버 미응답 시 재시도 (최대 5회, 2초 간격)
   */
  async loadRecentMessages(limit = 50) {
    const maxRetries = 5;
    const retryDelay = 2000;

    this.showLoadingIndicator();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const history = await this.apiClient.getConversationHistory(this.conversationId, { limit });

        this.hideLoadingIndicator();

        if (history && history.messages && history.messages.length > 0) {
          // 메시지 배열에 추가
          this.messages = history.messages;
          this.oldestMessageId = history.messages[0].id;
          this.oldestMessageTimestamp = history.messages[0].timestamp;

          // DOM에 렌더링 (개별 에러 시 해당 메시지만 스킵)
          for (const message of history.messages) {
            try {
              const messageElement = this.createMessageElement(message);
              this.messagesArea.appendChild(messageElement);
            } catch (renderErr) {
              console.warn('메시지 렌더링 실패 (스킵):', message.id, renderErr.message);
            }
          }

          // 더 불러올 메시지가 있는지 확인
          this.hasMoreHistory = history.messages.length >= limit;
        } else {
          this.hasMoreHistory = false;
          this.addWelcomeMessage();
        }

        // 로딩 완료 표시 → 스크롤은 loaded 후에
        this.messagesArea.classList.add('loaded');
        this._scrollAfterLoad();
        return; // 성공 시 종료

      } catch (error) {
        console.warn(`대화 로드 시도 ${attempt}/${maxRetries} 실패:`, error.message);

        if (attempt < maxRetries) {
          // 로딩 텍스트 업데이트
          const textEl = this._loadingEl?.querySelector('.chat-loading-text');
          if (textEl) textEl.textContent = `서버 연결 대기중... (${attempt}/${maxRetries})`;
          await new Promise(r => setTimeout(r, retryDelay));
        } else {
          // 최대 재시도 초과 — 이미 일부 메시지가 DOM에 있으면 welcome 안 보임
          console.error('최근 메시지 로드 실패 (재시도 초과)');
          this.hideLoadingIndicator();
          this.messagesArea.classList.add('loaded');
          const hasRendered = this.messagesArea.querySelectorAll('.chat-message').length > 0;
          if (!hasRendered) {
            this.addWelcomeMessage();
          }
          this._scrollAfterLoad();
        }
      }
    }
  }

  /**
   * 로드 완료 후 스크롤 (loaded 클래스 추가 후 실행)
   */
  _scrollAfterLoad() {
    // loaded 후 즉시
    this.scrollToBottom(false);
    // DOM 레이아웃 안정화 대기
    requestAnimationFrame(() => {
      this.scrollToBottom(false);
      // 이미지/폰트 로딩 후 추가 스크롤
      setTimeout(() => this.scrollToBottom(false), 300);
      setTimeout(() => this.scrollToBottom(false), 1000);
    });
  }

  /**
   * 특정 메시지 주변 로드 (검색 결과 이동용)
   */
  async loadMessagesAround(messageId, messageDate) {
    try {
      // 해당 메시지 전후 20개씩 로드
      const history = await this.apiClient.getConversationHistory(this.conversationId, {
        limit: 40,
        around: messageId  // 백엔드에서 처리
      });

      if (history && history.messages && history.messages.length > 0) {
        // 기존 메시지 클리어
        this.messagesArea.innerHTML = '';
        this.messages = history.messages;
        
        // DOM에 렌더링
        history.messages.forEach(message => {
          const messageElement = this.createMessageElement(message);
          this.messagesArea.appendChild(messageElement);
        });
        
        // 해당 메시지의 ID 저장
        this.oldestMessageId = history.messages[0].id || history.messages[0].timestamp;
        this.hasMoreHistory = true;
      }
    } catch (error) {
      console.error('메시지 로드 실패:', error);
    }
  }

  /**
   * 환영 메시지 추가
   */
  addWelcomeMessage() {
    const welcomeText = '안녕하세요! 무엇을 도와드릴까요?';
    this.addMessage({
      role: 'assistant',
      content: welcomeText,
      timestamp: new Date(),
    });
  }

  /**
   * 메시지 추가
   * @param {Object} message - { role, content, timestamp }
   */
  addMessage(message) {
    this.messages.push(message);

    const messageElement = this.createMessageElement(message);

    // 애니메이션 클래스 추가
    messageElement.classList.add('fade-in-up');

    this.messagesArea.appendChild(messageElement);

    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * 메시지 요소 생성 (Claude Style)
   */
  createMessageElement(message) {
    let template;
    const messageId = message.id || message._id || message.timestamp;

    if (message.role === 'user') {
      template = this.userMessageTemplate.content.cloneNode(true);
      const messageDiv = template.querySelector('.chat-message.user');
      
      // 메시지 ID 설정 (검색 결과 이동용)
      messageDiv.dataset.messageId = messageId;

      // 첨부 이미지 — 말풍선 바깥에 표시
      const content = messageDiv.querySelector('.message-content');
      const imageAtts = (message.attachments || []).filter(att => att.type?.startsWith('image/'));
      const nonImageAtts = (message.attachments || []).filter(att => !att.type?.startsWith('image/'));

      if (imageAtts.length > 0) {
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'user-attached-images';
        imageAtts.forEach(att => {
          if (att.url) {
            const img = document.createElement('img');
            img.src = att.url;
            img.alt = att.name || '이미지';
            imagesDiv.appendChild(img);
          }
        });
        messageDiv.insertBefore(imagesDiv, content);
      }

      // 텍스트 — 말풍선 안에 표시
      let textContent = (message.content || '').trim();
      // 시간 접두사 제거 (과거 대화에도 적용)
      textContent = textContent.replace(/^\s*\[[\d/:\s일월화수목금토요년\-\.]+\]\s*/gm, '').trim();
      if (textContent) {
        content.innerHTML = this.escapeHtml(textContent);
      } else {
        // 텍스트 없으면 말풍선 숨김
        content.style.display = 'none';
      }

      // 파일 첨부 (이미지 제외)
      if (nonImageAtts.length > 0) {
        const attachmentsDiv = document.createElement('div');
        attachmentsDiv.className = 'message-attachments';
        nonImageAtts.forEach(att => {
          const fileDiv = document.createElement('div');
          fileDiv.className = 'message-attachment-file';
          const ext = att.name?.split('.').pop()?.toUpperCase() || 'FILE';
          fileDiv.innerHTML = `<span class="attachment-ext">${ext}</span><span>${att.name}</span>`;
          attachmentsDiv.appendChild(fileDiv);
        });
        content.before(attachmentsDiv);
      }

      // Set timestamp
      const timestamp = messageDiv.querySelector('.message-time');
      timestamp.textContent = this.formatDateTime(message.timestamp);

      // Add event listeners for action buttons
      this.attachUserMessageActions(messageDiv, message);

      return messageDiv;
    } else {
      template = this.assistantMessageTemplate.content.cloneNode(true);
      const messageDiv = template.querySelector('.chat-message.assistant');
      
      // 메시지 ID 설정 (검색 결과 이동용)
      messageDiv.dataset.messageId = messageId;

      // Set content (with markdown support)
      const content = messageDiv.querySelector('.message-content');

      // 타임라인 모드: timeline 배열이 있으면 시간순 인라인 렌더링
      if (message.timeline && message.timeline.length > 0) {
        this._renderTimeline(content, message);
        // 코드블록 처리 + 외부 링크
        this.processCodeBlocks(content, message.content);
        this.processExternalLinks(content);
        // 라우팅 정보
        this._applyRouting(messageDiv, message.routing);
        // 액션 버튼
        this.attachAssistantMessageActions(messageDiv, message);
        return messageDiv;
      }

      // thinking 태그 분리
      let displayContent = message.content;
      const thinkingMatch = message.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
      if (thinkingMatch) {
        displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
      }
      
      // tool_use 태그 분리
      displayContent = displayContent.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim();

      // tool_history 태그 제거 (도구 실행 결과는 접힘 UI로 표시)
      displayContent = displayContent.replace(/<tool_history>[\s\S]*?<\/tool_history>/g, '').trim();

      // TTS 전용 태그 제거 (화면에서 숨김, TTS는 원본 사용)
      displayContent = displayContent.replace(/\[laughter\]/gi, '').replace(/ {2,}/g, ' ').trim();

      // 시간 접두사 제거 (과거 대화에도 적용)
      displayContent = displayContent.replace(/^\s*\[[\d/:\s일월화수목금토요년\-\.]+\]\s*/gm, '').trim();

      // 마크다운 전처리
      displayContent = this._preprocessMarkdown(displayContent);
      const renderedContent = window.marked ? window.marked.parse(displayContent).trim() : this.escapeHtml(displayContent);
      content.innerHTML = renderedContent;

      // 소울 메시지의 hr 태그 흐리게 (---)
      if (message.role === 'assistant') {
        setTimeout(() => {
          const hrElements = content.querySelectorAll('hr');
          hrElements.forEach(hr => {
            hr.style.border = 'none';
            hr.style.borderTop = '1px solid rgba(255, 255, 255, 0.15)';
            hr.style.margin = '1em 0';
          });
          console.log(`✨ ${hrElements.length}개 hr 요소 스타일 적용`);
        }, 10);
      }

      // thinking 블록은 innerHTML 설정 후에 추가 (이벤트 리스너 유지)
      if (thinkingMatch) {
        const thinkingText = thinkingMatch[1].trim();
        
        // thinking 토글 컨테이너
        const thinkingContainer = document.createElement('div');
        thinkingContainer.className = 'ai-thinking-container';
        
        // 토글 버튼
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ai-thinking-toggle';
        toggleBtn.innerHTML = '💭 <span>생각 과정</span>';
        toggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.parentElement.classList.toggle('expanded');
        });
        
        // thinking 내용
        const thinkingContent = document.createElement('div');
        thinkingContent.className = 'ai-thinking-content';
        thinkingContent.textContent = thinkingText;
        
        thinkingContainer.appendChild(toggleBtn);
        thinkingContainer.appendChild(thinkingContent);
        content.insertBefore(thinkingContainer, content.firstChild);
      }

      // 도구 사용 과정 표시
      if (message.toolsUsed && message.toolsUsed.length > 0) {
        const toolsUsedArr = message.toolsUsed;
        const toolsContainer = document.createElement('div');
        toolsContainer.className = 'ai-tool-thinking-container';

        // 토글 버튼
        const toolsToggle = document.createElement('button');
        toolsToggle.type = 'button';
        toolsToggle.className = 'ai-tool-thinking-toggle';
        const allSuccess = toolsUsedArr.every(t => t.success);
        const statusClass = allSuccess ? 'success' : 'warning';
        const icon = allSuccess ? '✓' : '⚠';
        toolsToggle.innerHTML = `<span class="tool-thinking-icon ${statusClass}">${icon}</span> <span>도구 사용 ${toolsUsedArr.length}건</span><span class="tool-thinking-chevron">›</span>`;
        toolsToggle.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.parentElement.classList.toggle('expanded');
        });

        // 도구별 상세 과정
        const toolsContent = document.createElement('div');
        toolsContent.className = 'ai-tool-thinking-content';

        const koreanActions = {
          'recall_memory': '기억 검색',
          'get_profile': '프로필 조회',
          'update_profile': '정보 저장',
          'list_my_rules': '규칙 조회',
          'add_my_rule': '규칙 저장',
          'delete_my_rule': '규칙 삭제',
          'send_message': '메시지 전송',
          'schedule_message': '메시지 예약',
          'cancel_scheduled_message': '예약 취소',
          'list_scheduled_messages': '예약 목록'
        };

        const escapeHtml = (text) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };

        // 도구 실행 단계
        for (const tool of toolsUsedArr) {
          const step = document.createElement('div');
          step.className = `tool-thinking-step ${tool.success ? 'success' : 'error'}`;

          const actionName = koreanActions[tool.name] || tool.display || tool.name;
          const inputText = tool.inputSummary || '';
          let resultText = tool.resultPreview || tool.error || '';
          // 기존 메시지 호환: raw JSON이면 한국어 요약으로 변환
          if (resultText.startsWith('{')) {
            try {
              const d = JSON.parse(resultText);
              if (tool.name === 'recall_memory') {
                const cnt = d.count || (d.results ? d.results.length : 0);
                resultText = cnt > 0 ? `${cnt}건 발견` : '관련 기억 없음';
              } else if (tool.name === 'get_profile') {
                resultText = d.found === false ? '정보 없음' : (d.field && d.value ? `${d.field}: ${d.value}` : '프로필 조회 완료');
              } else if (tool.name === 'update_profile') {
                resultText = d.success ? `${d.field || '정보'} 저장 완료` : '저장 실패';
              } else if (d.success !== undefined) {
                resultText = d.success ? '성공' : (d.message || d.error || '실패');
              }
            } catch { /* 잘린 JSON — 그대로 표시 */ }
          }

          // resultFull이 있으면 클릭해서 펼칠 수 있게
          const fullResult = tool.resultFull || '';
          const hasFullResult = fullResult && fullResult !== resultText;

          step.innerHTML = `
            <div class="tool-thinking-indicator">${tool.success ? '✓' : '✗'}</div>
            <div class="tool-thinking-content-wrap">
              <div class="tool-thinking-action">${escapeHtml(actionName)}${inputText ? `<span class="tool-thinking-input">${escapeHtml(inputText)}</span>` : ''}</div>
              ${resultText ? `<div class="tool-thinking-result${hasFullResult ? ' expandable' : ''}">${escapeHtml(resultText)}</div>` : ''}
              ${hasFullResult ? `<pre class="tool-result-full" style="display:none">${escapeHtml(fullResult)}</pre>` : ''}
            </div>
          `;

          if (hasFullResult) {
            const resultEl = step.querySelector('.tool-thinking-result');
            resultEl.addEventListener('click', (e) => {
              e.stopPropagation();
              const fullEl = step.querySelector('.tool-result-full');
              if (fullEl.style.display === 'none') {
                fullEl.style.display = 'block';
                resultEl.classList.add('expanded');
              } else {
                fullEl.style.display = 'none';
                resultEl.classList.remove('expanded');
              }
            });
          }
          toolsContent.appendChild(step);
        }

        toolsContainer.appendChild(toolsToggle);
        toolsContainer.appendChild(toolsContent);
        content.insertBefore(toolsContainer, content.firstChild);
      }

      // Process code blocks - add copy button and syntax highlighting
      this.processCodeBlocks(content, message.content);

      // Process external links - add popup handler
      this.processExternalLinks(content);

      // 라우팅 정보 표시 (있는 경우만)
      this._applyRouting(messageDiv, message.routing);

      // Add event listeners for action buttons
      this.attachAssistantMessageActions(messageDiv, message);

      return messageDiv;
    }
  }

  /**
   * 코드 블럭 처리 (복사 버튼 추가 + Prism 하이라이팅)
   */
  processCodeBlocks(contentDiv, rawContent) {
    const preElements = contentDiv.querySelectorAll('pre');

    preElements.forEach(pre => {
      // Wrap pre in code-block container
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';

      // Create copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.title = '복사';
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      `;

      // Get code content for copying
      const codeElement = pre.querySelector('code');
      const codeText = codeElement ? codeElement.textContent : pre.textContent;

      copyBtn.addEventListener('click', () => {
        this.copyMessage(codeText, copyBtn);
      });

      // Insert wrapper and button
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(copyBtn);
      wrapper.appendChild(pre);

      // Apply Prism syntax highlighting
      if (window.Prism && codeElement) {
        window.Prism.highlightElement(codeElement);
      }
    });
  }

  /**
   * 외부 링크 처리 (팝업으로 확인 후 이동)
   */
  processExternalLinks(contentDiv) {
    const links = contentDiv.querySelectorAll('a');

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      // 외부 링크인지 확인 (http/https로 시작하거나 절대 경로)
      const isExternal = href.startsWith('http://') || href.startsWith('https://');

      if (isExternal) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.showExternalLinkModal(href);
        });
      }
    });
  }

  /**
   * 외부 링크 모달 표시
   */
  showExternalLinkModal(url) {
    const modal = document.getElementById('externalLinkModal');
    const urlDisplay = document.getElementById('externalLinkUrl');
    const cancelBtn = document.getElementById('externalLinkCancel');
    const confirmBtn = document.getElementById('externalLinkConfirm');
    const backdrop = modal.querySelector('.external-link-backdrop');

    if (!modal || !urlDisplay) return;

    // URL 표시
    urlDisplay.textContent = url;

    // 모달 표시
    modal.classList.add('show');

    // 이벤트 핸들러 (중복 방지를 위해 새로 생성)
    const closeModal = () => {
      modal.classList.remove('show');
      // 이벤트 리스너 정리
      cancelBtn.removeEventListener('click', closeModal);
      confirmBtn.removeEventListener('click', openLink);
      backdrop.removeEventListener('click', closeModal);
    };

    const openLink = () => {
      window.open(url, '_blank', 'noopener,noreferrer');
      closeModal();
    };

    // 이벤트 연결
    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', openLink);
    backdrop.addEventListener('click', closeModal);

    // ESC 키로 닫기
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * 사용자 메시지 액션 버튼 이벤트 연결
   */
  attachUserMessageActions(messageDiv, message) {
    const copyBtn = messageDiv.querySelector('.copy-btn');
    const editBtn = messageDiv.querySelector('.edit-btn');
    const deleteBtn = messageDiv.querySelector('.delete-btn');

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', () => this.copyMessage(message.content, copyBtn));
    }
    if (editBtn && !editBtn.dataset.bound) {
      editBtn.dataset.bound = 'true';
      editBtn.addEventListener('click', () => this.editMessage(message));
    }
    if (deleteBtn && !deleteBtn.dataset.bound) {
      deleteBtn.dataset.bound = 'true';
      deleteBtn.addEventListener('click', () => this.deleteMessage(messageDiv, message));
    }
  }

  /**
   * AI 메시지 액션 버튼 이벤트 연결
   */
  attachAssistantMessageActions(messageDiv, message) {
    const copyBtn = messageDiv.querySelector('.copy-btn');
    const likeBtn = messageDiv.querySelector('.like-btn');
    const dislikeBtn = messageDiv.querySelector('.dislike-btn');
    const bookmarkBtn = messageDiv.querySelector('.bookmark-btn');
    const retryBtn = messageDiv.querySelector('.retry-btn');

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', () => this.copyMessage(message.content, copyBtn));
    }
    if (likeBtn && !likeBtn.dataset.bound) {
      likeBtn.dataset.bound = 'true';
      likeBtn.addEventListener('click', () => this.showFeedback(likeBtn, 'liked'));
    }
    if (dislikeBtn && !dislikeBtn.dataset.bound) {
      dislikeBtn.dataset.bound = 'true';
      dislikeBtn.addEventListener('click', () => this.showFeedback(dislikeBtn, 'disliked'));
    }
    if (bookmarkBtn && !bookmarkBtn.dataset.bound) {
      bookmarkBtn.dataset.bound = 'true';
      bookmarkBtn.addEventListener('click', () => this.showFeedback(bookmarkBtn, 'bookmarked'));
    }
    if (retryBtn && !retryBtn.dataset.bound) {
      retryBtn.dataset.bound = 'true';
      retryBtn.addEventListener('click', () => this.retryMessage(message));
    }
  }

  /**
   * 메시지 복사 (버튼에 피드백 제공)
   */
  async copyMessage(content, button = null) {
    console.log('📋 copyMessage 호출됨, content:', content?.substring(0, 50));

    let success = false;

    // 클립보드 API 시도
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        success = true;
      } else {
        // 폴백: execCommand 사용
        success = this.copyWithExecCommand(content);
      }
    } catch (error) {
      console.warn('클립보드 API 실패, 폴백 시도:', error);
      success = this.copyWithExecCommand(content);
    }

    // 버튼 피드백
    if (button) {
      const originalHTML = button.innerHTML;
      if (success) {
        button.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
        button.classList.add('copied');
        console.log('✅ 복사 성공');
      } else {
        button.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        `;
        button.classList.add('copy-failed');
        console.log('❌ 복사 실패');
      }
      console.log('⏰ setTimeout 설정 (2초 후 복원)');
      setTimeout(() => {
        console.log('⏰ setTimeout 실행됨 - 원래 아이콘 복원');
        button.innerHTML = originalHTML;
        button.classList.remove('copied', 'copy-failed');
      }, 2000);
    }
  }

  /**
   * execCommand 폴백을 사용한 복사
   */
  copyWithExecCommand(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (error) {
      console.error('execCommand 복사 실패:', error);
      return false;
    }
  }

  /**
   * 기존 하드코딩된 메시지에 이벤트 바인딩
   */
  bindExistingMessages() {
    // 기존 어시스턴트 메시지들
    const assistantMessages = this.messagesArea.querySelectorAll('.chat-message.assistant');
    assistantMessages.forEach(messageDiv => {
      const content = messageDiv.querySelector('.message-content');
      if (!content) return;

      // 코드 복사 버튼
      const codeCopyBtns = messageDiv.querySelectorAll('.code-copy-btn');
      codeCopyBtns.forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        const codeBlock = btn.closest('.code-block');
        if (codeBlock) {
          const code = codeBlock.querySelector('code');
          const codeText = code ? code.textContent : '';
          btn.addEventListener('click', () => this.copyMessage(codeText, btn));
        }
      });

      // 외부 링크 처리
      this.processExternalLinks(content);

      // 메시지 액션 버튼들
      const copyBtn = messageDiv.querySelector('.message-actions .message-action-btn[title="복사"]');
      const likeBtn = messageDiv.querySelector('.message-actions .message-action-btn[title="좋아요"]');
      const dislikeBtn = messageDiv.querySelector('.message-actions .message-action-btn[title="싫어요"]');
      const bookmarkBtn = messageDiv.querySelector('.message-actions .message-action-btn[title="북마크"]');
      const retryBtn = messageDiv.querySelector('.message-actions .message-action-btn[title="재생성"]');

      const textContent = content.textContent;

      if (copyBtn && !copyBtn.dataset.bound) {
        copyBtn.dataset.bound = 'true';
        console.log('✅ copyBtn 바인딩됨');
        copyBtn.addEventListener('click', (e) => {
          console.log('🖱️ copyBtn 클릭 이벤트 발생');
          e.stopPropagation();
          this.copyMessage(textContent, copyBtn);
        });
      }
      if (likeBtn && !likeBtn.dataset.bound) {
        likeBtn.dataset.bound = 'true';
        likeBtn.addEventListener('click', () => this.showFeedback(likeBtn, 'liked'));
      }
      if (dislikeBtn && !dislikeBtn.dataset.bound) {
        dislikeBtn.dataset.bound = 'true';
        dislikeBtn.addEventListener('click', () => this.showFeedback(dislikeBtn, 'disliked'));
      }
      if (bookmarkBtn && !bookmarkBtn.dataset.bound) {
        bookmarkBtn.dataset.bound = 'true';
        bookmarkBtn.addEventListener('click', () => this.showFeedback(bookmarkBtn, 'bookmarked'));
      }
      if (retryBtn && !retryBtn.dataset.bound) {
        retryBtn.dataset.bound = 'true';
        retryBtn.addEventListener('click', () => console.log('재생성 요청'));
      }
    });

    // 기존 사용자 메시지들
    const userMessages = this.messagesArea.querySelectorAll('.chat-message.user');
    userMessages.forEach(messageDiv => {
      const content = messageDiv.querySelector('.message-content');
      if (!content) return;

      const footer = messageDiv.querySelector('.user-message-footer');
      if (!footer) return;

      const copyBtn = footer.querySelector('.message-action-btn[title="복사"]');
      const editBtn = footer.querySelector('.message-action-btn[title="수정"]');
      const deleteBtn = footer.querySelector('.message-action-btn[title="삭제"]');
      const retryBtn = footer.querySelector('.message-action-btn[title="재시도"]');

      const textContent = content.textContent;

      if (copyBtn && !copyBtn.dataset.bound) {
        copyBtn.dataset.bound = 'true';
        console.log('✅ user copyBtn 바인딩됨');
        copyBtn.addEventListener('click', (e) => {
          console.log('🖱️ user copyBtn 클릭 이벤트 발생');
          e.stopPropagation();
          this.copyMessage(textContent, copyBtn);
        });
      }
      if (editBtn && !editBtn.dataset.bound) {
        editBtn.dataset.bound = 'true';
        editBtn.addEventListener('click', () => alert('수정 기능은 준비 중입니다.'));
      }
      if (deleteBtn && !deleteBtn.dataset.bound) {
        deleteBtn.dataset.bound = 'true';
        deleteBtn.addEventListener('click', () => {
          if (confirm('이 메시지를 삭제하시겠습니까?')) {
            messageDiv.remove();
          }
        });
      }
      if (retryBtn && !retryBtn.dataset.bound) {
        retryBtn.dataset.bound = 'true';
        retryBtn.addEventListener('click', () => {
          this.sendMessage(textContent);
        });
      }
    });
  }

  /**
   * 버튼 피드백 표시
   */
  showFeedback(button, action) {
    button.classList.toggle(action);
    console.log(`${action} 토글됨`);
  }

  /**
   * 메시지 수정
   */
  editMessage(message) {
    const newContent = prompt('메시지를 수정하세요:', message.content);
    if (newContent && newContent !== message.content) {
      // TODO: API 호출하여 메시지 수정
      console.log('메시지 수정:', newContent);
    }
  }

  /**
   * 메시지 삭제
   */
  deleteMessage(messageDiv, message) {
    if (confirm('이 메시지를 삭제하시겠습니까?')) {
      messageDiv.remove();
      const index = this.messages.indexOf(message);
      if (index > -1) {
        this.messages.splice(index, 1);
      }
      // TODO: API 호출하여 메시지 삭제
      console.log('메시지 삭제됨');
    }
  }

  /**
   * 메시지 좋아요
   */
  likeMessage(message) {
    // TODO: API 호출
    console.log('메시지 좋아요:', message.content.substring(0, 20));
  }

  /**
   * 메시지 싫어요
   */
  dislikeMessage(message) {
    // TODO: API 호출
    console.log('메시지 싫어요:', message.content.substring(0, 20));
  }

  /**
   * 메시지 북마크
   */
  bookmarkMessage(message) {
    // TODO: API 호출
    console.log('메시지 북마크:', message.content.substring(0, 20));
  }

  /**
   * 메시지 재시도
   */
  async retryMessage(message) {
    // 이전 사용자 메시지 찾기
    const index = this.messages.indexOf(message);
    if (index > 0) {
      const previousMessage = this.messages[index - 1];
      if (previousMessage.role === 'user') {
        await this.sendMessage(previousMessage.content);
      }
    }
  }

  /**
   * 타이핑 인디케이터 표시
   */
  showTypingIndicator() {
    console.log('[Chat] showTypingIndicator called at', Date.now());
    console.log('[Chat] typingIndicatorTemplate:', this.typingIndicatorTemplate);

    if (!this.typingIndicatorTemplate) {
      console.error('[Chat] typingIndicatorTemplate not found!');
      return;
    }

    const indicator = this.typingIndicatorTemplate.content.cloneNode(true);
    const indicatorElement = indicator.querySelector('.chat-message.assistant');
    console.log('[Chat] indicatorElement:', indicatorElement);

    if (indicatorElement) {
      indicatorElement.id = 'activeTypingIndicator';
      this.messagesArea.appendChild(indicatorElement);
      this.scrollToBottom();
      console.log('[Chat] Typing indicator added to DOM');
    } else {
      console.error('[Chat] Could not find .chat-message.assistant in template');
    }
  }

  /**
   * 타이핑 인디케이터 제거
   */
  hideTypingIndicator() {
    console.log('[Chat] hideTypingIndicator called at', Date.now());
    const indicator = document.getElementById('activeTypingIndicator');
    console.log('[Chat] indicator to remove:', indicator);
    if (indicator) {
      indicator.remove();
      console.log('[Chat] Typing indicator removed');
    }
  }

  /**
   * 메시지 전송
   * @param {string} text - 메시지 내용
   */
  async sendMessage(text, options = {}) {
    const { enableTTS = false, attachments = [] } = options;

    // Add user message (첨부 포함)
    this.addMessage({
      role: 'user',
      content: text,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Show typing indicator
    this.showTypingIndicator();

    // 타임라인 스트리밍 — 생각/메시지/도구가 시간순으로 인터리브
    let streamingEl = null;
    let currentContentSegment = null; // 현재 활성 content 세그먼트 DOM
    let currentSegmentText = ''; // 현재 세그먼트의 축적된 텍스트
    let streamingThinking = '';
    let displayReady = false;
    let pendingChunks = [];
    let delayTimer = null;
    const DISPLAY_DELAY_MS = 2500;

    // 스트리밍 요소 내에 타임라인 이벤트 추가
    const appendTimelineEvent = (type, data) => {
      if (!streamingEl) return;
      const contentEl = streamingEl.querySelector('.message-content');
      if (!contentEl) return;

      if (type === 'thinking') {
        // thinking 컨테이너 — 직접 업데이트 (content 불간섭)
        let thinkingContainer = contentEl.querySelector('.ai-thinking-container');
        if (!thinkingContainer) {
          thinkingContainer = document.createElement('div');
          thinkingContainer.className = 'ai-thinking-container streaming-thinking-live expanded';
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'ai-thinking-toggle';
          toggleBtn.innerHTML = '<span>생각 중...</span>';
          toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.parentElement.classList.toggle('expanded');
          });
          const thinkingContent = document.createElement('div');
          thinkingContent.className = 'ai-thinking-content';
          thinkingContainer.appendChild(toggleBtn);
          thinkingContainer.appendChild(thinkingContent);
          contentEl.insertBefore(thinkingContainer, contentEl.firstChild);
        }
        const thinkingContent = thinkingContainer.querySelector('.ai-thinking-content');
        if (thinkingContent) {
          thinkingContent.textContent = streamingThinking;
          thinkingContent.scrollTop = thinkingContent.scrollHeight;
        }
      } else if (type === 'content') {
        // content 청크 → 현재 세그먼트에 축적
        currentSegmentText += data;
        if (!currentContentSegment) {
          currentContentSegment = document.createElement('div');
          currentContentSegment.className = 'timeline-content-segment';
          contentEl.appendChild(currentContentSegment);
          // 초기 로더 제거
          const oldLoader = contentEl.querySelector(':scope > .typing-dots');
          if (oldLoader) oldLoader.remove();
        }
        // 축적된 텍스트를 렌더링
        const cleanedText = currentSegmentText
          .replace(/\[laughter\]/gi, '')
          .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
          .replace(/ {2,}/g, ' ');
        const processed = this._preprocessMarkdown(cleanedText);
        const rendered = window.marked ? window.marked.parse(processed).trim() : this.escapeHtml(cleanedText);
        currentContentSegment.innerHTML = rendered + '<span class="streaming-cursor"></span>';
      } else if (type === 'content_append') {
        // 도구 실행 후 새 content 세그먼트 시작 (전체 텍스트가 한번에 옴)
        currentContentSegment = document.createElement('div');
        currentContentSegment.className = 'timeline-content-segment';
        currentSegmentText = data;
        contentEl.appendChild(currentContentSegment);
        const cleanedText = data
          .replace(/\[laughter\]/gi, '')
          .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
          .replace(/ {2,}/g, ' ');
        const processed = this._preprocessMarkdown(cleanedText);
        const rendered = window.marked ? window.marked.parse(processed).trim() : this.escapeHtml(cleanedText);
        currentContentSegment.innerHTML = rendered + '<span class="streaming-cursor"></span>';
      } else if (type === 'tool_start') {
        // content 세그먼트 마감 (커서 제거)
        if (currentContentSegment) {
          const cursor = currentContentSegment.querySelector('.streaming-cursor');
          if (cursor) cursor.remove();
          currentContentSegment = null;
          currentSegmentText = '';
        }
        // 도구 실행 인라인 표시
        const toolStep = document.createElement('div');
        toolStep.className = 'timeline-tool-step running';
        toolStep.dataset.toolName = data.name;
        toolStep.innerHTML = `
          <div class="tool-step-indicator"></div>
          <div class="tool-step-content">
            <div class="tool-step-title">${this.escapeHtml(data.koreanAction)}</div>
            ${data.inputSummary ? `<div class="tool-step-desc">${this.escapeHtml(data.inputSummary)}</div>` : ''}
          </div>
        `;
        contentEl.appendChild(toolStep);
      } else if (type === 'tool_end') {
        // running → success/error 전환
        const toolStep = contentEl.querySelector(`.timeline-tool-step.running[data-tool-name="${data.name}"]`);
        if (toolStep) {
          toolStep.classList.remove('running');
          toolStep.classList.add(data.success ? 'success' : 'error');
          toolStep.innerHTML = `
            <div class="tool-step-indicator">${data.success ? '✓' : '✗'}</div>
            <div class="tool-step-content">
              <div class="tool-step-title">${this.escapeHtml(data.koreanAction)}</div>
              ${data.resultPreview ? `<div class="tool-step-desc">${this.escapeHtml(data.resultPreview)}</div>` : ''}
            </div>
          `;
        }
      }
      this.scrollToBottom();
    };

    const flushPendingChunks = () => {
      displayReady = true;
      this.hideTypingIndicator();
      if (!streamingEl) {
        streamingEl = this._createStreamingElement();
        this.messagesArea.appendChild(streamingEl);
      }
      for (const chunk of pendingChunks) {
        if (chunk.event === 'tool_start' || chunk.event === 'tool_end') {
          appendTimelineEvent(chunk.event, chunk.data);
        } else if (chunk.type === 'thinking') {
          streamingThinking += chunk.content;
          appendTimelineEvent('thinking', chunk.content);
        } else if (chunk.type === 'content') {
          appendTimelineEvent('content', chunk.content);
        } else if (chunk.type === 'content_append') {
          appendTimelineEvent('content_append', chunk.content);
        }
      }
      pendingChunks = [];
    };

    const socketClient = window.soulApp?.socketClient;
    if (socketClient) {
      socketClient.setStreamCallback((event, data) => {
        if (event === 'start') {
          if (!displayReady && !streamingEl) {
            delayTimer = setTimeout(flushPendingChunks, DISPLAY_DELAY_MS);
          }
          this.scrollToBottom();
        } else if (event === 'chunk') {
          if (!displayReady) {
            pendingChunks.push(data);
          } else {
            if (data.type === 'thinking') {
              streamingThinking += data.content;
              appendTimelineEvent('thinking', data.content);
            } else if (data.type === 'content') {
              appendTimelineEvent('content', data.content);
            } else if (data.type === 'content_append') {
              appendTimelineEvent('content_append', data.content);
            }
          }
        } else if (event === 'tool_start') {
          if (!displayReady) {
            pendingChunks.push({ event: 'tool_start', data });
          } else {
            appendTimelineEvent('tool_start', data);
          }
        } else if (event === 'tool_end') {
          if (!displayReady) {
            pendingChunks.push({ event: 'tool_end', data });
          } else {
            appendTimelineEvent('tool_end', data);
          }
        } else if (event === 'end') {
          if (!displayReady) {
            clearTimeout(delayTimer);
            if (pendingChunks.length > 0) {
              flushPendingChunks();
            } else {
              displayReady = true;
              this.hideTypingIndicator();
            }
          }
        }
      });
    }

    try {
      // Call API (첨부 정보 포함)
      const response = await this.apiClient.sendMessage(text, { attachments });

      // 딜레이 타이머 정리
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }

      // 스트리밍 콜백 해제
      if (socketClient) socketClient.setStreamCallback(null);

      // Hide typing indicator (먼저 — addMessage 전에)
      this.hideTypingIndicator();

      // 실시간 도구 상태 요소 정리 (addMessage에서 접힌 형태로 다시 표시됨)
      const toolStatusEl = document.querySelector('.tool-execution-status');
      if (toolStatusEl) toolStatusEl.remove();

      // 도구 실행 결과 수집 (접힘 형태로 메시지에 포함)
      let toolItems = [];
      let toolNeeds = [];
      let toolsSelected = [];
      if (window.soulApp?.socketClient) {
        const statusData = window.soulApp.socketClient.getToolStatusItems();
        toolItems = statusData.tools || [];
        toolNeeds = statusData.toolNeeds || [];
        toolsSelected = statusData.toolsSelected || [];
        window.soulApp.socketClient.clearToolStatus();
      }
      // 서버 응답의 toolsUsed에서 검증 데이터 머지
      if (response.toolsUsed?.length > 0) {
        if (toolItems.length === 0) {
          // 실시간 데이터 없으면 서버 데이터 사용
          toolItems = response.toolsUsed.map(t => ({
            name: t.name,
            display: t.display || t.name,
            success: t.success !== false,
            error: t.success === false,
            inputSummary: t.inputSummary || '',
            resultPreview: t.resultPreview || '',
            verificationMemo: t.verificationMemo || null,
            verificationVerdict: t.verificationVerdict || null,
            lieStamp: t.lieStamp || false
          }));
        } else {
          // 실시간 데이터 있으면 서버의 검증 정보만 머지
          for (const serverTool of response.toolsUsed) {
            const match = toolItems.find(t => t.name === serverTool.name && !t.verificationVerdict);
            if (match && serverTool.verificationVerdict) {
              match.verificationMemo = serverTool.verificationMemo;
              match.verificationVerdict = serverTool.verificationVerdict;
              match.lieStamp = serverTool.lieStamp || false;
            }
          }
        }
      }
      // 서버 응답의 toolNeeds/toolsSelected 합침
      if (response.toolNeeds?.length > 0 && toolNeeds.length === 0) {
        toolNeeds = response.toolNeeds;
      }
      if (response.toolsSelected?.length > 0 && toolsSelected.length === 0) {
        toolsSelected = response.toolsSelected;
      }

      // Add assistant response
      const content = response.reply || response.message || '응답을 받지 못했습니다.';
      const messageData = {
        role: 'assistant',
        content: content,
        timestamp: new Date(response.timestamp || Date.now()),
        routing: response.routing || null,
        toolsUsed: toolItems.length > 0 ? toolItems : null,
        timeline: response.timeline || null,
        toolNeeds: toolNeeds.length > 0 ? toolNeeds : null,
        toolsSelected: toolsSelected.length > 0 ? toolsSelected : null,
        filtered: response.filtered || null,
        messageVerify: response.messageVerify || null,
      };

      if (streamingEl && response.timeline) {
        // 타임라인 모드: streamingEl을 그대로 finalize (replaceWith 안 함)
        this.messages.push(messageData);
        streamingEl.classList.remove('streaming');
        // 커서 제거
        const cursors = streamingEl.querySelectorAll('.streaming-cursor');
        cursors.forEach(c => c.remove());
        // 로더 제거
        const loaders = streamingEl.querySelectorAll('.typing-dots');
        loaders.forEach(l => l.remove());
        // thinking 접기
        const thinkingContainer = streamingEl.querySelector('.ai-thinking-container');
        if (thinkingContainer) {
          thinkingContainer.classList.remove('expanded', 'streaming-thinking-live');
          const toggleBtn = thinkingContainer.querySelector('.ai-thinking-toggle span');
          if (toggleBtn) toggleBtn.textContent = '생각 과정';
        }
        // 코드블록 처리
        const contentEl = streamingEl.querySelector('.message-content');
        if (contentEl) {
          this.processCodeBlocks(contentEl, content);
          this.processExternalLinks(contentEl);
        }
        // 라우팅 정보
        if (messageData.routing && messageData.routing.modelId) {
          this._applyRouting(streamingEl, messageData.routing);
        }
        // 액션 버튼 활성화
        const actions = streamingEl.querySelector('.message-actions');
        if (actions) actions.style.display = '';
        this.attachAssistantMessageActions(streamingEl, messageData);
        streamingEl = null;
        this.scrollToBottom();
      } else if (streamingEl) {
        // 타임라인 없음 (도구 미사용): 기존대로 replaceWith
        this.messages.push(messageData);
        const finalElement = this.createMessageElement(messageData);
        finalElement.classList.add('fade-in-up');
        streamingEl.replaceWith(finalElement);
        streamingEl = null;
        this.scrollToBottom();
      } else {
        // 스트리밍 요소 없으면 (비스트리밍 모드) → 기존대로 append
        this.addMessage(messageData);
      }

      // system fallback 알림 (일시적, 저장 안 됨)
      if (response.systemFallback) {
        this.showToast(`system→user 변환됨 (${response.routing?.modelId || 'unknown'})`, 5000);
      }

      // 대시보드 실시간 업데이트 (마지막 요청 정보)
      if (response.tokenUsage) {
        dashboardManager.updateLastRequest(response.tokenUsage);
      }

      // 대시보드 통계 갱신
      dashboardManager.refresh();

      // TTS: 설정에서 켜져있거나 실시간 모드면 응답 읽어주기
      if ((this.tts.enabled || enableTTS) && content) {
        try {
          await this.tts.speak(content, { force: enableTTS });
        } catch (ttsErr) {
          console.warn('[Chat] TTS failed:', ttsErr);
        }
      }
    } catch (error) {
      // 딜레이 타이머 & 스트리밍 정리
      if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
      if (socketClient) socketClient.setStreamCallback(null);
      if (streamingEl) { streamingEl.remove(); streamingEl = null; }

      // Hide typing indicator
      this.hideTypingIndicator();

      // 도구 실행 결과 수집 (에러 시에도 보존)
      let errorToolItems = [];
      let errorToolNeeds = [];
      let errorToolsSelected = [];
      if (window.soulApp?.socketClient) {
        const errorStatusData = window.soulApp.socketClient.getToolStatusItems();
        errorToolItems = errorStatusData.tools || [];
        errorToolNeeds = errorStatusData.toolNeeds || [];
        errorToolsSelected = errorStatusData.toolsSelected || [];
        window.soulApp.socketClient.clearToolStatus();
      }

      // 오류 유형에 따른 친절한 메시지
      let errorContent;
      const errorMsg = error.message || '';

      if (errorMsg.includes('timeout') || errorMsg.includes('Request timeout')) {
        errorContent = '⏱️ 응답 시간이 너무 오래 걸렸어요. 다시 시도해주세요.';
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        errorContent = '🌐 네트워크 연결에 문제가 있어요. 인터넷 연결을 확인해주세요.';
      } else if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
        // 서버 에러 메시지에서 실제 내용 추출하여 표시
        const detail = errorMsg.replace(/^HTTP \d+:\s*/, '').trim();
        errorContent = `🔧 서버에 문제가 발생했어요.\n\n📋 ${detail || '일시적인 오류'}`;
      } else {
        errorContent = `😅 메시지 전송 중 문제가 발생했어요.\n\n📋 ${errorMsg.substring(0, 300) || '알 수 없는 오류'}`;
      }

      // Add error message
      this.addMessage({
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        toolsUsed: errorToolItems.length > 0 ? errorToolItems : null,
        toolNeeds: errorToolNeeds.length > 0 ? errorToolNeeds : null,
        toolsSelected: errorToolsSelected.length > 0 ? errorToolsSelected : null,
      });

      console.error('메시지 전송 실패:', error);
    }
  }

  /**
   * 메시지 목록 초기화
   */
  clearMessages() {
    this.messages = [];
    this.messagesArea.innerHTML = '';
  }

  /**
   * 메시지 영역 스크롤
   */
  scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      // overflow가 설정된 부모 컨테이너(.right-card-top)를 스크롤
      const scrollContainer = this.messagesArea.closest('.right-card-top') || this.messagesArea.parentElement;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }

  /**
   * 스트리밍용 임시 메시지 요소 생성 (assistantMessageTemplate 클론)
   */
  _createStreamingElement() {
    const template = this.assistantMessageTemplate.content.cloneNode(true);
    const el = template.querySelector('.chat-message.assistant');
    el.classList.add('streaming');

    // message-content에 커서만 추가
    const content = el.querySelector('.message-content');
    content.innerHTML = '<div class="typing-dots"><div class="os1-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';

    // 스트리밍 중에는 액션 버튼 숨김
    const actions = el.querySelector('.message-actions');
    if (actions) actions.style.display = 'none';

    return el;
  }

  /**
   * 마크다운 전처리 — 모델별 줄바꿈 부족 보정
   */
  _preprocessMarkdown(text) {
    if (!text) return text;
    let result = text;

    // 1) 줄바꿈이 거의 없는 긴 텍스트 보정 (모델 무관)
    //    200자 이상인데 \n이 거의 없으면 문장 끝(? !) 뒤에 줄바꿈 삽입
    const ratio = result.length / (result.split('\n').length);
    if (result.length > 200 && ratio > 150) {
      // 마크다운 요소(코드블록, 링크 등) 밖에서만 처리
      // 문장 끝(. ? !) 뒤 공백 + 다음 문장
      // 마침표: 한글/이모지/닫는괄호 뒤의 . 만 문장 끝으로 판단 (숫자.숫자, URL 제외)
      result = result.replace(/([가-힣)）\]】])\.\s+(?=[가-힣a-zA-Z*\[("'])/g, '$1.\n\n');
      result = result.replace(/([?!])\s+(?=[가-힣a-zA-Z\*\[])/g, '$1\n\n');
      // ㅋㅋ, ㅎㅎ 등 반복 후 공백 + 다음 문장
      result = result.replace(/(ㅋ{2,}|ㅎ{2,})\s+(?=[가-힣a-zA-Z\*\[])/g, '$1\n\n');
      // 🌙😊🤔 등 이모지 뒤 공백 + 다음 문장
      result = result.replace(/([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}])\s+(?=[가-힣a-zA-Z\*\[])/gu, '$1\n\n');
    }

    // 2) 한글 bold를 marked가 인식 못하는 경우 직접 변환
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 3) --- 앞뒤에 빈 줄 확보 (hr 렌더링용)
    result = result.replace(/([^\n])\n?---/g, '$1\n\n---');
    result = result.replace(/---\n?([^\n])/g, '---\n\n$1');
    // 4) 번호 리스트 앞에 빈 줄 확보 (1. 2. 3.)
    result = result.replace(/([^\n])\n?((\d+)\. )/g, '$1\n\n$2');
    // 5) → 화살표 앞에 줄바꿈
    result = result.replace(/([^\n])\n?(→ )/g, '$1\n\n$2');
    // 6) 이모지로 시작하는 소제목 앞에 줄바꿈 (🎨 디자인 분석: 같은 패턴)
    //    이모지 + 텍스트 + 콜론(:)이 있는 소제목만 잡음 (문장 중간 이모지는 제외)
    result = result.replace(/([^\n])\s*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*[가-힣a-zA-Z][^:\n]{0,30}:)/gu, '$1\n\n$2');
    return result;
  }

  /**
   * 스트리밍 메시지 요소 실시간 업데이트
   */
  _updateStreamingElement(el, thinkingText, contentText) {
    const contentEl = el.querySelector('.message-content');
    if (!contentEl) return;

    // thinking 컨테이너 (기존 ai-thinking-container 스타일 재사용)
    let thinkingContainer = contentEl.querySelector('.ai-thinking-container');
    if (thinkingText) {
      if (!thinkingContainer) {
        thinkingContainer = document.createElement('div');
        thinkingContainer.className = 'ai-thinking-container streaming-thinking-live';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ai-thinking-toggle';
        toggleBtn.innerHTML = '💭 <span>생각 중...</span>';
        toggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.parentElement.classList.toggle('expanded');
        });

        const thinkingContent = document.createElement('div');
        thinkingContent.className = 'ai-thinking-content';

        thinkingContainer.appendChild(toggleBtn);
        thinkingContainer.appendChild(thinkingContent);
        contentEl.insertBefore(thinkingContainer, contentEl.firstChild);

        // 스트리밍 중에는 자동 펼침
        thinkingContainer.classList.add('expanded');
      }
      // 실시간 업데이트
      const thinkingContent = thinkingContainer.querySelector('.ai-thinking-content');
      if (thinkingContent) {
        thinkingContent.textContent = thinkingText;
        // 스크롤 아래로
        thinkingContent.scrollTop = thinkingContent.scrollHeight;
      }
    }

    // content 영역 업데이트 (thinking 컨테이너 뒤에)
    let contentArea = contentEl.querySelector('.streaming-text-area');
    if (contentText) {
      if (!contentArea) {
        contentArea = document.createElement('div');
        contentArea.className = 'streaming-text-area';
        contentEl.appendChild(contentArea);
        // 초기 로더/커서 제거 (streaming-text-area 안에 새 커서가 들어가므로)
        const oldLoader = contentEl.querySelector(':scope > .typing-dots');
        if (oldLoader) oldLoader.remove();
        const oldCursor = contentEl.querySelector(':scope > .streaming-cursor');
        if (oldCursor) oldCursor.remove();
      }

      let rendered = '';
      const cleanedText = contentText
        .replace(/\[laughter\]/gi, '')
        .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
        .replace(/ {2,}/g, ' ');
      if (window.marked) {
        const processed = this._preprocessMarkdown(cleanedText);
        rendered = window.marked.parse(processed).trim();
      } else {
        rendered = this.escapeHtml(cleanedText);
      }
      contentArea.innerHTML = rendered + '<span class="streaming-cursor"></span>';
    } else {
      // content가 아직 없으면 로더 유지
      if (!contentArea) {
        // thinking 뒤에 로더
        const existingLoader = contentEl.querySelector('.typing-dots');
        if (!existingLoader) {
          const existingCursor = contentEl.querySelector('.streaming-cursor');
          if (existingCursor) existingCursor.remove();
          contentEl.insertAdjacentHTML('beforeend', '<div class="typing-dots"><div class="os1-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>');
        }
      }
    }
  }

  /**
   * 라우팅 정보를 메시지 요소에 적용
   */
  _applyRouting(messageDiv, routing) {
    if (!routing || !routing.modelId) return;
    const routingInfo = messageDiv.querySelector('.routing-info');
    if (!routingInfo) return;

    const tierSpan = routingInfo.querySelector('.routing-tier');
    const modelSpan = routingInfo.querySelector('.routing-model');
    const tierLabels = { light: '경량', medium: '중간', heavy: '고성능', single: '단일' };

    let tier = routing.tier;
    if (!tier) {
      const modelId = routing.modelId.toLowerCase();
      tier = 'medium';
      if (modelId.includes('haiku') || modelId.includes('mini') || modelId.includes('fast') || modelId.includes('nano') || modelId.includes('flash-lite')) {
        tier = 'light';
      } else if (modelId.includes('opus') || modelId.includes('pro') || modelId.includes('gpt-5') || modelId.includes('o3') || modelId.includes('o1')) {
        tier = 'heavy';
      }
    }

    tierSpan.textContent = tierLabels[tier] || tierLabels.medium;
    tierSpan.classList.add(tier);
    const modelName = routing.selectedModel || dashboardManager.getModelDisplayName(routing.modelId);
    modelSpan.textContent = modelName;
    routingInfo.title = `${tierLabels[tier] || '중간'} | ${modelName}`;
    routingInfo.dataset.active = 'true';
    routingInfo.dataset.tier = tier;
  }

  /**
   * 타임라인 렌더링 — 히스토리에서 로드된 메시지용
   */
  _renderTimeline(contentEl, message) {
    const koreanActions = {
      'recall_memory': '기억 검색',
      'get_profile': '프로필 조회',
      'update_profile': '정보 저장',
      'list_my_rules': '규칙 조회',
      'add_my_rule': '규칙 저장',
      'delete_my_rule': '규칙 삭제',
      'send_message': '메시지 전송',
      'schedule_message': '메시지 예약',
      'cancel_scheduled_message': '예약 취소',
      'list_scheduled_messages': '예약 목록',
      'execute_command': '명령 실행',
      'save_memory': '기억 저장',
      'update_memory': '기억 수정',
      'list_memories': '기억 목록',
      'update_tags': '태그 수정',
      'search_web': '웹 검색',
      'read_url': 'URL 읽기'
    };

    for (const entry of message.timeline) {
      if (entry.type === 'thinking') {
        // thinking 컨테이너
        const thinkingContainer = document.createElement('div');
        thinkingContainer.className = 'ai-thinking-container';
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ai-thinking-toggle';
        toggleBtn.innerHTML = '<span>생각 과정</span>';
        toggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.parentElement.classList.toggle('expanded');
        });
        const thinkingContent = document.createElement('div');
        thinkingContent.className = 'ai-thinking-content';
        thinkingContent.textContent = entry.content;
        thinkingContainer.appendChild(toggleBtn);
        thinkingContainer.appendChild(thinkingContent);
        contentEl.appendChild(thinkingContainer);
      } else if (entry.type === 'content') {
        const segment = document.createElement('div');
        segment.className = 'timeline-content-segment';
        const cleanedText = (entry.content || '')
          .replace(/\[laughter\]/gi, '')
          .replace(/\{need\}\s*.+?(?:\n|$)/g, '')
          .replace(/ {2,}/g, ' ');
        const processed = this._preprocessMarkdown(cleanedText);
        segment.innerHTML = window.marked ? window.marked.parse(processed).trim() : this.escapeHtml(cleanedText);
        contentEl.appendChild(segment);
      } else if (entry.type === 'tool') {
        const toolStep = document.createElement('div');
        toolStep.className = `timeline-tool-step ${entry.success ? 'success' : 'error'}`;
        const actionName = koreanActions[entry.name] || entry.display || entry.name;
        toolStep.innerHTML = `
          <div class="tool-step-indicator">${entry.success ? '✓' : '✗'}</div>
          <div class="tool-step-content">
            <div class="tool-step-title">${this.escapeHtml(actionName)}</div>
            ${entry.inputSummary ? `<div class="tool-step-desc">${this.escapeHtml(entry.inputSummary)}</div>` : ''}
          </div>
        `;
        contentEl.appendChild(toolStep);
      }
    }
  }

  /**
   * 시간 포맷
   * @param {Date|string} date
   * @returns {string}
   */
  formatTime(date) {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 날짜 + 시간 포맷
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateTime(date) {
    const d = new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  /**
   * HTML 이스케이프
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  /**
   * 날짜 포맷 (상대 시간)
   * @param {Date|string} date
   * @returns {string}
   */
  formatRelativeTime(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  }

  /**
   * 메시지 검색
   * @param {string} query
   * @returns {Array}
   */
  searchMessages(query) {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(msg =>
      msg.content.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 대화 내보내기 (텍스트)
   * @returns {string}
   */
  exportToText() {
    return this.messages
      .map(msg => {
        const time = this.formatTime(msg.timestamp);
        const author = msg.role === 'user' ? '나' : 'Soul';
        return `[${time}] ${author}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * 대화 내보내기 (JSON)
   * @returns {string}
   */
  exportToJSON() {
    return JSON.stringify(this.messages, null, 2);
  }

  /**
   * 메시지 수 가져오기
   * @returns {number}
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * 마지막 메시지 가져오기
   * @returns {Object|null}
   */
  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }

  showToast(text, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'chat-toast';
    toast.textContent = text;
    const container = this.chatContainer || document.querySelector('.chat-messages');
    if (container) {
      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }
}
