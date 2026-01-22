const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// 서버 상태 설정 파일 경로
const CONFIG_PATH = path.join(__dirname, '../../mcp/server-config.json');

/**
 * 서버 설정 로드
 */
async function loadServerConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    // 파일이 없으면 기본값 반환
    return { servers: {} };
  }
}

/**
 * 서버 설정 저장
 */
async function saveServerConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * GET /api/mcp/servers
 * MCP 서버 목록 조회
 */
router.get('/servers', async (req, res) => {
  try {
    // soul 디렉토리가 아닌 프로젝트 루트의 mcp 폴더
    const mcpPath = path.join(__dirname, '../../mcp');

    // 저장된 서버 설정 로드
    const config = await loadServerConfig();

    // tools 디렉토리에서 도구 목록 가져오기
    const toolsPath = path.join(mcpPath, 'tools');
    const toolFiles = await fs.readdir(toolsPath);

    const servers = [];

    // hub-server (기본 내장 서버)
    servers.push({
      id: 'hub-server',
      name: 'Soul Hub Server',
      description: 'Soul의 내장 MCP 서버 - 메모리, 컨텍스트, NLP 도구 제공',
      type: 'built-in',
      enabled: config.servers['hub-server']?.enabled ?? true,
      tools: toolFiles.filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''))
    });

    // 외부 MCP 서버 스캔
    const entries = await fs.readdir(mcpPath, { withFileTypes: true });
    const serverDirs = entries.filter(e => e.isDirectory() && e.name !== 'tools' && e.name !== 'node_modules');

    for (const dir of serverDirs) {
      const serverPath = path.join(mcpPath, dir.name);
      const packageJsonPath = path.join(serverPath, 'package.json');

      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

        // 기본 포트 매핑
        const portMap = {
          'google-home': 8125,
          'todo': 8124
        };

        servers.push({
          id: dir.name,
          name: packageJson.description || dir.name,
          description: packageJson.description || `${dir.name} MCP Server`,
          type: 'external',
          enabled: config.servers[dir.name]?.enabled ?? false,
          tools: [], // 외부 서버는 별도로 실행되어야 도구 조회 가능
          port: portMap[dir.name] || null,
          webUI: portMap[dir.name] ? `http://localhost:${portMap[dir.name]}` : null
        });
      } catch (error) {
        // package.json이 없거나 읽기 실패 시 무시
        console.warn(`Failed to read package.json for ${dir.name}:`, error.message);
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

    if (id === 'hub-server') {
      const mcpPath = path.join(__dirname, '../../mcp');
      const toolsPath = path.join(mcpPath, 'tools');
      const toolFiles = await fs.readdir(toolsPath);

      const tools = [];

      for (const file of toolFiles) {
        if (file.endsWith('.js')) {
          try {
            const toolModule = require(path.join(toolsPath, file));
            if (toolModule.tools) {
              tools.push(...toolModule.tools.map(t => ({
                name: t.name,
                description: t.description,
                module: toolModule.name || file.replace('.js', '')
              })));
            }
          } catch (error) {
            console.error(`Error loading tool ${file}:`, error);
          }
        }
      }

      res.json({
        success: true,
        server: id,
        tools
      });
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
    const response = await fetch('http://localhost:8125/api/appletv/devices');
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
    const response = await fetch('http://localhost:8125/api/appletv/control', {
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
    const response = await fetch('http://localhost:8125/api/airplay/devices');
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
    const response = await fetch('http://localhost:8125/api/network/scan');
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
    const response = await fetch('http://localhost:8125/api/network/info');
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
    const response = await fetch('http://localhost:8125/api/network/wol', {
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
