/**
 * file-snapshot.js
 * 턴 단위 파일 스냅샷 관리
 *
 * - 메모리 내 보관 (서버 재시작 시 리셋)
 * - 파일별 최근 5턴 이력
 * - "되돌려줘" = 해당 턴의 모든 파일을 이전 상태로 복원
 *
 * 턴 = 하나의 사용자 메시지에 대한 AI 응답 (여러 도구 호출 포함)
 */

const fs = require('fs');
const path = require('path');

const MAX_TURNS_PER_FILE = 5;

class FileSnapshotManager {
  constructor() {
    // filePath → [{turnId, content, timestamp}] (최근 5개)
    this.snapshots = new Map();

    // turnId → Set<filePath> (해당 턴에서 변경된 파일 목록)
    this.turnFiles = new Map();
  }

  /**
   * 스냅샷 찍기 (file_write 전에 호출)
   * 같은 턴에서 같은 파일은 처음 한 번만 스냅샷
   *
   * @param {string} turnId - 턴 식별자
   * @param {string} filePath - 절대 경로
   * @returns {Promise<{snapshotted: boolean, isNew: boolean}>}
   */
  async takeSnapshot(turnId, filePath) {
    // 이 턴에서 이미 스냅샷 찍었으면 스킵
    const turnKey = `${turnId}:${filePath}`;
    if (this.turnFiles.has(turnId) && this.turnFiles.get(turnId).has(filePath)) {
      return { snapshotted: false, isNew: false };
    }

    // 현재 파일 내용 읽기 (없으면 null = 새 파일)
    let content = null;
    let isNew = true;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
      isNew = false;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[file-snapshot] 파일 읽기 실패:', err.message);
      }
      // ENOENT = 새 파일, content = null
    }

    // 스냅샷 저장
    if (!this.snapshots.has(filePath)) {
      this.snapshots.set(filePath, []);
    }
    const history = this.snapshots.get(filePath);
    history.push({
      turnId,
      content, // null이면 파일이 없었음 (새 생성)
      timestamp: new Date().toISOString()
    });

    // 최대 5턴만 보관
    if (history.length > MAX_TURNS_PER_FILE) {
      history.shift();
    }

    // 턴별 파일 목록 기록
    if (!this.turnFiles.has(turnId)) {
      this.turnFiles.set(turnId, new Set());
    }
    this.turnFiles.get(turnId).add(filePath);

    return { snapshotted: true, isNew };
  }

  /**
   * 특정 턴의 모든 변경 되돌리기
   * @param {string} turnId - 되돌릴 턴 ID
   * @returns {Promise<{restored: string[], errors: string[]}>}
   */
  async restoreTurn(turnId) {
    const files = this.turnFiles.get(turnId);
    if (!files || files.size === 0) {
      return { restored: [], errors: ['해당 턴의 변경 이력이 없습니다.'] };
    }

    const restored = [];
    const errors = [];

    for (const filePath of files) {
      const history = this.snapshots.get(filePath);
      if (!history) continue;

      // 해당 턴의 스냅샷 찾기
      const snapshot = history.find(s => s.turnId === turnId);
      if (!snapshot) continue;

      try {
        if (snapshot.content === null) {
          // 파일이 없었으므로 삭제
          try {
            await fs.promises.unlink(filePath);
            restored.push(`${filePath} (삭제됨 → 원래 없던 파일)`);
          } catch (unlinkErr) {
            if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
            restored.push(`${filePath} (이미 없음)`);
          }
        } else {
          // 이전 내용으로 복원
          await fs.promises.writeFile(filePath, snapshot.content, 'utf-8');
          restored.push(`${filePath} (복원됨)`);
        }
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
      }
    }

    // 복원 후 해당 턴의 스냅샷 제거
    for (const filePath of files) {
      const history = this.snapshots.get(filePath);
      if (history) {
        const idx = history.findIndex(s => s.turnId === turnId);
        if (idx !== -1) history.splice(idx, 1);
        if (history.length === 0) this.snapshots.delete(filePath);
      }
    }
    this.turnFiles.delete(turnId);

    return { restored, errors };
  }

  /**
   * 파일별 최근 변경 이력 조회
   * @param {string} filePath - 파일 경로
   * @returns {Array<{turnId, timestamp, hasContent}>}
   */
  listHistory(filePath) {
    const history = this.snapshots.get(filePath);
    if (!history) return [];

    return history.map(s => ({
      turnId: s.turnId,
      timestamp: s.timestamp,
      hadContent: s.content !== null,
      contentPreview: s.content
        ? s.content.slice(0, 100) + (s.content.length > 100 ? '...' : '')
        : '(파일 없었음)'
    }));
  }

  /**
   * 되돌릴 수 있는 턴 목록
   * @returns {Array<{turnId, fileCount, timestamp}>}
   */
  listRestorableTurns() {
    const turns = [];
    for (const [turnId, files] of this.turnFiles) {
      // 해당 턴의 가장 최근 타임스탬프
      let latestTimestamp = '';
      for (const filePath of files) {
        const history = this.snapshots.get(filePath);
        if (history) {
          const snap = history.find(s => s.turnId === turnId);
          if (snap && snap.timestamp > latestTimestamp) {
            latestTimestamp = snap.timestamp;
          }
        }
      }
      turns.push({
        turnId,
        fileCount: files.size,
        files: [...files],
        timestamp: latestTimestamp
      });
    }
    return turns.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * 전체 초기화
   */
  clear() {
    this.snapshots.clear();
    this.turnFiles.clear();
  }
}

// 싱글톤
let instance = null;

function getSnapshotManager() {
  if (!instance) {
    instance = new FileSnapshotManager();
  }
  return instance;
}

module.exports = {
  FileSnapshotManager,
  getSnapshotManager
};
