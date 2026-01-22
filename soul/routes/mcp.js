const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

/**
 * GET /api/mcp/servers
 * MCP 서버 목록 조회
 */
router.get('/servers', async (req, res) => {
  try {
    // soul 디렉토리가 아닌 프로젝트 루트의 mcp 폴더
    const mcpPath = path.join(__dirname, '../../mcp');

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
      enabled: true,
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
          enabled: false, // 기본적으로 비활성화
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

    // TODO: 서버 활성화/비활성화 상태 저장

    res.json({
      success: true,
      server: id,
      enabled
    });
  } catch (error) {
    console.error('Error toggling server:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
