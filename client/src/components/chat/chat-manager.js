/**
 * Chat Manager
 * 채팅 메시지 관리 및 렌더링 (Claude Style)
 */

import dashboardManager from '../../utils/dashboard-manager.js';

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
   * 최근 메시지 로드 (초기 로딩, 마지막 대화 위치)
   */
  async loadRecentMessages(limit = 50) {
    try {
      const history = await this.apiClient.getConversationHistory(this.conversationId, { limit });

      if (history && history.messages && history.messages.length > 0) {
        // 메시지 배열에 추가
        this.messages = history.messages;
        this.oldestMessageId = history.messages[0].id;
        this.oldestMessageTimestamp = history.messages[0].timestamp;

        // DOM에 렌더링
        history.messages.forEach(message => {
          const messageElement = this.createMessageElement(message);
          this.messagesArea.appendChild(messageElement);
        });

        // 맨 아래로 스크롤
        this.scrollToBottom(false);
        
        // 더 불러올 메시지가 있는지 확인
        this.hasMoreHistory = history.messages.length >= limit;
      } else {
        this.hasMoreHistory = false;
      }

      // 로딩 완료 표시
      this.messagesArea.classList.add('loaded');
    } catch (error) {
      console.error('최근 메시지 로드 실패:', error);
      // 실패해도 로딩 완료 표시 (데모 메시지 보이게)
      this.messagesArea.classList.add('loaded');
      // 실패하면 환영 메시지 표시
      this.addWelcomeMessage();
    }
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
    console.log('[Chat] addMessage called:', message.role, message.content?.substring(0, 50));
    console.trace('[Chat] addMessage stack trace');
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

      // Set content
      const content = messageDiv.querySelector('.message-content');
      content.textContent = message.content;

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
      
      // thinking 태그 분리
      let displayContent = message.content;
      const thinkingMatch = message.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
      if (thinkingMatch) {
        displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
      }
      
      // tool_use 태그 분리
      displayContent = displayContent.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim();
      
      const renderedContent = window.marked ? window.marked.parse(displayContent) : this.escapeHtml(displayContent);
      content.innerHTML = renderedContent;

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

      // tool_use 태그 처리 (MCP 도구 사용 표시)
      const toolUseMatches = message.content.matchAll(/<tool_use>([\s\S]*?)<\/tool_use>/g);
      for (const toolMatch of toolUseMatches) {
        const toolText = toolMatch[1].trim();
        const toolLines = toolText.split('\n').filter(l => l.trim());
        
        // 도구 사용 컨테이너
        const toolContainer = document.createElement('div');
        toolContainer.className = 'ai-tool-container';
        
        // 토글 버튼
        const toolToggleBtn = document.createElement('button');
        toolToggleBtn.type = 'button';
        toolToggleBtn.className = 'ai-tool-toggle';
        toolToggleBtn.innerHTML = `🔧 <span>도구 사용 (${toolLines.length}개)</span>`;
        toolToggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.parentElement.classList.toggle('expanded');
        });
        
        // 도구 내용 (파싱해서 예쁘게)
        const toolContent = document.createElement('div');
        toolContent.className = 'ai-tool-content';
        
        toolLines.forEach(line => {
          const parts = line.split('|');
          const toolItem = document.createElement('div');
          toolItem.className = 'ai-tool-item';
          
          if (parts.length >= 2) {
            // 새 포맷: 이름|입력|결과
            const [name, input, result] = parts;
            toolItem.innerHTML = `
              <div class="tool-name">${name}</div>
              <div class="tool-input">${input || ''}</div>
              ${result ? `<div class="tool-result">${result.substring(0, 100)}${result.length > 100 ? '...' : ''}</div>` : ''}
            `;
          } else {
            // 구 포맷
            toolItem.textContent = line;
          }
          
          toolContent.appendChild(toolItem);
        });
        
        toolContainer.appendChild(toolToggleBtn);
        toolContainer.appendChild(toolContent);
        content.insertBefore(toolContainer, content.firstChild);
      }

      // Process code blocks - add copy button and syntax highlighting
      this.processCodeBlocks(content, message.content);

      // Process external links - add popup handler
      this.processExternalLinks(content);

      // 라우팅 정보 표시 (있는 경우만)
      if (message.routing && message.routing.modelId) {
        const routingInfo = messageDiv.querySelector('.routing-info');
        if (routingInfo) {
          const tierSpan = routingInfo.querySelector('.routing-tier');
          const modelSpan = routingInfo.querySelector('.routing-model');

          // tier 레이블
          const tierLabels = {
            light: '경량',
            medium: '중간',
            heavy: '고성능'
          };

          // modelId에서 tier 추정
          const modelId = message.routing.modelId.toLowerCase();
          let tier = 'medium';
          if (modelId.includes('haiku') || modelId.includes('mini') || modelId.includes('fast') || modelId.includes('nano') || modelId.includes('flash-lite')) {
            tier = 'light';
          } else if (modelId.includes('opus') || modelId.includes('pro') || modelId.includes('gpt-5') || modelId.includes('o3') || modelId.includes('o1')) {
            tier = 'heavy';
          }

          const tierLabel = tierLabels[tier] || tierLabels.medium;
          tierSpan.textContent = tierLabel;
          modelSpan.textContent = message.routing.modelId;

          // title에 상세 정보
          routingInfo.title = `${tierLabel} | ${message.routing.modelId}`;
          // data 속성으로 활성화 (CSS에서 호버 시 표시)
          routingInfo.dataset.active = 'true';
        }
      }

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

      console.log('🔍 bindExistingMessages - assistant 메시지:', {
        copyBtn: !!copyBtn,
        likeBtn: !!likeBtn,
        dislikeBtn: !!dislikeBtn,
        bookmarkBtn: !!bookmarkBtn,
        retryBtn: !!retryBtn
      });

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

      console.log('🔍 bindExistingMessages - user 메시지:', {
        copyBtn: !!copyBtn,
        editBtn: !!editBtn,
        deleteBtn: !!deleteBtn,
        retryBtn: !!retryBtn
      });

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
  async sendMessage(text) {
    // Add user message
    this.addMessage({
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Call API
      const response = await this.apiClient.sendMessage(text);
      console.log('[Chat] API response:', response);

      // Hide typing indicator
      this.hideTypingIndicator();
      
      // 도구 실행 상태 영역 제거
      if (window.soulApp?.socketClient) {
        window.soulApp.socketClient.clearToolStatus();
      }

      // Add assistant response
      const content = response.reply || response.message || '응답을 받지 못했습니다.';
      console.log('[Chat] Adding assistant message:', content);
      this.addMessage({
        role: 'assistant',
        content: content,
        timestamp: new Date(response.timestamp || Date.now()),
        routing: response.routing || null,
      });

      // 대시보드 통계 갱신
      dashboardManager.refresh();
    } catch (error) {
      // Hide typing indicator
      this.hideTypingIndicator();
      
      // 도구 실행 상태 영역 제거
      if (window.soulApp?.socketClient) {
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
        errorContent = '🔧 서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.';
      } else {
        errorContent = '😅 메시지 전송 중 문제가 발생했어요. 다시 시도해주세요.';
      }

      // Add error message
      this.addMessage({
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
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
}
