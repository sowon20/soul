/**
 * conversation-flow.js
 * 대화 흐름 추적 (Phase 1.6.6)
 * 
 * 역할:
 * - 현재 주제 추적
 * - 대화 강도 계산
 * - 흐름 요약 생성
 */

class ConversationFlowTracker {
  constructor() {
    this.currentTopic = null;
    this.topicStartTime = null;
    this.topicMessageCount = 0;
    this.recentTopics = [];  // 최근 주제들
    this.messageTimestamps = [];  // 메시지 시간 기록 (강도 계산용)
  }

  /**
   * 메시지 처리
   */
  processMessage(message, detectedTopic = null) {
    const now = Date.now();
    this.messageTimestamps.push(now);
    
    // 1시간 이상 지난 타임스탬프 제거
    const oneHourAgo = now - 3600000;
    this.messageTimestamps = this.messageTimestamps.filter(t => t > oneHourAgo);

    // 주제 변경 감지
    if (detectedTopic && detectedTopic !== this.currentTopic) {
      // 이전 주제 저장
      if (this.currentTopic) {
        this.recentTopics.push({
          topic: this.currentTopic,
          duration: now - this.topicStartTime,
          messageCount: this.topicMessageCount
        });
        // 최근 5개만 유지
        if (this.recentTopics.length > 5) {
          this.recentTopics.shift();
        }
      }
      
      // 새 주제 시작
      this.currentTopic = detectedTopic;
      this.topicStartTime = now;
      this.topicMessageCount = 1;
    } else {
      this.topicMessageCount++;
    }
  }

  /**
   * 대화 강도 계산
   */
  getIntensity() {
    const messagesPerHour = this.messageTimestamps.length;
    
    let level;
    if (messagesPerHour < 5) level = 'low';
    else if (messagesPerHour < 15) level = 'normal';
    else if (messagesPerHour < 30) level = 'active';
    else level = 'intense';

    return {
      messagesPerHour,
      level,
      description: this._intensityDescription(level, messagesPerHour)
    };
  }

  /**
   * 흐름 요약 생성
   */
  getSummary() {
    const now = Date.now();
    const intensity = this.getIntensity();
    
    const summary = {
      currentTopic: this.currentTopic,
      topicDuration: this.topicStartTime ? now - this.topicStartTime : 0,
      topicDurationFormatted: this.topicStartTime 
        ? this._formatDuration(now - this.topicStartTime) 
        : null,
      topicMessageCount: this.topicMessageCount,
      intensity,
      recentTopics: this.recentTopics.map(t => t.topic)
    };

    return summary;
  }

  /**
   * 프롬프트용 문자열 생성
   */
  buildPromptSection() {
    const summary = this.getSummary();
    const parts = [];

    if (summary.currentTopic && summary.topicDuration > 1800000) {  // 30분 이상
      parts.push(`- 현재 주제: "${summary.currentTopic}" (${summary.topicDurationFormatted}째)`);
    }

    if (summary.topicMessageCount > 20) {
      parts.push(`- 메시지 수: ${summary.topicMessageCount}개 (긴 대화)`);
    }

    if (summary.intensity.level === 'intense') {
      parts.push(`- 대화 강도: 매우 활발 (시간당 ${summary.intensity.messagesPerHour}개)`);
    } else if (summary.intensity.level === 'active') {
      parts.push(`- 대화 강도: 활발`);
    }

    if (summary.recentTopics.length > 1) {
      parts.push(`- 이전 주제들: ${summary.recentTopics.slice(-3).join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  /**
   * 강도 설명
   */
  _intensityDescription(level, count) {
    switch (level) {
      case 'low': return '느긋한 대화';
      case 'normal': return '일반적인 대화';
      case 'active': return '활발한 대화';
      case 'intense': return `빠른 대화 (시간당 ${count}개)`;
      default: return '';
    }
  }

  /**
   * 시간 포맷
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return '방금';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  }

  /**
   * 리셋 (새 세션)
   */
  reset() {
    this.currentTopic = null;
    this.topicStartTime = null;
    this.topicMessageCount = 0;
    this.recentTopics = [];
    this.messageTimestamps = [];
  }
}

// 싱글톤
let globalFlowTracker = null;

function getConversationFlowTracker() {
  if (!globalFlowTracker) {
    globalFlowTracker = new ConversationFlowTracker();
  }
  return globalFlowTracker;
}

function resetConversationFlowTracker() {
  globalFlowTracker = null;
}

module.exports = {
  ConversationFlowTracker,
  getConversationFlowTracker,
  resetConversationFlowTracker
};
