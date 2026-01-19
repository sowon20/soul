/**
 * AI Services Management Routes
 * 사용자 정의 AI 서비스 CRUD
 */

const express = require('express');
const router = express.Router();
const AIService = require('../models/AIService');
const APIKey = require('../models/APIKey');
const AIServiceFactory = require('../utils/ai-service');

/**
 * GET /api/ai-services
 * 모든 AI 서비스 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const services = await AIService.find().sort({ isBuiltIn: -1, name: 1 });

    // API 키 설정 여부 확인
    const servicesWithKeyStatus = await Promise.all(services.map(async (service) => {
      let hasApiKey = false;
      if (service.apiKeyRef) {
        const keyDoc = await APIKey.findOne({ service: service.apiKeyRef });
        hasApiKey = !!keyDoc;
      }

      return {
        id: service._id,
        serviceId: service.serviceId,
        name: service.name,
        type: service.type,
        baseUrl: service.baseUrl,
        isActive: service.isActive,
        isBuiltIn: service.isBuiltIn,
        hasApiKey: hasApiKey,
        modelCount: service.models?.length || 0,
        lastRefresh: service.lastRefresh
      };
    }));

    res.json({
      success: true,
      services: servicesWithKeyStatus
    });
  } catch (error) {
    console.error('Failed to fetch AI services:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-services/:id
 * 특정 AI 서비스 상세 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    res.json({
      success: true,
      service: {
        id: service._id,
        serviceId: service.serviceId,
        name: service.name,
        type: service.type,
        baseUrl: service.baseUrl,
        apiKeyRef: service.apiKeyRef,
        isActive: service.isActive,
        isBuiltIn: service.isBuiltIn,
        models: service.models,
        lastRefresh: service.lastRefresh,
        config: service.config
      }
    });
  } catch (error) {
    console.error('Failed to fetch AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai-services
 * 새 AI 서비스 추가
 */
router.post('/', async (req, res) => {
  try {
    const { serviceId, name, type, baseUrl, apiKey } = req.body;

    // 필수 필드 검증
    if (!serviceId || !name || !type || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: '필수 항목을 모두 입력해주세요'
      });
    }

    // serviceId 중복 확인
    const existing = await AIService.findOne({ serviceId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: '이미 존재하는 서비스 ID입니다'
      });
    }

    // API 키가 있으면 저장
    let apiKeyRef = null;
    if (apiKey && apiKey.trim()) {
      await APIKey.saveKey(serviceId, apiKey);
      apiKeyRef = serviceId;
    }

    // 서비스 생성
    const service = new AIService({
      serviceId,
      name,
      type,
      baseUrl,
      apiKeyRef,
      isBuiltIn: false,
      isActive: true
    });

    await service.save();

    res.json({
      success: true,
      message: 'AI 서비스가 추가되었습니다',
      service: {
        id: service._id,
        serviceId: service.serviceId,
        name: service.name
      }
    });
  } catch (error) {
    console.error('Failed to create AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/ai-services/:id
 * AI 서비스 수정
 */
router.patch('/:id', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    const { name, baseUrl, apiKey, isActive } = req.body;

    // 업데이트 가능한 필드만 수정
    if (name) service.name = name;
    if (baseUrl) service.baseUrl = baseUrl;
    if (typeof isActive === 'boolean') service.isActive = isActive;

    // API 키 업데이트
    if (apiKey !== undefined) {
      if (apiKey && apiKey.trim()) {
        const keyRef = service.apiKeyRef || service.serviceId;
        await APIKey.saveKey(keyRef, apiKey);
        service.apiKeyRef = keyRef;
      }
    }

    await service.save();

    res.json({
      success: true,
      message: 'AI 서비스가 수정되었습니다',
      service: {
        id: service._id,
        serviceId: service.serviceId,
        name: service.name
      }
    });
  } catch (error) {
    console.error('Failed to update AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/ai-services/:id
 * AI 서비스 삭제
 */
router.delete('/:id', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    // 기본 서비스는 삭제 불가
    if (service.isBuiltIn) {
      return res.status(400).json({
        success: false,
        error: '기본 제공 서비스는 삭제할 수 없습니다'
      });
    }

    // API 키도 함께 삭제
    if (service.apiKeyRef) {
      await APIKey.deleteOne({ service: service.apiKeyRef });
    }

    await AIService.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'AI 서비스가 삭제되었습니다'
    });
  } catch (error) {
    console.error('Failed to delete AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai-services/:id/toggle
 * AI 서비스 활성화/비활성화
 */
router.post('/:id/toggle', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    const newStatus = await service.toggleActive();

    res.json({
      success: true,
      message: `서비스가 ${newStatus ? '활성화' : '비활성화'}되었습니다`,
      isActive: newStatus
    });
  } catch (error) {
    console.error('Failed to toggle AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai-services/:id/refresh-models
 * 모델 목록 갱신
 */
router.post('/:id/refresh-models', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    // API 키 가져오기
    let apiKey = null;
    if (service.apiKeyRef) {
      apiKey = await APIKey.getKey(service.apiKeyRef);
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'API 키가 설정되지 않았습니다'
        });
      }
    }

    // 모델 목록 가져오기
    const result = await AIServiceFactory.getAvailableModels(
      service.type === 'openai-compatible' ? 'openai' : service.type,
      apiKey
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || '모델 목록을 가져올 수 없습니다'
      });
    }

    // 모델 목록 업데이트
    await service.updateModels(result.models);

    res.json({
      success: true,
      message: `${result.models.length}개 모델이 업데이트되었습니다`,
      models: result.models
    });
  } catch (error) {
    console.error('Failed to refresh models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai-services/:id/test
 * 연결 테스트
 */
router.post('/:id/test', async (req, res) => {
  try {
    const service = await AIService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    // API 키 가져오기
    let apiKey = null;
    if (service.apiKeyRef) {
      apiKey = await APIKey.getKey(service.apiKeyRef);
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'API 키가 설정되지 않았습니다'
        });
      }
    }

    // 연결 테스트 (API 키 검증)
    const result = await AIServiceFactory.validateApiKey(
      service.type === 'openai-compatible' ? 'openai' : service.type,
      apiKey
    );

    res.json({
      success: result.valid,
      message: result.message
    });
  } catch (error) {
    console.error('Failed to test AI service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
