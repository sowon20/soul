/**
 * AI Services Management Routes
 * 사용자 정의 AI 서비스 CRUD
 */

const express = require('express');
const router = express.Router();
const AIService = require('../models/AIService');
const { AIServiceFactory } = require('../utils/ai-service');

/**
 * GET /api/ai-services
 * 모든 AI 서비스 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const services = await AIService.find().select('+apiKey').sort({ isBuiltIn: -1, name: 1 });

    const servicesData = services.map(service => ({
      id: service._id,
      serviceId: service.serviceId,
      name: service.name,
      type: service.type,
      baseUrl: service.baseUrl,
      isActive: service.isActive,
      isBuiltIn: service.isBuiltIn,
      hasApiKey: !!service.apiKey,
      // API 키 앞부분 마스킹 프리뷰 (앞 6자 + ******)
      apiKeyPreview: service.apiKey ? `${service.apiKey.substring(0, 6)}******` : null,
      modelCount: service.models?.length || 0,
      models: service.models || [],  // 모델 목록 포함
      lastRefresh: service.lastRefresh,
      // Vertex AI 전용 필드
      projectId: service.projectId || null,
      region: service.region || 'us-east5'
    }));

    res.json({
      success: true,
      services: servicesData
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
    const service = await AIService.findById(req.params.id).select('+apiKey');

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
        hasApiKey: !!service.apiKey,
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

    // 서비스 생성
    const service = new AIService({
      serviceId,
      name,
      type,
      baseUrl,
      apiKey: apiKey && apiKey.trim() ? apiKey : null,
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
    const service = await AIService.findById(req.params.id).select('+apiKey');

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    const { name, baseUrl, apiKey, isActive, projectId, region, credentials } = req.body;

    // 업데이트 가능한 필드만 수정
    if (name) service.name = name;
    if (baseUrl) service.baseUrl = baseUrl;
    if (typeof isActive === 'boolean') service.isActive = isActive;

    // API 키 업데이트
    if (apiKey !== undefined) {
      service.apiKey = apiKey && apiKey.trim() ? apiKey : null;
    }

    // Vertex AI 전용 필드 업데이트
    if (projectId !== undefined) {
      service.projectId = projectId && projectId.trim() ? projectId : null;
    }
    if (region !== undefined) {
      service.region = region && region.trim() ? region : 'us-east5';
    }
    if (credentials !== undefined) {
      service.credentials = credentials && credentials.trim() ? credentials : null;
    }

    await service.save();

    res.json({
      success: true,
      message: 'AI 서비스가 수정되었습니다',
      service: {
        id: service._id,
        serviceId: service.serviceId,
        name: service.name,
        hasApiKey: !!service.apiKey
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
    const service = await AIService.findById(req.params.id).select('+apiKey');

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    // Vertex AI는 API 키 대신 projectId 필요
    if (service.type === 'vertex') {
      if (!service.projectId) {
        return res.status(400).json({
          success: false,
          error: 'Vertex AI Project ID가 설정되지 않았습니다'
        });
      }
    } else if (!service.apiKey && service.type !== 'ollama') {
      // API 키 확인 (Ollama와 Vertex 제외)
      return res.status(400).json({
        success: false,
        error: 'API 키가 설정되지 않았습니다'
      });
    }

    // 모델 목록 가져오기
    // xAI는 serviceId로 판단
    let serviceType = service.type;
    if (service.type === 'openai-compatible' && service.serviceId === 'xai') {
      serviceType = 'xai';
    } else if (service.type === 'openai-compatible') {
      serviceType = 'openai';
    }

    const result = await AIServiceFactory.getAvailableModels(serviceType, service.apiKey);

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
    const service = await AIService.findById(req.params.id).select('+apiKey');

    if (!service) {
      return res.status(404).json({
        success: false,
        error: '서비스를 찾을 수 없습니다'
      });
    }

    // API 키 확인
    if (!service.apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API 키가 설정되지 않았습니다'
      });
    }

    // 연결 테스트 (API 키 검증)
    // xAI는 serviceId로 판단
    let serviceType = service.type;
    if (service.type === 'openai-compatible' && service.serviceId === 'xai') {
      serviceType = 'xai';
    } else if (service.type === 'openai-compatible') {
      serviceType = 'openai';
    }

    const result = await AIServiceFactory.validateApiKey(serviceType, service.apiKey);

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
