/**
 * TTS Route - Cartesia TTS 프록시
 * API 키를 백엔드에서 관리하여 클라이언트 노출 방지
 *
 * POST /api/tts/speak        - 텍스트 → 오디오 (PCM → WAV 변환, REST API)
 * WS   /api/tts/stream       - WebSocket 스트리밍 TTS
 * POST /api/tts/config       - TTS 설정 저장/조회
 * GET  /api/tts/voices       - 사용 가능한 음성 목록
 */

const express = require('express');
const router = express.Router();
const APIKey = require('../models/APIKey');
const configManager = require('../utils/config');
const WebSocket = require('ws');

// Cartesia API 엔드포인트 (환경변수 또는 기본값)
const CARTESIA_API_URL = process.env.CARTESIA_API_URL || 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_WS_URL = process.env.CARTESIA_WS_URL || 'wss://api.cartesia.ai/tts/websocket';
const CARTESIA_VERSION = process.env.CARTESIA_VERSION || '2025-04-16';

// TTS 설정 (모든 값은 DB 설정 또는 사용자 프로필에서 가져옴)
const DEFAULT_TTS_CONFIG = {
  provider: 'cartesia',
  sampleRate: 24000,  // 오디오 샘플레이트만 기술적 기본값
};

/**
 * PCM raw 데이터에 WAV 헤더 추가
 * Cartesia는 raw PCM을 반환하므로 브라우저 재생을 위해 WAV 헤더 필요
 */
function addWavHeader(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);               // sub-chunk size
  header.writeUInt16LE(1, 20);                // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);              // block align
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * POST /api/tts/speak - 텍스트 → WAV 오디오
 */
