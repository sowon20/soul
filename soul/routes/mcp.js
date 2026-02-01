const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const SystemConfig = require('../models/SystemConfig');
const { clearCache: clearMCPCache } = require('../utils/mcp-tools');

// MCP 서버 URL 설정 (환경변수로 외부 서버 지정 가능)
const MCP_SERVERS = {
  'google-home': process.env.MCP_GOOGLE_HOME_URL || 'http://localhost:8125',
  'todo': process.env.MCP_TODO_URL || 'http://localhost:8124'
};

/**
 * MCP 서버 URL 가져오기 (외부 서버 지원)
 * @param {string} serverId - 서버 ID
 * @param {object} config - 서버 설정 (선택)
 * @returns {string} 서버 URL
 */
async function getMcpServerUrl(serverId, config = null) {
  // 설정 로드
  if (!config) {
    try {
      config = await loadServerConfig();
    } catch { config = {}; }
  }

  // 외부 서버 확인
  if (config.externalServers?.[serverId]) {
    return config.externalServers[serverId].url;
  }

  // 기본 서버
  return MCP_SERVERS[serverId] || `http://localhost:${8124 + Object.keys(MCP_SERVERS).indexOf(serverId)}`;
}

/**
 * 서버 설정 로드 (DB에서)
 */
async function loadServerConfig() {
  try {
    const config = await SystemConfig.findOne({ configKey: 'mcp_servers' });
    return config?.value || { servers: {}, externalServers: {} };
  } catch (e) {
    console.error('[MCP] Failed to load config from DB:', e.message);
    return { servers: {}, externalServers: {} };
  }
}

/**
 * 서버 설정 저장 (DB에)
 */
async function saveServerConfig(config) {
  await SystemConfig.findOneAndUpdate(
    { configKey: 'mcp_servers' },
    {
      configKey: 'mcp_servers',
      value: config,
      description: 'MCP 서버 설정'
    },
    { upsert: true, new: true }
  );
}

/**
 * GET /api/mcp/servers
 * MCP 서버 목록 조회
 */
