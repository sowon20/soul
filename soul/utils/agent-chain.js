/**
 * agent-chain.js
 * 에이전트 체이닝 시스템
 *
 * Phase 5.4.3: 에이전트 체이닝 시스템 (간소화 버전)
 *
 * 기능:
 * - 단일 에이전트
 * - 순차 실행
 * - 병렬 실행
 * - 컨텍스트 전달
 */

/**
 * Agent 클래스
 * 단일 에이전트
 */
class Agent {
  constructor(config) {
    this.id = config.id || `agent-${Date.now()}`;
    this.name = config.name || 'Agent';
    this.role = config.role || 'assistant';
    this.instructions = config.instructions || '';
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.tools = config.tools || [];
  }

  /**
   * 에이전트 실행
   */
  async execute(input, context = {}) {
    try {
      console.log(`Executing agent: ${this.name}`);

      // 여기서는 간단한 처리만 (실제 AI 호출은 향후 구현)
      const result = {
        agentId: this.id,
        agentName: this.name,
        input,
        output: `[${this.name}] Processed: ${JSON.stringify(input)}`,
        context: {
          ...context,
          processedBy: this.name
        },
        timestamp: new Date()
      };

      return result;
    } catch (error) {
      console.error(`Error executing agent ${this.name}:`, error);
      throw error;
    }
  }
}

/**
 * SequentialChain 클래스
 * 순차 실행
 */
class SequentialChain {
  constructor(agents = []) {
    this.agents = agents;
    this.results = [];
  }

  /**
   * 체인 실행
   */
  async execute(initialInput) {
    try {
      let currentInput = initialInput;
      let context = {};

      for (const agent of this.agents) {
        const result = await agent.execute(currentInput, context);
        this.results.push(result);

        // 다음 에이전트의 입력으로 사용
        currentInput = result.output;
        context = result.context;
      }

      return {
        success: true,
        results: this.results,
        finalOutput: currentInput,
        finalContext: context
      };
    } catch (error) {
      console.error('Error executing sequential chain:', error);
      throw error;
    }
  }
}

/**
 * ParallelChain 클래스
 * 병렬 실행
 */
class ParallelChain {
  constructor(agents = []) {
    this.agents = agents;
  }

  /**
   * 체인 실행 (병렬)
   */
  async execute(input, context = {}) {
    try {
      const promises = this.agents.map(agent =>
        agent.execute(input, context)
      );

      const results = await Promise.all(promises);

      return {
        success: true,
        results,
        combinedOutput: results.map(r => r.output).join('\n'),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error executing parallel chain:', error);
      throw error;
    }
  }
}

/**
 * ToolLayer 클래스
 * Tool 레이어 (에이전트가 사용할 수 있는 도구)
 */
class ToolLayer {
  constructor(tools = []) {
    this.tools = tools;
  }

  /**
   * 도구 실행
   */
  async executeTool(toolName, params) {
    const tool = this.tools.find(t => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return await tool.handler(params);
  }

  /**
   * 도구 목록
   */
  getToolList() {
    return this.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }
}

module.exports = {
  Agent,
  SequentialChain,
  ParallelChain,
  ToolLayer
};
