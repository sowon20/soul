#!/usr/bin/env node

/**
 * example-client.js
 * Soul MCP 클라이언트 예제
 *
 * MCP 도구를 직접 호출하는 예제 코드
 */

// 도구 직접 import (MCP 클라이언트 없이 테스트)
const memoryTool = require('./tools/memory-tool');
const contextTool = require('./tools/context-tool');
const nlpTool = require('./tools/nlp-tool');

/**
 * 예제 1: 메모리 검색
 */
async function example1_searchMemory() {
  console.log('\n=== Example 1: 메모리 검색 ===\n');

  const searchTool = memoryTool.tools.find(t => t.name === 'search_memory');
  const result = await searchTool.handler({
    query: 'React 최적화',
    limit: 3
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 예제 2: 컨텍스트 감지
 */
async function example2_detectContext() {
  console.log('\n=== Example 2: 컨텍스트 감지 ===\n');

  const detectTool = contextTool.tools.find(t => t.name === 'detect_context');
  const result = await detectTool.handler({
    message: '저번에 얘기했던 MongoDB 프로젝트 어떻게 됐어?'
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 예제 3: 의도 감지
 */
async function example3_detectIntent() {
  console.log('\n=== Example 3: 의도 감지 ===\n');

  const intentTool = nlpTool.tools.find(t => t.name === 'detect_intent');
  const result = await intentTool.handler({
    message: '메모리 패널 열어줘',
    context: {
      currentPanel: 'none'
    }
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 예제 4: 토큰 분석
 */
async function example4_analyzeTokens() {
  console.log('\n=== Example 4: 토큰 분석 ===\n');

  const tokenTool = contextTool.tools.find(t => t.name === 'analyze_tokens');
  const result = await tokenTool.handler({
    messages: [
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' }
    ],
    model: 'gpt-4'
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 예제 5: 비유 검색
 */
async function example5_findAnalogies() {
  console.log('\n=== Example 5: 비유 검색 ===\n');

  const analogyTool = contextTool.tools.find(t => t.name === 'find_analogies');
  const result = await analogyTool.handler({
    message: 'React 렌더링 문제 해결해야 해',
    limit: 3
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 예제 6: 액션 실행
 */
async function example6_executeIntent() {
  console.log('\n=== Example 6: 액션 실행 ===\n');

  const executeTool = nlpTool.tools.find(t => t.name === 'execute_intent');
  const result = await executeTool.handler({
    message: '최근 10개 대화 보여줘'
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

/**
 * 메인 함수
 */
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║      Soul MCP Tools - Example Client          ║');
  console.log('╚════════════════════════════════════════════════╝');

  console.log('\n💡 Note: Soul API 서버가 http://localhost:3080 에서 실행 중이어야 합니다.\n');

  try {
    // 예제 선택
    const args = process.argv.slice(2);
    const exampleNum = args[0] ? parseInt(args[0]) : 0;

    if (exampleNum === 0) {
      // 모든 예제 실행
      await example1_searchMemory();
      await example2_detectContext();
      await example3_detectIntent();
      await example4_analyzeTokens();
      await example5_findAnalogies();
      await example6_executeIntent();
    } else {
      // 특정 예제만 실행
      const examples = [
        null,
        example1_searchMemory,
        example2_detectContext,
        example3_detectIntent,
        example4_analyzeTokens,
        example5_findAnalogies,
        example6_executeIntent
      ];

      if (examples[exampleNum]) {
        await examples[exampleNum]();
      } else {
        console.log('Invalid example number. Use 1-6 or 0 for all.');
      }
    }

    console.log('\n✅ Examples completed!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure Soul API server is running on http://localhost:3080\n');
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
}

module.exports = {
  example1_searchMemory,
  example2_detectContext,
  example3_detectIntent,
  example4_analyzeTokens,
  example5_findAnalogies,
  example6_executeIntent
};
