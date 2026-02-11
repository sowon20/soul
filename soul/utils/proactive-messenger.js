/**
 * proactive-messenger.js
 * 선제 메시지 발송 인프라
 *
 * 소울이가 send_message / schedule_message 도구로 직접 보내는 메시지를
 * Socket.io를 통해 클라이언트에 전달하는 역할만 담당.
 *
 * 언제, 무슨 말을 할지는 소울이가 판단한다.
 * 하드코딩된 조건/메시지 없음.
 */

class ProactiveMessenger {
  constructor(io) {
    this.io = io;
    this.active = false;
  }

  /**
   * 활성화 (소울이한테 선제 메시지 도구 제공)
   */
  start() {
    this.active = true;
    console.log('[ProactiveMessenger] Active — 소울이가 먼저 말 걸 수 있음');
  }

  /**
   * 비활성화
   */
  stop() {
    this.active = false;
    console.log('[ProactiveMessenger] Inactive');
  }

  /**
   * 즉시 메시지 발송 (소울이 send_message 도구에서 호출)
   */
  async sendNow({ type = 'ai_initiated', title = '', message, priority = 'normal', action = null }) {
    if (!this.io) {
      console.error('[ProactiveMessenger] Socket.io not initialized');
      return false;
    }

    this.io.emit('proactive_message', {
      type,
      title,
      message,
      priority,
      action,
      timestamp: new Date().toISOString()
    });

    console.log(`[ProactiveMessenger] Sent: "${message}"`);
    return true;
  }
}

// 싱글톤
let globalMessenger = null;

async function getProactiveMessenger(io) {
  if (!globalMessenger) {
    if (!io) {
      // io 없이 호출된 경우 (도구 실행 시) — 글로벌에서 가져오기
      io = global.io;
    }
    if (!io) {
      throw new Error('[ProactiveMessenger] Socket.io instance required');
    }
    globalMessenger = new ProactiveMessenger(io);
  }
  return globalMessenger;
}

function resetProactiveMessenger() {
  if (globalMessenger) {
    globalMessenger.stop();
  }
  globalMessenger = null;
}

function isProactiveActive() {
  return globalMessenger !== null && globalMessenger.active === true;
}

module.exports = {
  ProactiveMessenger,
  getProactiveMessenger,
  resetProactiveMessenger,
  isProactiveActive
};
