/**
 * notifications.js
 * 알림 API 라우트
 *
 * Week 2: Proactive Messaging
 *
 * 엔드포인트:
 * - 알림 조회
 * - 알림 읽음/무시/삭제
 * - 안부 인사
 * - 이벤트 리스너 관리
 */

const express = require('express');
const router = express.Router();
const {
  getNotificationManager,
  NOTIFICATION_TYPE,
  NOTIFICATION_PRIORITY
} = require('../utils/notification-manager');
const { getGreetingSystem } = require('../utils/greeting-system');
const { getEventListener } = require('../utils/event-listener');
const { getProactiveMessenger } = require('../utils/proactive-messenger');

/**
 * GET /api/notifications
 * 알림 목록 조회
 */
router.get('/', (req, res) => {
  try {
    const {
      status = null,
      type = null,
      sessionId = null,
      limit = '50',
      offset = '0'
    } = req.query;

    const notificationManager = getNotificationManager();

    const result = notificationManager.getAll({
      status,
      type,
      sessionId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/:notificationId
 * 특정 알림 조회
 */
router.get('/:notificationId', (req, res) => {
  try {
    const { notificationId } = req.params;

    const notificationManager = getNotificationManager();
    const notification = notificationManager.get(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error getting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications
 * 알림 생성
 */
router.post('/', async (req, res) => {
  try {
    const {
      type,
      priority,
      title,
      message,
      data = {},
      sessionId = null,
      expiresAt = null,
      autoSend = false
    } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, and message are required'
      });
    }

    if (!Object.values(NOTIFICATION_TYPE).includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid notification type. Must be one of: ${Object.values(NOTIFICATION_TYPE).join(', ')}`
      });
    }

    const notificationManager = getNotificationManager();

    const notification = notificationManager.create({
      type,
      priority: priority || NOTIFICATION_PRIORITY.NORMAL,
      title,
      message,
      data,
      sessionId,
      expiresAt
    });

    // 자동 전송
    if (autoSend) {
      await notificationManager.send(notification.id);
    }

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/:notificationId/send
 * 알림 전송
 */
router.post('/:notificationId/send', async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notificationManager = getNotificationManager();
    const success = await notificationManager.send(notificationId);

    res.json({
      success: true,
      sent: success
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/send-all
 * 모든 대기 중인 알림 전송
 */
router.post('/send-all', async (req, res) => {
  try {
    const notificationManager = getNotificationManager();
    const results = await notificationManager.sendAll();

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error sending all notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/:notificationId/read
 * 알림 읽음 처리
 */
router.put('/:notificationId/read', (req, res) => {
  try {
    const { notificationId } = req.params;

    const notificationManager = getNotificationManager();
    const notification = notificationManager.markAsRead(notificationId);

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/:notificationId/dismiss
 * 알림 무시
 */
router.put('/:notificationId/dismiss', (req, res) => {
  try {
    const { notificationId } = req.params;

    const notificationManager = getNotificationManager();
    const notification = notificationManager.dismiss(notificationId);

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:notificationId
 * 알림 삭제
 */
router.delete('/:notificationId', (req, res) => {
  try {
    const { notificationId } = req.params;

    const notificationManager = getNotificationManager();
    const deleted = notificationManager.delete(notificationId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/stats
 * 알림 통계
 */
router.get('/stats/summary', (req, res) => {
  try {
    const notificationManager = getNotificationManager();
    const stats = notificationManager.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/greeting
 * 안부 인사 생성
 */
router.post('/greeting', async (req, res) => {
  try {
    const { sessionId = 'main-conversation', force = false } = req.body;

    const greetingSystem = getGreetingSystem();
    const greeting = await greetingSystem.generateGreeting(sessionId, {
      force
    });

    if (!greeting) {
      return res.json({
        success: true,
        greeting: null,
        message: 'No greeting needed (too soon)'
      });
    }

    res.json({
      success: true,
      greeting
    });
  } catch (error) {
    console.error('Error generating greeting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/greeting/auto
 * 자동 안부 인사 (알림으로 전송)
 */
router.post('/greeting/auto', async (req, res) => {
  try {
    const { sessionId = 'main-conversation' } = req.body;

    const greetingSystem = getGreetingSystem();
    const notification = await greetingSystem.sendAutoGreeting(sessionId);

    if (!notification) {
      return res.json({
        success: true,
        notification: null,
        message: 'No greeting needed (too soon)'
      });
    }

    res.json({
      success: true,
      notification: notification.toJSON()
    });
  } catch (error) {
    console.error('Error sending auto greeting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/greeting/pattern/:sessionId
 * 사용자 활동 패턴 조회
 */
router.get('/greeting/pattern/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const greetingSystem = getGreetingSystem();
    const pattern = greetingSystem.getUserPattern(sessionId);

    if (!pattern) {
      return res.json({
        success: true,
        pattern: null,
        message: 'No pattern learned yet'
      });
    }

    res.json({
      success: true,
      pattern
    });
  } catch (error) {
    console.error('Error getting user pattern:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/greeting/learn/:sessionId
 * 사용자 선호 시간대 학습
 */
router.post('/greeting/learn/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const greetingSystem = getGreetingSystem();
    const pattern = await greetingSystem.learnUserPreferences(sessionId);

    if (!pattern) {
      return res.json({
        success: true,
        pattern: null,
        message: 'Not enough data to learn pattern'
      });
    }

    res.json({
      success: true,
      pattern
    });
  } catch (error) {
    console.error('Error learning user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/greeting/stats
 * 안부 시스템 통계
 */
router.get('/greeting/stats/summary', (req, res) => {
  try {
    const greetingSystem = getGreetingSystem();
    const stats = greetingSystem.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting greeting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/events/start
 * 이벤트 리스너 시작
 */
router.post('/events/start', (req, res) => {
  try {
    const eventListener = getEventListener();
    eventListener.start();

    res.json({
      success: true,
      message: 'EventListener started'
    });
  } catch (error) {
    console.error('Error starting event listener:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/events/stop
 * 이벤트 리스너 중지
 */
router.post('/events/stop', (req, res) => {
  try {
    const eventListener = getEventListener();
    eventListener.stop();

    res.json({
      success: true,
      message: 'EventListener stopped'
    });
  } catch (error) {
    console.error('Error stopping event listener:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/events/stats
 * 이벤트 리스너 통계
 */
router.get('/events/stats', (req, res) => {
  try {
    const eventListener = getEventListener();
    const stats = eventListener.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting event listener stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/events/session-start
 * 세션 시작 알림 트리거
 */
router.post('/events/session-start', async (req, res) => {
  try {
    const { sessionId = 'main-conversation' } = req.body;

    const eventListener = getEventListener();
    await eventListener.notifySessionStart(sessionId);

    res.json({
      success: true,
      message: 'Session start event triggered'
    });
  } catch (error) {
    console.error('Error triggering session start:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/send
 * 즉시 메시지 발송 (선제 메시지 테스트용)
 */
router.post('/send', async (req, res) => {
  try {
    const { type = 'custom', title = '', message, priority = 'normal', action = null } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    const messenger = await getProactiveMessenger();
    if (!messenger) {
      return res.status(500).json({
        success: false,
        error: 'ProactiveMessenger not initialized'
      });
    }

    const result = await messenger.sendNow({ type, title, message, priority, action });

    res.json({
      success: result,
      message: result ? 'Message sent' : 'Failed to send'
    });
  } catch (error) {
    console.error('Error sending proactive message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
