/**
 * 내면 메모 API
 * AI가 스스로 남긴 성찰/깨달음 메모 관리
 */
const express = require('express');
const router = express.Router();
const SelfRule = require('../models/SelfRule');

// 토큰 대략 계산 (단순히 글자수/4)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * GET /api/self-rules
 * 활성 규칙 목록 (카테고리별 필터 가능)
 */
router.get('/', async (req, res) => {
  try {
    const { category, active = 'true' } = req.query;
    const query = { isActive: active === 'true' };
    if (category) query.category = category;
    
    const rules = await SelfRule.find(query)
      .sort({ priority: -1, useCount: -1 })
      .limit(100);
    
    res.json({ success: true, rules });
  } catch (error) {
    console.error('[SelfRules] GET error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/self-rules/for-prompt
 * 시스템 프롬프트용 규칙 (토큰 제한)
 */
router.get('/for-prompt', async (req, res) => {
  try {
    const { categories, maxTokens = 500 } = req.query;
    const categoryList = categories ? categories.split(',') : null;
    
    const query = { isActive: true };
    if (categoryList) query.category = { $in: categoryList };
    
    // 우선순위 + 최근 사용 순으로 정렬
    const rules = await SelfRule.find(query)
      .sort({ priority: -1, lastUsed: -1, useCount: -1 });
    
    // 토큰 제한까지만 포함
    let totalTokens = 0;
    const selectedRules = [];
    
    for (const rule of rules) {
      const tokens = rule.tokenCount || estimateTokens(rule.rule);
      if (totalTokens + tokens > maxTokens) break;
      
      totalTokens += tokens;
      selectedRules.push(rule);
    }
    
    // 사용 횟수 증가
    const ruleIds = selectedRules.map(r => r._id);
    await SelfRule.updateMany(
      { _id: { $in: ruleIds } },
      { $inc: { useCount: 1 }, $set: { lastUsed: new Date() } }
    );
    
    // 텍스트로 포맷
    const promptText = selectedRules
      .map(r => `- ${r.rule}`)
      .join('\n');
    
    res.json({ 
      success: true, 
      rules: selectedRules,
      promptText,
      totalTokens,
      count: selectedRules.length
    });
  } catch (error) {
    console.error('[SelfRules] for-prompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/self-rules
 * 새 규칙 추가
 */
router.post('/', async (req, res) => {
  try {
    const { rule, category = 'general', priority = 5, context } = req.body;
    
    if (!rule) {
      return res.status(400).json({ success: false, error: '규칙 내용이 필요합니다' });
    }
    
    const tokenCount = estimateTokens(rule);
    
    const newRule = new SelfRule({
      rule,
      category,
      priority,
      context,
      tokenCount
    });
    
    await newRule.save();
    console.log(`[SelfRules] 새 규칙 추가: ${rule.substring(0, 50)}...`);
    
    res.json({ success: true, rule: newRule });
  } catch (error) {
    console.error('[SelfRules] POST error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/self-rules/:id
 * 규칙 수정
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // 규칙 내용 변경 시 토큰 재계산
    if (updates.rule) {
      updates.tokenCount = estimateTokens(updates.rule);
    }
    
    const rule = await SelfRule.findByIdAndUpdate(id, updates, { new: true });
    
    if (!rule) {
      return res.status(404).json({ success: false, error: '규칙을 찾을 수 없습니다' });
    }
    
    res.json({ success: true, rule });
  } catch (error) {
    console.error('[SelfRules] PUT error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/self-rules/:id
 * 규칙 삭제 (또는 비활성화)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = 'false' } = req.query;
    
    if (permanent === 'true') {
      await SelfRule.findByIdAndDelete(id);
    } else {
      // 소프트 삭제 (아카이브)
      await SelfRule.findByIdAndUpdate(id, { isActive: false });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[SelfRules] DELETE error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/self-rules/learn
 * AI가 대화에서 규칙 학습 (로컬 LLM 호출)
 */
router.post('/learn', async (req, res) => {
  try {
    const { conversation, userFeedback } = req.body;
    
    // TODO: 로컬 LLM 호출해서 규칙 추출
    // 일단 수동으로 규칙 추가하는 것만 가능
    
    res.json({ 
      success: true, 
      message: '자동 학습은 아직 구현 중입니다. POST /api/self-rules로 직접 추가해주세요.'
    });
  } catch (error) {
    console.error('[SelfRules] learn error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
