/**
 * google-home.js
 * Google Home 스마트홈 관리 API
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const DEVICES_PATH = path.join(__dirname, '../../mcp/google-home/devices.json');
const SETTINGS_PATH = path.join(__dirname, '../../mcp/google-home/settings.json');

/**
 * 설정 로드
 */
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { structures: {}, rooms: {}, devices: {}, lastUpdated: null };
  }
}

/**
 * 설정 저장
 */
async function saveSettings(settings) {
  settings.lastUpdated = new Date().toISOString();
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * 기기 로드
 */
async function loadDevices() {
  try {
    const data = await fs.readFile(DEVICES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * 기기 저장
 */
async function saveDevices(devices) {
  await fs.writeFile(DEVICES_PATH, JSON.stringify(devices, null, 2));
}

// ============ 구조물(장소) API ============

/**
 * GET /api/google-home/structures
 * 구조물 목록 조회
 */
router.get('/structures', async (req, res) => {
  try {
    const devices = await loadDevices();
    const settings = await loadSettings();

    // 기기에서 구조물 추출
    const structureNames = [...new Set(devices.map(d => d.structure).filter(Boolean))];

    const structures = structureNames.map(name => {
      const setting = settings.structures[name] || {};
      const deviceCount = devices.filter(d => d.structure === name).length;

      return {
        name,
        type: setting.type || 'home',
        enabled: setting.enabled !== false,
        hidden: setting.hidden === true,
        deviceCount
      };
    });

    res.json({ success: true, structures });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/google-home/structures/:name
 * 구조물 설정 수정
 */
router.put('/structures/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { type, enabled, hidden, newName } = req.body;

    const settings = await loadSettings();

    if (!settings.structures[name]) {
      settings.structures[name] = {};
    }

    if (type !== undefined) settings.structures[name].type = type;
    if (enabled !== undefined) settings.structures[name].enabled = enabled;
    if (hidden !== undefined) settings.structures[name].hidden = hidden;

    // 이름 변경
    if (newName && newName !== name) {
      const devices = await loadDevices();
      devices.forEach(d => {
        if (d.structure === name) d.structure = newName;
      });
      await saveDevices(devices);

      settings.structures[newName] = { ...settings.structures[name], name: newName };
      delete settings.structures[name];
    }

    await saveSettings(settings);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 방 API ============

/**
 * GET /api/google-home/rooms
 * 방 목록 조회
 */
router.get('/rooms', async (req, res) => {
  try {
    const { structure } = req.query;
    const devices = await loadDevices();
    const settings = await loadSettings();

    let filtered = devices;
    if (structure) {
      filtered = devices.filter(d => d.structure === structure);
    }

    // 방 추출
    const roomMap = {};
    filtered.forEach(d => {
      const room = d.room || '미지정';
      const key = `${d.structure}:${room}`;
      if (!roomMap[key]) {
        const setting = settings.rooms[key] || {};
        roomMap[key] = {
          name: room,
          structure: d.structure,
          enabled: setting.enabled !== false,
          hidden: setting.hidden === true,
          deviceCount: 0
        };
      }
      roomMap[key].deviceCount++;
    });

    res.json({ success: true, rooms: Object.values(roomMap) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/google-home/rooms/:structure/:name
 * 방 설정 수정
 */
router.put('/rooms/:structure/:name', async (req, res) => {
  try {
    const { structure, name } = req.params;
    const { enabled, hidden, newName } = req.body;

    const key = `${structure}:${name}`;
    const settings = await loadSettings();

    if (!settings.rooms[key]) {
      settings.rooms[key] = {};
    }

    if (enabled !== undefined) settings.rooms[key].enabled = enabled;
    if (hidden !== undefined) settings.rooms[key].hidden = hidden;

    // 이름 변경
    if (newName && newName !== name) {
      const devices = await loadDevices();
      devices.forEach(d => {
        if (d.structure === structure && d.room === name) {
          d.room = newName;
        }
      });
      await saveDevices(devices);

      const newKey = `${structure}:${newName}`;
      settings.rooms[newKey] = settings.rooms[key];
      delete settings.rooms[key];
    }

    await saveSettings(settings);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 기기 API ============

/**
 * GET /api/google-home/devices
 * 기기 목록 조회 (필터링 지원)
 */
router.get('/devices', async (req, res) => {
  try {
    const { structure, room, type, showHidden } = req.query;
    let devices = await loadDevices();
    const settings = await loadSettings();

    // 설정 병합
    devices = devices.map(d => {
      const deviceSetting = settings.devices[d.id] || {};
      const roomKey = `${d.structure}:${d.room}`;
      const roomSetting = settings.rooms[roomKey] || {};
      const structureSetting = settings.structures[d.structure] || {};

      return {
        ...d,
        enabled: deviceSetting.enabled !== false,
        hidden: deviceSetting.hidden === true,
        customName: deviceSetting.customName || null,
        roomEnabled: roomSetting.enabled !== false,
        roomHidden: roomSetting.hidden === true,
        structureEnabled: structureSetting.enabled !== false,
        structureHidden: structureSetting.hidden === true
      };
    });

    // 필터링
    if (structure) devices = devices.filter(d => d.structure === structure);
    if (room) devices = devices.filter(d => d.room === room);
    if (type) devices = devices.filter(d => d.type === type);
    if (showHidden !== 'true') {
      devices = devices.filter(d => !d.hidden && !d.roomHidden && !d.structureHidden);
    }

    res.json({ success: true, devices, total: devices.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/google-home/devices/:id
 * 특정 기기 조회
 */
router.get('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const devices = await loadDevices();
    const settings = await loadSettings();

    const device = devices.find(d => d.id === id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const deviceSetting = settings.devices[id] || {};

    res.json({
      success: true,
      device: {
        ...device,
        enabled: deviceSetting.enabled !== false,
        hidden: deviceSetting.hidden === true,
        customName: deviceSetting.customName || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/google-home/devices/:id
 * 기기 설정 수정
 */
router.put('/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, hidden, customName, room, structure } = req.body;

    const settings = await loadSettings();

    if (!settings.devices[id]) {
      settings.devices[id] = {};
    }

    if (enabled !== undefined) settings.devices[id].enabled = enabled;
    if (hidden !== undefined) settings.devices[id].hidden = hidden;
    if (customName !== undefined) settings.devices[id].customName = customName;

    // 방/구조물 변경
    if (room !== undefined || structure !== undefined) {
      const devices = await loadDevices();
      const device = devices.find(d => d.id === id);
      if (device) {
        if (room !== undefined) device.room = room;
        if (structure !== undefined) device.structure = structure;
        await saveDevices(devices);
      }
    }

    await saveSettings(settings);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/google-home/devices/:id/control
 * 기기 제어
 */
router.post('/devices/:id/control', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'on', 'off', 'toggle', 또는 커스텀 명령

    const devices = await loadDevices();
    const device = devices.find(d => d.id === id);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    let command;
    if (action === 'on') {
      command = `${device.name} 켜줘`;
    } else if (action === 'off') {
      command = `${device.name} 꺼줘`;
    } else if (action === 'toggle') {
      const isOn = device.state?.on === true;
      command = `${device.name} ${isOn ? '꺼줘' : '켜줘'}`;
    } else {
      command = `${device.name} ${action}`;
    }

    // MCP 도구 실행
    const { executeMCPTool, loadMCPTools } = require('../utils/mcp-tools');
    loadMCPTools();

    const result = await executeMCPTool('control_smart_device', { command });

    // 상태 업데이트
    if (result.success) {
      const deviceIdx = devices.findIndex(d => d.id === id);
      if (deviceIdx !== -1) {
        if (!devices[deviceIdx].state) devices[deviceIdx].state = {};

        if (action === 'on') {
          devices[deviceIdx].state.on = true;
        } else if (action === 'off') {
          devices[deviceIdx].state.on = false;
        } else if (action === 'toggle') {
          devices[deviceIdx].state.on = !devices[deviceIdx].state.on;
        }

        await saveDevices(devices);
      }
    }

    res.json({ success: true, command, result, newState: device.state });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 일괄 작업 API ============

/**
 * POST /api/google-home/bulk/enable
 * 일괄 활성화/비활성화
 */
router.post('/bulk/enable', async (req, res) => {
  try {
    const { type, ids, enabled } = req.body; // type: 'device', 'room', 'structure'

    const settings = await loadSettings();

    for (const id of ids) {
      if (type === 'device') {
        if (!settings.devices[id]) settings.devices[id] = {};
        settings.devices[id].enabled = enabled;
      } else if (type === 'room') {
        if (!settings.rooms[id]) settings.rooms[id] = {};
        settings.rooms[id].enabled = enabled;
      } else if (type === 'structure') {
        if (!settings.structures[id]) settings.structures[id] = {};
        settings.structures[id].enabled = enabled;
      }
    }

    await saveSettings(settings);
    res.json({ success: true, updated: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/google-home/bulk/hide
 * 일괄 숨기기
 */
router.post('/bulk/hide', async (req, res) => {
  try {
    const { type, ids, hidden } = req.body;

    const settings = await loadSettings();

    for (const id of ids) {
      if (type === 'device') {
        if (!settings.devices[id]) settings.devices[id] = {};
        settings.devices[id].hidden = hidden;
      } else if (type === 'room') {
        if (!settings.rooms[id]) settings.rooms[id] = {};
        settings.rooms[id].hidden = hidden;
      } else if (type === 'structure') {
        if (!settings.structures[id]) settings.structures[id] = {};
        settings.structures[id].hidden = hidden;
      }
    }

    await saveSettings(settings);
    res.json({ success: true, updated: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/google-home/stats
 * 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const devices = await loadDevices();
    const settings = await loadSettings();

    const structures = [...new Set(devices.map(d => d.structure).filter(Boolean))];
    const rooms = [...new Set(devices.map(d => d.room).filter(Boolean))];
    const types = [...new Set(devices.map(d => d.type).filter(Boolean))];

    const onCount = devices.filter(d => d.state?.on === true).length;
    const hiddenDevices = Object.values(settings.devices).filter(d => d.hidden).length;
    const disabledDevices = Object.values(settings.devices).filter(d => d.enabled === false).length;

    res.json({
      success: true,
      stats: {
        totalDevices: devices.length,
        onlineDevices: onCount,
        structures: structures.length,
        rooms: rooms.length,
        deviceTypes: types.length,
        hiddenDevices,
        disabledDevices,
        typeBreakdown: types.map(t => ({
          type: t,
          count: devices.filter(d => d.type === t).length
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
