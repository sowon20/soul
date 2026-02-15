/**
 * chat-simple.js
 * 간단한 AI 테스트용 엔드포인트 (파이프라인 우회)
 */

const express = require('express');
const router = express.Router();
const { AIServiceFactory } = require('../utils/ai-service');

/**
 * POST /api/chat-simple
 * 최소한의 AI 호출 테스트
 */
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // AI 서비스 생성 (설정에서 가져옴)
    const aiService = await AIServiceFactory.createService();

    // 간단한 메시지 배열
    const messages = [
      { role: 'user', content: message }
    ];

    // AI 호출
    const aiResponse = await aiService.chat(messages, {
      systemPrompt: '당신은 친절한 AI 어시스턴트입니다.',
      maxTokens: 2000,
      temperature: 1.0
    });

    res.json({
      success: true,
      message: aiResponse,
      reply: aiResponse
    });
  } catch (error) {
    console.error('Error in chat-simple endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
