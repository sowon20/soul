/**
 * embedding-scheduler.js
 * 매일 아침 7시에 어제 대화를 자동 임베딩
 */
const path = require('path');
const fs = require('fs');

let schedulerTimer = null;

/**
 * 다음 실행 시각까지 ms 계산 (매일 07:00 KST)
 */
function msUntilNext(hour = 7) {
  const now = new Date();
  // KST (Asia/Seoul) 기준
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const target = new Date(kst);
  target.setHours(hour, 0, 0, 0);

  // 이미 지났으면 내일
  if (kst >= target) {
    target.setDate(target.getDate() + 1);
  }

  // UTC 기준으로 변환
  const nowUtc = now.getTime();
  const diffMs = target.getTime() - kst.getTime();
  return diffMs > 0 ? diffMs : 24 * 60 * 60 * 1000;
}

/**
 * 어제 날짜의 대화 파일 경로 구하기
 */
async function getYesterdayFilePath() {
  const localConfig = require('./local-config');
  const settings = await localConfig.getAll();
  const memoryConfig = settings?.memory || {};
  const storagePath = memoryConfig.storagePath;

  if (!storagePath) {
    console.warn('[EmbedScheduler] storagePath 미설정');
    return null;
  }

  // ~ 확장
  const expandedPath = storagePath.replace(/^~/, require('os').homedir());

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterday.getDate()).padStart(2, '0');

  const filePath = path.join(expandedPath, 'conversations', `${yyyy}-${mm}`, `${yyyy}-${mm}-${dd}.json`);
  return filePath;
}

/**
 * 임베딩 실행
 */
async function runEmbedding() {
  console.log('[EmbedScheduler] 자동 임베딩 시작...');

  try {
    const filePath = await getYesterdayFilePath();
    if (!filePath) return;

    if (!fs.existsSync(filePath)) {
      console.log(`[EmbedScheduler] 어제 대화 없음: ${filePath}`);
      return;
    }

    const vectorStore = require('./vector-store');
    const result = await vectorStore.ingestDayJson(filePath, {
      batchDelay: 500,
      maxChunkChars: 1500
    });

    console.log(`[EmbedScheduler] 완료: ${result.embedded} embedded, ${result.skipped} skipped, ${result.errors} errors`);
  } catch (err) {
    console.error('[EmbedScheduler] 실패:', err.message);
  }
}

/**
 * 스케줄러 시작
 */
function scheduleEmbedding() {
  const delay = msUntilNext(7);
  const hours = Math.floor(delay / 1000 / 60 / 60);
  const mins = Math.floor((delay / 1000 / 60) % 60);
  console.log(`[EmbedScheduler] 다음 실행: ${hours}시간 ${mins}분 후`);

  schedulerTimer = setTimeout(async () => {
    await runEmbedding();

    // 24시간마다 반복
    setInterval(async () => {
      await runEmbedding();
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

module.exports = { scheduleEmbedding, runEmbedding };
