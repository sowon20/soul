const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * GET /api/billing/fireworks
 * Fireworks 잔액 조회 (firectl account get)
 */
router.get('/fireworks', async (req, res) => {
  try {
    const { stdout } = await execAsync('firectl account get', {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });

    // "Balance: USD 5.99" 파싱
    const balanceMatch = stdout.match(/Balance:\s*USD\s*([\d.]+)/i);
    const balance = balanceMatch ? parseFloat(balanceMatch[1]) : null;

    // 초기 크레딧 자동 감지 (처음 조회 시 현재 잔액을 저장)
    const db = require('../db');
    if (!db.db) db.init();

    const fireworksService = db.db.prepare(
      'SELECT config FROM ai_services WHERE service_id = ?'
    ).get('fireworks');

    let config = {};
    try {
      config = fireworksService?.config ? JSON.parse(fireworksService.config) : {};
    } catch (e) {
      config = {};
    }

    let initialCredits = config.initialCredits || null;

    // 초기 크레딧이 없고 잔액이 있으면 → 첫 조회, 현재 잔액을 초기값으로 저장
    if (initialCredits === null && balance !== null) {
      initialCredits = balance;
      config.initialCredits = balance;
      db.db.prepare(
        'UPDATE ai_services SET config = ? WHERE service_id = ?'
      ).run(JSON.stringify(config), 'fireworks');
    }

    const usedCredits = (balance !== null && initialCredits !== null)
      ? initialCredits - balance
      : null;

    res.json({
      service: 'fireworks',
      balance,
      initialCredits,
      usedCredits,
      raw: stdout
    });
  } catch (error) {
    console.error('[Billing] Fireworks account get failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/openai
 * OpenAI 사용량 조회 (현재 청구 기간)
 */
router.get('/openai', async (req, res) => {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    const openaiService = db.db.prepare(
      'SELECT api_key FROM ai_services WHERE service_id = ? AND is_active = 1'
    ).get('openai');

    if (!openaiService || !openaiService.api_key) {
      return res.status(404).json({ success: false, error: 'OpenAI API key not found' });
    }

    // 현재 달의 시작일과 종료일 (UTC 기준)
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const response = await fetch(
      `https://api.openai.com/v1/usage?date=${startDate.toISOString().split('T')[0]}`,
      {
        headers: {
          'Authorization': `Bearer ${openaiService.api_key}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    // total_usage 계산 (모든 일별 사용량 합산)
    let totalUsage = 0;
    if (data.data && Array.isArray(data.data)) {
      totalUsage = data.data.reduce((sum, day) => {
        return sum + (day.n_context_tokens_total || 0) * 0.00001; // 대략적인 비용 계산
      }, 0);
    }

    res.json({
      service: 'openai',
      total_usage: totalUsage,
      daily_data: data.data,
      raw: data
    });
  } catch (error) {
    console.error('[Billing] OpenAI usage fetch failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/anthropic
 * Anthropic (Claude) 사용량 조회
 * Note: Anthropic은 공식 잔액 API가 없음. Organization usage만 제공.
 */
router.get('/anthropic', async (req, res) => {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    const anthropicService = db.db.prepare(
      'SELECT api_key FROM ai_services WHERE service_id = ? AND is_active = 1'
    ).get('anthropic');

    if (!anthropicService || !anthropicService.api_key) {
      return res.status(404).json({ success: false, error: 'Anthropic API key not found' });
    }

    // Anthropic은 organization usage API가 있지만 organization ID가 필요
    // 현재는 API 키만으로는 잔액 조회 불가
    res.json({
      service: 'anthropic',
      message: 'Anthropic does not provide public balance API. Check dashboard at console.anthropic.com',
      balance: null
    });
  } catch (error) {
    console.error('[Billing] Anthropic check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/openrouter
 * OpenRouter 크레딧 정보 조회
 */
router.get('/openrouter', async (req, res) => {
  try {
    const db = require('../db');
    if (!db.db) db.init();

    const openrouterService = db.db.prepare(
      'SELECT api_key FROM ai_services WHERE service_id = ? AND is_active = 1'
    ).get('openrouter');

    if (!openrouterService || !openrouterService.api_key) {
      return res.status(404).json({ success: false, error: 'OpenRouter API key not found' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${openrouterService.api_key}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    res.json({
      service: 'openrouter',
      ...data.data
    });
  } catch (error) {
    console.error('[Billing] OpenRouter balance fetch failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
