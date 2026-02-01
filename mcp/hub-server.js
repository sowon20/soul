#!/usr/bin/env node

/**
 * hub-server.js
 * Soul MCP Hub Server
 *
 * Model Context Protocol 서버로 Soul의 모든 기능을 MCP 도구로 노출
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 도구 모듈 로드
const memoryTool = require('./tools/memory-tool');
const contextTool = require('./tools/context-tool');
const nlpTool = require('./tools/nlp-tool');

// 모든 도구 통합
const ALL_TOOLS = [
  memoryTool,
  contextTool,
  nlpTool
];

// 도구 맵 생성
const toolsMap = new Map();
ALL_TOOLS.forEach(module => {
  module.tools.forEach(tool => {
    toolsMap.set(tool.name, {
      ...tool,
      module: module.name
    });
  });
});

/**
 * MCP 서버 생성
 */
class SoulMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'soul-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // 도구 목록 요청 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];

      ALL_TOOLS.forEach(module => {
        module.tools.forEach(tool => {
          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          });
        });
      });

      return { tools };
    });

    // 도구 호출 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = toolsMap.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        console.error(`[MCP] Calling tool: ${name}`);
        console.error(`[MCP] Arguments:`, JSON.stringify(args, null, 2));

        const result = await tool.handler(args || {});

        console.error(`[MCP] Result:`, JSON.stringify(result, null, 2));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`[MCP] Error calling ${name}:`, error);
        throw error;
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[Soul MCP Server] Started successfully');
    console.error(`[Soul MCP Server] Available tools: ${toolsMap.size}`);

    ALL_TOOLS.forEach(module => {
      console.error(`  - ${module.name}: ${module.tools.length} tools`);
      module.tools.forEach(tool => {
        console.error(`    - ${tool.name}: ${tool.description}`);
      });
    });
  }
}

// 서버 시작
if (require.main === module) {
  const server = new SoulMCPServer();
  server.start().catch(error => {
    console.error('[Soul MCP Server] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SoulMCPServer;
