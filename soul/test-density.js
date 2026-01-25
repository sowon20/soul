/**
 * DensityManager 80/10/10 검증 테스트
 */

const { getDensityManager } = require('./utils/density-manager');

async function test() {
  console.log('=== DensityManager 80/10/10 테스트 ===\n');
  
  // 1. 설정
  const densityManager = getDensityManager({
    maxContextTokens: 1000,  // 테스트용 작은 값
    ratios: { level0: 0.8, level1: 0.1, level2: 0.1 },
    compressionThreshold: 0.9,
    minMessagesForCompression: 5
  });

  console.log('Token Budgets:', densityManager.getTokenBudgets());
  // 예상: level0=800, level1=100, level2=100

  // 2. 테스트 메시지 생성 (토큰 초과 시뮬레이션)
  const testMessages = [];
  for (let i = 0; i < 20; i++) {
    testMessages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `테스트 메시지 ${i}. 이것은 꽤 긴 메시지입니다. 압축 테스트를 위해 일부러 길게 작성했습니다.`,
      timestamp: new Date(Date.now() - (20 - i) * 60000), // 과거~현재
      tokens: 60  // 각 메시지 약 60토큰
    });
  }
  
  const totalTokens = testMessages.reduce((sum, m) => sum + m.tokens, 0);
  console.log(`\n총 메시지: ${testMessages.length}개`);
  console.log(`총 토큰: ${totalTokens} (임계값: ${1000 * 0.9} = 900)`);

  // 3. 압축 필요 여부 체크
  const check = densityManager.needsCompression(testMessages);
  console.log('\n압축 필요 여부:', check);

  // 4. 메시지 분류
  const categorized = densityManager.categorizeMessages(testMessages);
  console.log('\n메시지 분류 결과:');
  console.log(`  Level 0 (원문): ${categorized.level0.length}개`);
  console.log(`  Level 1 (느슨한 압축): ${categorized.level1.length}개`);
  console.log(`  Level 2 (더 압축): ${categorized.level2.length}개`);
  console.log('  Token Usage:', categorized.tokenUsage);

  // 5. buildContext 테스트 (실제 압축은 Alba 필요)
  console.log('\n=== buildContext는 Alba 연동 필요 (건너뜀) ===');
  
  console.log('\n✅ 테스트 완료');
}

test().catch(console.error);