router.get('/servers', async (req, res) => {
  try {
    const mcpPath = path.join(__dirname, '../../mcp');
    const config = await loadServerConfig();
    console.log('[MCP] Loaded config:', JSON.stringify(config, null, 2));

    // tools 디렉토리에서 도구 목록 가져오기
    const toolsPath = path.join(mcpPath, 'tools');
    const toolFiles = await fs.readdir(toolsPath);

    // 실제 도구 개수 세기
    let hubTools = [];
    for (const file of toolFiles) {
      if (file.endsWith('.js')) {
        try {
          // require 캐시 삭제 후 다시 로드
          const modulePath = path.join(toolsPath, file);
          delete require.cache[require.resolve(modulePath)];
          const toolModule = require(modulePath);
          if (toolModule.tools && Array.isArray(toolModule.tools)) {
            hubTools.push(...toolModule.tools.map(t => t.name));
          }
        } catch (e) {
          console.error(`[MCP] Failed to load tool ${file}:`, e.message);
          // axios 의존성 문제면 도구 정의만 파싱 (tools 배열 안에서만)
          try {
            const content = await fs.readFile(path.join(toolsPath, file), 'utf-8');
            const toolsMatch = content.match(/tools:\s*\[([\s\S]*?)\]\s*\};/);
            if (toolsMatch) {
              const matches = toolsMatch[1].match(/name:\s*['"]([^'"]+)['"]/g);
              if (matches) {
                hubTools.push(...matches.map(m => m.match(/['"]([^'"]+)['"]/)[1]));
              }
            }
          } catch {}
        }
      }
    }

    const servers = [];

    // hub-server (기본 내장 서버) - 항상 표시
    const hubConfig = config.servers?.['hub-server'] || {};
    servers.push({
      id: 'hub-server',
      name: hubConfig.name || 'Soul Hub Server',
      description: 'Soul 내장 MCP 서버 - 컨텍스트 도구 제공',
      type: 'built-in',
      enabled: hubConfig.enabled ?? true,
      tools: hubTools,
      icon: hubConfig.icon,
      uiUrl: hubConfig.uiUrl,
      showInDock: hubConfig.showInDock ?? false
    });

    // 등록된 외부 서버들만 표시 (config 기반)
    if (config.externalServers) {
      for (const [serverId, serverInfo] of Object.entries(config.externalServers)) {
        const isEnabled = config.servers[serverId]?.enabled !== false;

        // 도구 개수 조회 시도 (enabled된 서버만, 3초 타임아웃)
        let tools = [];
        if (isEnabled) {
          try {
            const baseUrl = serverInfo.url.replace(/\/sse\/?$/, '');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const toolsRes = await fetch(baseUrl + '/tools', { signal: controller.signal });
            clearTimeout(timeout);

            const data = await toolsRes.json();
            tools = data.tools || [];
            console.log(`[MCP] Got ${tools.length} tools from ${serverId}`);
          } catch (e) {
            if (e.name === 'AbortError') {
              console.log(`[MCP] Timeout fetching tools from ${serverId}`);
            } else {
              console.log(`[MCP] Failed to fetch tools from ${serverId}:`, e.message);
            }
          }
        }

        servers.push({
          id: serverId,
          name: serverInfo.name,
          description: serverInfo.description || `외부 MCP 서버`,
          type: 'external',
          enabled: isEnabled,
          tools,
          url: serverInfo.url,
          icon: serverInfo.icon,
          uiUrl: serverInfo.uiUrl,
          showInDock: serverInfo.showInDock ?? false
        });
      }
    }

    res.json({
      success: true,
      servers
    });
  } catch (error) {
    console.error('Error listing MCP servers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/servers/:id/tools
 * 특정 MCP 서버의 도구 상세 정보 조회
 */
router.get('/servers/:id/tools', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadServerConfig();

    if (id === 'hub-server') {
      const mcpPath = path.join(__dirname, '../../mcp');
      const toolsPath = path.join(mcpPath, 'tools');
      const toolFiles = await fs.readdir(toolsPath);

      const tools = [];

      for (const file of toolFiles) {
        if (file.endsWith('.js')) {
          try {
            const modulePath = path.join(toolsPath, file);
            delete require.cache[require.resolve(modulePath)];
            const toolModule = require(modulePath);
            if (toolModule.tools) {
              tools.push(...toolModule.tools.map(t => ({
                name: t.name,
                description: t.description,
                module: toolModule.name || file.replace('.js', '')
              })));
            }
          } catch (error) {
            console.error(`Error loading tool ${file}:`, error.message);
            // 파일 파싱으로 폴백
            try {
              const content = await fs.readFile(path.join(toolsPath, file), 'utf-8');
              const toolsMatch = content.match(/tools:\s*\[([\s\S]*?)\]\s*\};/);
              if (toolsMatch) {
                const nameMatches = toolsMatch[1].matchAll(/name:\s*['"]([^'"]+)['"]/g);
                const descMatches = toolsMatch[1].matchAll(/description:\s*['"]([^'"]+)['"]/g);
                const names = [...nameMatches].map(m => m[1]);
                const descs = [...descMatches].map(m => m[1]);
                names.forEach((name, i) => {
                  tools.push({ name, description: descs[i] || '', module: file.replace('.js', '') });
                });
              }
            } catch {}
          }
        }
      }

      res.json({
        success: true,
        server: id,
        tools
      });
    } else if (config.externalServers?.[id]) {
      // 외부 서버 - /tools 엔드포인트에서 도구 목록 가져오기
      const serverInfo = config.externalServers[id];
      // SSE URL에서 base URL 추출 (예: https://x.com/smarthome/sse -> https://x.com/smarthome)
      const baseUrl = serverInfo.url.replace(/\/sse\/?$/, '');
      try {
        const toolsRes = await fetch(baseUrl + '/tools');
        const data = await toolsRes.json();
        res.json({
          success: true,
          server: id,
          tools: data.tools || [],
          note: `외부 서버 (${serverInfo.name})`
        });
      } catch (e) {
        // /tools 실패 시 /info로 폴백
        try {
          const infoRes = await fetch(baseUrl + '/info');
          const info = await infoRes.json();
          res.json({
            success: true,
            server: id,
            tools: typeof info.tools === 'number' ? Array(info.tools).fill(null).map((_, i) => ({ name: `tool_${i+1}` })) : [],
            note: `외부 서버 (${info.name || serverInfo.name})`
          });
        } catch {
          res.json({ success: true, server: id, tools: [], note: '서버에 연결할 수 없음' });
        }
      }
    } else {
      res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }
  } catch (error) {
    console.error('Error getting server tools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers
 * 새 MCP 서버 추가
 */
router.post('/servers', async (req, res) => {
  try {
    const { id, name, url, enabled = true } = req.body;

    if (!name || !url) {
      return res.status(400).json({ success: false, error: 'name과 url은 필수입니다' });
    }

    const config = await loadServerConfig();
    if (!config.servers) config.servers = {};
    if (!config.externalServers) config.externalServers = {};

    const serverId = id || 'mcp_' + Date.now();
    
    // 외부 서버 정보 저장
    config.externalServers[serverId] = {
      name,
      url
    };
    config.servers[serverId] = { enabled };

    await saveServerConfig(config);
    console.log(`[MCP] External server added: ${serverId} (${url})`);

    res.json({ success: true, id: serverId });
  } catch (error) {
    console.error('Error adding server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/mcp/servers/:id
 * MCP 서버 삭제
 */
router.delete('/servers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadServerConfig();

    if (config.externalServers?.[id]) {
      delete config.externalServers[id];
    }
    if (config.servers?.[id]) {
      delete config.servers[id];
    }

    await saveServerConfig(config);
    console.log(`[MCP] Server deleted: ${id}`);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/mcp/servers/:id
 * MCP 서버 수정
 */
router.put('/servers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, enabled } = req.body;

    const config = await loadServerConfig();
    if (!config.externalServers) config.externalServers = {};
    if (!config.servers) config.servers = {};
    
    // 외부 서버가 없으면 새로 생성
    if (!config.externalServers[id]) {
      // 내장 서버(google-home, todo)는 수정 불가
      if (id === 'google-home' || id === 'todo' || id === 'hub-server') {
        return res.status(400).json({ success: false, error: '내장 서버는 수정할 수 없습니다' });
      }
      // 새 외부 서버 생성
      config.externalServers[id] = { name: name || id, url: url || '' };
    }

    // 정보 업데이트
    if (name) config.externalServers[id].name = name;
    if (url) config.externalServers[id].url = url;
    if (enabled !== undefined) {
      config.servers[id] = { enabled };
    }

    await saveServerConfig(config);
    console.log(`[MCP] Server updated: ${id}`);

    res.json({ success: true, server: config.externalServers[id] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mcp/servers/:id/enable
 * MCP 서버 활성화/비활성화
 */
router.post('/servers/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    // 설정 로드
    const config = await loadServerConfig();

    // 서버 상태 업데이트
    if (!config.servers) {
      config.servers = {};
    }
    config.servers[id] = { enabled: !!enabled };

    // 설정 저장
    await saveServerConfig(config);

    // 도구 캐시 초기화 (즉시 반영되도록)
    clearMCPCache();

    console.log(`[MCP] Server ${id} ${enabled ? 'enabled' : 'disabled'}`);

    res.json({
      success: true,
      server: id,
      enabled: !!enabled
    });
  } catch (error) {
    console.error('Error toggling server:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/servers/:id
 * MCP 서버 정보 업데이트 (이름, 아이콘, UI URL, 독 표시 등)
 */
router.post('/servers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, uiUrl, showInDock } = req.body;

    const config = await loadServerConfig();

    // 외부 서버인 경우 externalServers 업데이트
    if (config.externalServers?.[id]) {
      if (name !== undefined) config.externalServers[id].name = name;
      if (description !== undefined) config.externalServers[id].description = description;
      if (icon !== undefined) config.externalServers[id].icon = icon;
      if (uiUrl !== undefined) config.externalServers[id].uiUrl = uiUrl;
      if (showInDock !== undefined) config.externalServers[id].showInDock = showInDock;
    } else {
      // 내장 서버인 경우 servers에 저장
      if (!config.servers) config.servers = {};
      if (!config.servers[id]) config.servers[id] = {};
      if (name !== undefined) config.servers[id].name = name;
      if (description !== undefined) config.servers[id].description = description;
      if (icon !== undefined) config.servers[id].icon = icon;
      if (uiUrl !== undefined) config.servers[id].uiUrl = uiUrl;
      if (showInDock !== undefined) config.servers[id].showInDock = showInDock;
    }

    await saveServerConfig(config);

    console.log(`[MCP] Server ${id} updated:`, { name, description, icon, uiUrl, showInDock });

    res.json({ success: true, server: id });
  } catch (error) {
    console.error('Error updating server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mcp/google-home/control
 * Google Home 기기 제어
 */
router.post('/google-home/control', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'command is required'
      });
    }

    // MCP 도구 실행
    const { executeMCPTool, loadMCPTools } = require('../utils/mcp-tools');
    loadMCPTools();

    const result = await executeMCPTool('control_smart_device', { command });

    res.json({
      success: true,
      command,
      result
    });
  } catch (error) {
    console.error('Error controlling device:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/google-home/devices
 * Google Home 기기 목록 조회
 */
router.get('/google-home/devices', async (req, res) => {
  try {
    const devicesPath = path.join(__dirname, '../../mcp/google-home/devices.json');

    if (!await fs.access(devicesPath).then(() => true).catch(() => false)) {
      return res.json({
        success: false,
        error: 'devices.json not found. Parse HomeApp.json first.',
        devices: []
      });
    }

    const devices = JSON.parse(await fs.readFile(devicesPath, 'utf-8'));

    // 구조물 > 방 > 기기 계층 구조로 그룹화
    const byStructure = {};
    for (const device of devices) {
      const structure = device.structure || '미지정';
      const room = device.room || '미지정';

      if (!byStructure[structure]) {
        byStructure[structure] = { rooms: {}, deviceCount: 0 };
      }
      if (!byStructure[structure].rooms[room]) {
        byStructure[structure].rooms[room] = [];
      }

      byStructure[structure].rooms[room].push({
        id: device.id,
        name: device.name,
        type: device.type,
        state: device.state,
        online: device.online,
        structure,
        room
      });
      byStructure[structure].deviceCount++;
    }

    // 구버전 호환: byRoom도 제공
    const byRoom = {};
    for (const device of devices) {
      const room = device.room || '미지정';
      if (!byRoom[room]) byRoom[room] = [];
      byRoom[room].push({
        id: device.id,
        name: device.name,
        type: device.type,
        state: device.state,
        online: device.online,
        structure: device.structure,
        room
      });
    }

    res.json({
      success: true,
      total: devices.length,
      byStructure,
      byRoom,
      devices
    });
  } catch (error) {
    console.error('Error getting Google Home devices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/google-home/summary
 * Google Home 요약 정보
 */
router.get('/google-home/summary', async (req, res) => {
  try {
    const devicesPath = path.join(__dirname, '../../mcp/google-home/devices.json');

    if (!await fs.access(devicesPath).then(() => true).catch(() => false)) {
      return res.json({
        success: false,
        connected: false,
        message: 'Google Home 연결 안됨'
      });
    }

    const devices = JSON.parse(await fs.readFile(devicesPath, 'utf-8'));
    const onCount = devices.filter(d => d.state?.on === true).length;
    const rooms = [...new Set(devices.map(d => d.room))].filter(Boolean);

    res.json({
      success: true,
      connected: true,
      총기기: devices.length,
      켜진기기: onCount,
      방수: rooms.length,
      방목록: rooms
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== Apple TV API (MCP 프록시) ==========

/**
 * GET /api/mcp/google-home/appletv/devices
 * Apple TV 기기 목록
 */
router.get('/google-home/appletv/devices', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/appletv/devices`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mcp/google-home/appletv/control
 * Apple TV 제어
 */
router.post('/google-home/appletv/control', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/appletv/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== AirPlay API (MCP 프록시) ==========

/**
 * GET /api/mcp/google-home/airplay/devices
 * AirPlay 기기 목록
 */
router.get('/google-home/airplay/devices', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/airplay/devices`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== Network API (MCP 프록시) ==========

/**
 * GET /api/mcp/google-home/network/scan
 * 네트워크 스캔
 */
router.get('/google-home/network/scan', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/network/scan`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/mcp/google-home/network/info
 * 네트워크 정보
 */
router.get('/google-home/network/info', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/network/info`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mcp/google-home/network/wol
 * Wake-on-LAN
 */
router.post('/google-home/network/wol', async (req, res) => {
  try {
    const serverUrl = getMcpServerUrl('google-home');
    const response = await fetch(`${serverUrl}/api/network/wol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