router.post('/speak', async (req, res) => {
  try {
    const { text, voice: reqVoice, model: reqModel, language: reqLanguage, speed: reqSpeed, volume: reqVolume, emotion: reqEmotion } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }

    // TTS 설정 로드
    const config = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);

    // 사용자 설정에서 voice/model/language 가져오기 (요청 파라미터가 우선)
    const preferences = await configManager.getConfigValue('preferences', {});
    const profileConfig = await configManager.getConfigValue('profile', {});

    const cartesiaConfig = preferences.voiceConfig?.cartesia || {};
    const voiceId = reqVoice || cartesiaConfig.voice || preferences.voiceModel;
    const modelId = reqModel || cartesiaConfig.model || config.modelId;
    const language = reqLanguage || cartesiaConfig.language || profileConfig.language || config.language || 'ko';

    if (!voiceId || !modelId) {
      return res.status(400).json({ error: 'Voice and Model must be configured in settings' });
    }

    // Cartesia API 키 조회
    const apiKey = await APIKey.getKey('cartesia');
    if (!apiKey) {
      return res.status(400).json({ error: 'Cartesia API key not configured' });
    }

    // generation_config 구성 (sonic-3 전용: speed, volume, emotion)
    // 요청 파라미터 → 저장된 설정 → 기본값 순서
    const generationConfig = {};
    const speed = parseFloat(reqSpeed ?? cartesiaConfig.speed);
    const volume = parseFloat(reqVolume ?? cartesiaConfig.volume);
    const emotion = reqEmotion || cartesiaConfig.emotion;
    if (!isNaN(speed) && speed !== 1.0) generationConfig.speed = speed;
    if (!isNaN(volume) && volume !== 1.0) generationConfig.volume = volume;
    if (emotion && emotion !== 'neutral') {
      generationConfig.emotion = emotion;
    }

    // Cartesia API 요청 본문
    const requestBody = {
      model_id: modelId,
      transcript: text.trim(),
      voice: {
        mode: 'id',
        id: voiceId,
      },
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: config.sampleRate || DEFAULT_TTS_CONFIG.sampleRate,
      },
      language: language,
    };

    // generation_config가 있으면 추가 (기본값만이면 생략)
    if (Object.keys(generationConfig).length > 0) {
      requestBody.generation_config = generationConfig;
    }

    // Cartesia API 호출
    const response = await fetch(CARTESIA_API_URL, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_VERSION,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[TTS] Cartesia error:', response.status, errText);
      return res.status(response.status).json({ error: `Cartesia: ${errText}` });
    }

    // raw PCM → WAV 변환 (끝부분 잘림 방지: 무음 패딩 추가)
    const pcmBuffer = Buffer.from(await response.arrayBuffer());
    const sr = config.sampleRate || 24000;
    const silencePadding = Buffer.alloc(Math.floor(sr * 2 * 0.3)); // 0.3초 무음 (16bit=2bytes)
    const paddedPcm = Buffer.concat([pcmBuffer, silencePadding]);
    const wavBuffer = addWavHeader(paddedPcm, sr);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuffer.length,
    });
    res.send(wavBuffer);

  } catch (error) {
    console.error('[TTS] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/config - TTS 설정 조회
 */
router.get('/config', async (req, res) => {
  try {
    const config = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);
    const hasKey = !!(await APIKey.getKey('cartesia'));
    res.json({ ...config, hasApiKey: hasKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tts/config - TTS 설정 저장
 */
router.post('/config', async (req, res) => {
  try {
    const { apiKey, ...settings } = req.body;

    // API 키가 포함되어 있으면 암호화 저장
    if (apiKey) {
      await APIKey.saveKey('cartesia', apiKey);
    }

    // 나머지 설정 저장
    if (Object.keys(settings).length > 0) {
      const current = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);
      await configManager.setConfigValue('tts', { ...current, ...settings }, 'TTS configuration');
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/voice-models - 음성 모델 목록 조회
 * 각 서비스별 음성 지원 모델 반환
 */
router.get('/voice-models', async (req, res) => {
  try {
    const AIService = require('../models/AIService');
    const services = await AIService.find();

    const voiceModels = [];

    // 활성화되고 API 키가 있는 서비스만 처리
    for (const service of services) {
      // TTS 전용 서비스는 제외 (Cartesia 등)
      if (service.serviceId === 'cartesia') continue;

      const hasKey = service.serviceId === 'ollama' ? true :
                     service.serviceId === 'vertex' ? !!service.projectId :
                     !!service.apiKey;

      if (!hasKey || !service.isActive) continue;

      // DB에 저장된 모델 중 음성 관련 모델 추가
      if (service.models && service.models.length > 0) {
        console.log(`[voice-models] Checking ${service.serviceId}: ${service.models.length} models`);
        service.models.forEach(model => {
          const modelLower = model.id.toLowerCase();
          const descLower = (model.description || '').toLowerCase();
          const nameLower = (model.name || '').toLowerCase();

          // 음성 관련 키워드로 필터링 (대화형 음성 모델만)
          const isVoiceModel =
            modelLower.includes('realtime') ||
            modelLower.includes('audio') ||
            modelLower.includes('whisper') ||
            modelLower.includes('native') ||
            modelLower.includes('live') ||
            descLower.includes('audio') ||
            descLower.includes('native') ||
            descLower.includes('live') ||
            nameLower.includes('audio') ||
            nameLower.includes('native') ||
            nameLower.includes('live');

          if (service.serviceId === 'google') {
            console.log(`[voice-models] Google ${model.id}: ${isVoiceModel}`);
          }

          if (isVoiceModel) {
            voiceModels.push({
              id: model.id,
              name: model.name || model.id,
              description: model.description || '',
              service: service.name,
              serviceId: service.serviceId
            });
          }
        });
      }
    }

    res.json({
      success: true,
      models: voiceModels
    });
  } catch (error) {
    console.error('Failed to fetch voice models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/tts-models - TTS 모델 목록 조회
 * 각 서비스의 TTS/음성 모델 반환
 */
router.get('/tts-models', async (req, res) => {
  try {
    const AIService = require('../models/AIService');
    const services = await AIService.find();

    const ttsModels = [];

    for (const service of services) {
      const hasKey = service.serviceId === 'ollama' ? true :
                     service.serviceId === 'vertex' ? !!service.projectId :
                     !!service.apiKey;

      if (!hasKey || !service.isActive) continue;

      try {
        // Cartesia는 별도 처리 (모델 목록 말고 "Cartesia" 항목만)
        if (service.serviceId === 'cartesia') {
          ttsModels.push({
            id: 'cartesia:custom',
            name: 'Cartesia',
            service: 'cartesia',
            serviceLabel: 'Cartesia',
            requiresVoice: true
          });
        }
        // 다른 서비스들: DB에 저장된 TTS 모델 가져오기
        else if (service.models && service.models.length > 0) {
          service.models.forEach(model => {
            const modelLower = model.id.toLowerCase();
            const descLower = (model.description || '').toLowerCase();
            const nameLower = (model.name || '').toLowerCase();

            // TTS/음성 관련 키워드로 필터링
            const isTTSModel =
              modelLower.includes('tts') ||
              modelLower.includes('audio') ||
              modelLower.includes('speech') ||
              modelLower.includes('whisper') ||
              descLower.includes('text-to-speech') ||
              descLower.includes('voice') ||
              nameLower.includes('voice');

            if (isTTSModel) {
              ttsModels.push({
                id: `${service.serviceId}:${model.id}`,
                name: model.name || model.id,
                service: service.serviceId,
                serviceLabel: service.name,
                modelId: model.id,
                requiresVoice: false
              });
            }
          });
        }
      } catch (err) {
        console.error(`Failed to process TTS models for ${service.serviceId}:`, err);
      }
    }

    res.json({
      success: true,
      models: ttsModels
    });
  } catch (error) {
    console.error('Failed to fetch TTS models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/voices?service=cartesia - 특정 서비스의 voice 목록
 */
router.get('/voices', async (req, res) => {
  try {
    const { service: serviceId } = req.query;

    if (!serviceId) {
      return res.status(400).json({ error: 'service parameter required' });
    }

    const AIService = require('../models/AIService');
    const service = await AIService.findOne({ serviceId });

    if (!service || !service.isActive) {
      return res.status(404).json({ error: 'Service not found or inactive' });
    }

    const config = require('../utils/config');
    const profileConfig = await config.getConfigValue('profile', {});
    const userLanguage = profileConfig.basicInfo?.language?.value || 'ko';

    let voices = [];

    // Cartesia voices
    if (serviceId === 'cartesia') {
      const response = await fetch(`https://api.cartesia.ai/voices?language=${userLanguage}`, {
        headers: {
          'X-API-Key': service.apiKey,
          'Cartesia-Version': '2024-06-10'
        }
      });

      if (response.ok) {
        const cartesiaVoices = await response.json();
        voices = cartesiaVoices.map(v => ({
          id: v.id,
          name: v.name,
          description: v.description || ''
        }));
      }
    }

    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * WebSocket TTS 스트리밍 핸들러
 * 클라이언트 WebSocket → 백엔드 → Cartesia WebSocket
 *
 * 사용법: 클라이언트는 ws://server/api/tts/stream 에 연결 후
 * { text, voice, model } 메시지 전송
 */
async function handleWebSocketTTS(clientWs, req) {
  let cartesiaWs = null;

  try {
    // API 키 조회
    const apiKey = await APIKey.getKey('cartesia');
    if (!apiKey) {
      clientWs.send(JSON.stringify({ error: 'Cartesia API key not configured' }));
      clientWs.close();
      return;
    }

    // TTS 설정 로드
    const config = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);
    const preferences = await configManager.getConfigValue('preferences', {});
    const profileConfig = await configManager.getConfigValue('profile', {});

    // 클라이언트 메시지 수신 (필요한 필드만: text, voice, model)
    clientWs.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { text, voice, model } = data;

        if (!text || !text.trim()) {
          clientWs.send(JSON.stringify({ error: 'text required' }));
          return;
        }

        // voice와 model이 제공되지 않으면 설정에서 가져옴
        const cartesiaConfig = preferences.voiceConfig?.cartesia || {};
        const voiceId = voice || cartesiaConfig.voice || preferences.voiceModel;
        const modelId = model || cartesiaConfig.model || config.modelId;
        const language = cartesiaConfig.language || profileConfig.language || config.language || 'ko';

        if (!voiceId || !modelId) {
          clientWs.send(JSON.stringify({ error: 'Voice and Model must be configured in settings' }));
          clientWs.close();
          return;
        }

        // generation_config 구성 (sonic-3 전용: speed, volume, emotion)
        const generationConfig = {};
        const speed = parseFloat(cartesiaConfig.speed);
        const volume = parseFloat(cartesiaConfig.volume);
        if (!isNaN(speed) && speed !== 1.0) generationConfig.speed = speed;
        if (!isNaN(volume) && volume !== 1.0) generationConfig.volume = volume;
        if (cartesiaConfig.emotion && cartesiaConfig.emotion !== 'neutral') {
          generationConfig.emotion = cartesiaConfig.emotion;
        }

        // Cartesia WebSocket 연결
        const wsUrl = `${CARTESIA_WS_URL}?api_key=${apiKey}&cartesia_version=${CARTESIA_VERSION}`;
        cartesiaWs = new WebSocket(wsUrl);

        cartesiaWs.on('open', () => {
          // TTS 요청 전송
          const wsRequest = {
            model_id: modelId,
            transcript: text.trim(),
            voice: {
              mode: 'id',
              id: voiceId
            },
            output_format: {
              container: 'raw',
              encoding: 'pcm_s16le',
              sample_rate: config.sampleRate || DEFAULT_TTS_CONFIG.sampleRate
            },
            language: language
          };

          if (Object.keys(generationConfig).length > 0) {
            wsRequest.generation_config = generationConfig;
          }

          cartesiaWs.send(JSON.stringify(wsRequest));
        });

        cartesiaWs.on('message', (chunk) => {
          // Cartesia에서 받은 오디오 청크를 클라이언트로 전달
          if (chunk instanceof Buffer) {
            clientWs.send(chunk);
          } else {
            // JSON 메시지 (에러, 완료 등)
            clientWs.send(chunk);
          }
        });

        cartesiaWs.on('error', (error) => {
          console.error('[TTS WebSocket] Cartesia error:', error.message);
          clientWs.send(JSON.stringify({ error: error.message }));
        });

        cartesiaWs.on('close', () => {
          clientWs.send(JSON.stringify({ done: true }));
        });

      } catch (error) {
        console.error('[TTS WebSocket] Message error:', error.message);
        clientWs.send(JSON.stringify({ error: error.message }));
      }
    });

    clientWs.on('close', () => {
      if (cartesiaWs) {
        cartesiaWs.close();
      }
    });

    clientWs.on('error', (error) => {
      console.error('[TTS WebSocket] Client error:', error.message);
      if (cartesiaWs) {
        cartesiaWs.close();
      }
    });

  } catch (error) {
    console.error('[TTS WebSocket] Setup error:', error.message);
    clientWs.send(JSON.stringify({ error: error.message }));
    clientWs.close();
  }
}

module.exports = router;
module.exports.handleWebSocketTTS = handleWebSocketTTS;
