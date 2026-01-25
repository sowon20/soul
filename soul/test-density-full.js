/**
 * DensityManager buildContext 풀 테스트 (Alba 포함)
 */

const { getDensityManager, resetDensityManager } = require('./utils/density-manager');

async function testBuildContext() {
  console.log('=== buildContext 압축 테스트 ===\n');
  
  resetDensityManager();
  
  const densityManager = getDensityManager({
    maxContextTokens: 1000,
    ratios: { level0: 0.8, level1: 0.1, level2: 0.1 },
    compressionThreshold: 0.9,
    minMessagesForCompression: 5
  });

  // 테스트 메시지 (토큰 초과)
  const testMessages = [];
  for (let i = 0; i < 15; i++) {
    testMessages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `대화 ${i}: 오늘 회의 정말 길었어. 3시간이나 했거든. 피곤해 죽겠어.`,
      timestamp: new Date(Date.now() - (15 - i) * 60000),
      tokens: 80
    });
  }
  
  console.log(`입력: ${testMessages.length}개 메시지, 총 ${testMessages.length * 80} 토큰\n`);

  try {
    const result = await densityManager.buildContext(testMessages);
    
    console.log('결과:');
    console.log(`  압축 여부: ${result.compressed}`);
    console.log(`  출력 메시지 수: ${result.messages.length}개`);
    console.log(`  Stats:`, result.stats);
    
    console.log('\n출력 메시지 미리보기:');
    result.messages.forEach((m, i) => {
      const preview = m.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(`  [${i}] L${m.densityLevel || 0} ${m.role}: ${preview}...`);
    });
    
  } catch (err) {
    console.error('에러:', err.message);
  }
}

testBuildContext().catch(console.error);
