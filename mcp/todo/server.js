import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.text());

// 경로 설정 (환경변수로 오버라이드 가능)
const TODO_PATH = process.env.TODO_PATH || path.join(__dirname, "../../data/todo.md");
const PORT = process.env.TODO_MCP_PORT || 8124;

// data 폴더 없으면 생성
const dataDir = path.dirname(TODO_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// todo.md 없으면 기본 파일 생성
if (!fs.existsSync(TODO_PATH)) {
  fs.writeFileSync(TODO_PATH, `### Tasks

Phase 1: Setup
- [ ] Initial setup
- [ ] Configuration

### Notes

메모를 여기에 작성하세요.
`, "utf-8");
}

let transport = null;

const server = new Server({
  name: "soul-todo-mcp",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

// MCP 도구 정의
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "manage_todo",
    description: "todo.md 파일을 읽거나 수정합니다. 할 일 목록 관리에 사용합니다.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write"],
          description: "read: 현재 todo 읽기, write: todo 수정"
        },
        content: {
          type: "string",
          description: "write 시 저장할 마크다운 내용"
        }
      },
      required: ["action"]
    }
  }, {
    name: "toggle_task",
    description: "특정 태스크의 완료 상태를 토글합니다.",
    inputSchema: {
      type: "object",
      properties: {
        taskText: {
          type: "string",
          description: "토글할 태스크 텍스트 (일부만 입력해도 매칭)"
        }
      },
      required: ["taskText"]
    }
  }, {
    name: "add_task",
    description: "새 태스크를 추가합니다.",
    inputSchema: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          description: "탭 이름 (### 뒤의 이름)"
        },
        phase: {
          type: "string",
          description: "Phase 이름 (선택사항)"
        },
        task: {
          type: "string",
          description: "추가할 태스크 내용"
        }
      },
      required: ["task"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === "manage_todo") {
      const { action, content } = args;
      if (action === "read") {
        const data = fs.readFileSync(TODO_PATH, "utf-8");
        return { content: [{ type: "text", text: data }] };
      }
      fs.writeFileSync(TODO_PATH, content || "", "utf-8");
      return { content: [{ type: "text", text: "성공적으로 저장되었습니다." }] };
    }

    if (name === "toggle_task") {
      const { taskText } = args;
      let data = fs.readFileSync(TODO_PATH, "utf-8");
      const lines = data.split('\n');
      let toggled = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(taskText)) {
          if (lines[i].includes('- [ ]')) {
            lines[i] = lines[i].replace('- [ ]', '- [x]');
            toggled = true;
          } else if (lines[i].includes('- [x]')) {
            lines[i] = lines[i].replace('- [x]', '- [ ]');
            toggled = true;
          }
          break;
        }
      }

      if (toggled) {
        fs.writeFileSync(TODO_PATH, lines.join('\n'), "utf-8");
        return { content: [{ type: "text", text: `태스크 "${taskText}" 토글 완료` }] };
      }
      return { content: [{ type: "text", text: `태스크 "${taskText}"를 찾을 수 없습니다.` }] };
    }

    if (name === "add_task") {
      const { tab = "Tasks", phase, task } = args;
      let data = fs.readFileSync(TODO_PATH, "utf-8");
      const lines = data.split('\n');

      // 탭 찾기
      let tabIndex = lines.findIndex(l => l.trim() === `### ${tab}`);
      if (tabIndex === -1) {
        // 탭 없으면 끝에 추가
        lines.push('', `### ${tab}`, '', `- [ ] ${task}`);
      } else {
        // 탭 안에서 적절한 위치 찾기
        let insertIndex = tabIndex + 1;
        for (let i = tabIndex + 1; i < lines.length; i++) {
          if (lines[i].startsWith('### ')) break;
          if (phase && lines[i].toLowerCase().includes(phase.toLowerCase())) {
            insertIndex = i + 1;
            // phase 내의 마지막 항목 뒤에 삽입
            while (insertIndex < lines.length &&
                   !lines[insertIndex].startsWith('### ') &&
                   !lines[insertIndex].toLowerCase().startsWith('phase')) {
              if (lines[insertIndex].trim() === '') break;
              insertIndex++;
            }
            break;
          }
          insertIndex = i + 1;
        }
        lines.splice(insertIndex, 0, `- [ ] ${task}`);
      }

      fs.writeFileSync(TODO_PATH, lines.join('\n'), "utf-8");
      return { content: [{ type: "text", text: `태스크 "${task}" 추가 완료` }] };
    }

    return { isError: true, content: [{ type: "text", text: `알 수 없는 도구: ${name}` }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});

// SSE 연결 (MCP)
app.get("/sse", async (req, res) => {
  console.log("🚀 MCP 클라이언트 연결!");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write('retry: 1000\n\n');

  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  req.on('close', () => {
    console.log("❌ MCP 연결 종료");
    if (transport) {
      transport.close();
      transport = null;
    }
  });
});

// MCP 메시지 처리
app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport active");
  }
});

// === Web UI API ===

// Todo 읽기
app.get("/api/todo", (req, res) => {
  try {
    const data = fs.readFileSync(TODO_PATH, "utf-8");
    res.type("text/plain").send(data);
  } catch (e) {
    res.status(500).send("파일 읽기 실패: " + e.message);
  }
});

// Todo 저장
app.post("/api/todo", (req, res) => {
  try {
    fs.writeFileSync(TODO_PATH, req.body || "", "utf-8");
    res.send("OK");
  } catch (e) {
    res.status(500).send("파일 저장 실패: " + e.message);
  }
});

// 정적 파일 서빙 (UI)
app.use(express.static(__dirname));

// 서버 시작
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Todo MCP 서버 시작: http://localhost:${PORT}`);
  console.log(`📁 Todo 파일: ${TODO_PATH}`);
  console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
  console.log(`🌐 Web UI: http://localhost:${PORT}/`);
});
