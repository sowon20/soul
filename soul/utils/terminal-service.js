/**
 * Terminal Service — 쉘 세션 관리
 *
 * - child_process.spawn으로 인터랙티브 쉘 실행
 * - node-pty 사용 가능하면 우선 사용
 * - 세션 ID 기반 관리 (소켓 끊겨도 쉘 유지 = 백그라운드)
 * - 출력 버퍼 보관 (캔버스 다시 열 때 복원)
 * - Socket.io로 실시간 출력 전달
 */

const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// node-pty 시도 (있으면 사용, 없으면 spawn fallback)
let pty;
let usePty = false;
try {
  pty = require('node-pty');
  // 실제로 spawn 가능한지 테스트
  const test = pty.spawn('/bin/sh', ['-c', 'echo test'], { cols: 10, rows: 10 });
  test.kill();
  usePty = true;
  console.log('🖥️ Terminal: node-pty 사용');
} catch (e) {
  usePty = false;
  console.log('🖥️ Terminal: child_process fallback 사용');
}

const MAX_BUFFER_SIZE = 50000;
const sessions = new Map();

function getDefaultShell() {
  return process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');
}

function getDefaultCwd() {
  return process.env.SOUL_DATA_DIR
    ? path.resolve(process.env.SOUL_DATA_DIR)
    : path.resolve(__dirname, '../..');
}

/**
 * 세션 생성
 */
function createSession(options = {}) {
  const sessionId = options.sessionId || `term-${Date.now()}`;

  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const shell = options.shell || getDefaultShell();
  const cwd = options.cwd || getDefaultCwd();
  const cols = options.cols || 80;
  const rows = options.rows || 24;

  const session = {
    id: sessionId,
    process: null,
    buffer: '',
    createdAt: new Date(),
    listeners: new Set(),
    alive: true,
    isPty: false
  };

  if (usePty) {
    // node-pty 사용
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols, rows, cwd,
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    session.process = ptyProcess;
    session.isPty = true;

    ptyProcess.onData((data) => emitOutput(session, data));
    ptyProcess.onExit(({ exitCode }) => handleExit(session, exitCode));
  } else {
    // child_process fallback (PTY 없이 동작)
    const shellEnv = {
      ...process.env,
      TERM: 'dumb',
      PS1: '\\u@\\h \\W $ ',
      PROMPT: '%n@%m %1~ $ ',
      NO_COLOR: '1'
    };

    const proc = spawn(shell, ['-i'], {
      cwd,
      env: shellEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    session.process = proc;
    session.isPty = false;

    proc.stdout.on('data', (data) => emitOutput(session, data.toString()));
    proc.stderr.on('data', (data) => emitOutput(session, data.toString()));
    proc.on('exit', (code) => handleExit(session, code || 0));
    proc.on('error', (err) => {
      console.error(`🖥️ Terminal error [${sessionId}]:`, err.message);
      handleExit(session, 1);
    });
  }

  sessions.set(sessionId, session);
  console.log(`🖥️ Terminal session created: ${sessionId} (shell: ${shell}, cwd: ${cwd}, pty: ${session.isPty})`);
  return session;
}

/**
 * 출력 처리 공통
 */
function emitOutput(session, data) {
  session.buffer += data;
  if (session.buffer.length > MAX_BUFFER_SIZE) {
    session.buffer = session.buffer.slice(-MAX_BUFFER_SIZE);
  }

  if (global.io) {
    for (const socketId of session.listeners) {
      global.io.to(socketId).emit('terminal:output', {
        sessionId: session.id,
        data
      });
    }
  }
}

/**
 * 종료 처리 공통
 */
function handleExit(session, exitCode) {
  session.alive = false;
  if (global.io) {
    for (const socketId of session.listeners) {
      global.io.to(socketId).emit('terminal:exit', {
        sessionId: session.id,
        exitCode
      });
    }
  }
}

function getOrCreateSession(options = {}) {
  const sessionId = options.sessionId || 'default';
  if (sessions.has(sessionId) && sessions.get(sessionId).alive) {
    return sessions.get(sessionId);
  }
  return createSession({ ...options, sessionId });
}

function writeToSession(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session || !session.alive) {
    throw new Error(`세션 없음: ${sessionId}`);
  }
  if (session.isPty) {
    session.process.write(data);
  } else {
    session.process.stdin.write(data);
  }
}

/**
 * 명령어 실행 + 결과 대기 (AI 도구용)
 */
function executeCommand(sessionId, command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId);
    if (!session || !session.alive) {
      reject(new Error(`세션 없음: ${sessionId}`));
      return;
    }

    let output = '';
    let settled = false;
    let promptTimer = null;

    const onData = (data) => {
      const str = typeof data === 'string' ? data : data.toString();
      output += str;

      if (promptTimer) clearTimeout(promptTimer);
      promptTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(cleanOutput(output, command));
        }
      }, 500);
    };

    let cleanup;
    if (session.isPty) {
      const handler = session.process.onData(onData);
      cleanup = () => handler.dispose();
    } else {
      const stdoutHandler = (d) => onData(d);
      const stderrHandler = (d) => onData(d);
      session.process.stdout.on('data', stdoutHandler);
      session.process.stderr.on('data', stderrHandler);
      cleanup = () => {
        session.process.stdout.removeListener('data', stdoutHandler);
        session.process.stderr.removeListener('data', stderrHandler);
      };
    }

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        if (promptTimer) clearTimeout(promptTimer);
        resolve(cleanOutput(output, command) + '\n[timeout]');
      }
    }, timeout);

    const origResolve = resolve;
    resolve = (val) => {
      clearTimeout(timeoutId);
      origResolve(val);
    };

    // 명령어 전송
    if (session.isPty) {
      session.process.write(command + '\n');
    } else {
      session.process.stdin.write(command + '\n');
    }
  });
}

function cleanOutput(raw, command) {
  const lines = raw.split('\n');

  if (lines.length > 0 && lines[0].includes(command)) {
    lines.shift();
  }

  if (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last.endsWith('$') || last.endsWith('#') || last.endsWith('%') || last.endsWith('>')) {
      lines.pop();
    }
  }

  return lines.join('\n').trim();
}

function resizeSession(sessionId, cols, rows) {
  const session = sessions.get(sessionId);
  if (session && session.alive && session.isPty) {
    session.process.resize(cols, rows);
  }
}

function attachSocket(sessionId, socketId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.listeners.add(socketId);
  }
}

function detachSocket(sessionId, socketId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.listeners.delete(socketId);
  }
}

function detachSocketFromAll(socketId) {
  for (const session of sessions.values()) {
    session.listeners.delete(socketId);
  }
}

function getBuffer(sessionId) {
  const session = sessions.get(sessionId);
  return session ? session.buffer : '';
}

function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    if (session.alive) {
      if (session.isPty) {
        session.process.kill();
      } else {
        session.process.kill('SIGTERM');
      }
    }
    sessions.delete(sessionId);
    console.log(`🖥️ Terminal session destroyed: ${sessionId}`);
  }
}

function listSessions() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    alive: s.alive,
    createdAt: s.createdAt,
    listeners: s.listeners.size,
    isPty: s.isPty
  }));
}

function isAvailable() {
  return true; // spawn fallback이 있으므로 항상 사용 가능
}

module.exports = {
  createSession,
  getOrCreateSession,
  writeToSession,
  executeCommand,
  resizeSession,
  attachSocket,
  detachSocket,
  detachSocketFromAll,
  getBuffer,
  destroySession,
  listSessions,
  isAvailable
};
