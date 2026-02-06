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
    const AIServiceModel = require('../models/AIService');
    const fireworksService = await AIServiceModel.findOne({ serviceId: 'fireworks' });

    let initialCredits = fireworksService?.metadata?.initialCredits || null;

    // 초기 크레딧이 없고 잔액이 있으면 → 첫 조회, 현재 잔액을 초기값으로 저장
    if (initialCredits === null && balance !== null) {
      initialCredits = balance;
      await AIServiceModel.updateOne(
        { serviceId: 'fireworks' },
        { $set: { 'metadata.initialCredits': balance } }
      );
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
 * GET /api/billing/openrouter
 * OpenRouter 크레딧 정보 조회
 */
router.get('/openrouter', async (req, res) => {
  try {
    const AIServiceModel = require('../models/AIService');
    const openrouterService = await AIServiceModel.findOne({ serviceId: 'openrouter' });
    
    if (!openrouterService || !openrouterService.apiKey) {
      return res.status(404).json({ success: false, error: 'OpenRouter API key not found' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${openrouterService.apiKey}`
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
