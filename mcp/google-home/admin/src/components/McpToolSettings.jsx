import { useState } from 'react'

export default function McpToolSettings({ tools, devices, onRefresh, onError }) {
  const [selectedTool, setSelectedTool] = useState(null)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">MCP Tools</h2>

      <div className="grid gap-4">
        {tools.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-4">🔧</div>
            <div className="text-gray-400">등록된 도구가 없습니다.</div>
          </div>
        ) : (
          tools.map(tool => (
            <ToolCard
              key={tool.name}
              tool={tool}
              isSelected={selectedTool?.name === tool.name}
              onSelect={() => setSelectedTool(selectedTool?.name === tool.name ? null : tool)}
            />
          ))
        )}
      </div>

      {/* 선택된 도구 상세 */}
      {selectedTool && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            JSON Schema - {selectedTool.name}
          </h3>
          <pre className="bg-dark-900 p-4 rounded-lg text-sm text-gray-300 overflow-x-auto">
            {JSON.stringify(selectedTool.inputSchema, null, 2)}
          </pre>
        </div>
      )}

      {/* MCP 연결 정보 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>📡</span>
          <span>MCP 연결 정보</span>
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">SSE Endpoint:</span>
            <code className="ml-2 bg-dark-900 px-2 py-1 rounded text-blue-400">
              http://localhost:8125/sse
            </code>
          </div>
          <div>
            <span className="text-gray-500">Messages Endpoint:</span>
            <code className="ml-2 bg-dark-900 px-2 py-1 rounded text-blue-400">
              http://localhost:8125/messages
            </code>
          </div>
        </div>

        <div className="mt-4 p-4 bg-dark-900 rounded-lg">
          <div className="text-sm text-gray-400 mb-2">Claude Desktop 설정 예시:</div>
          <pre className="text-xs text-gray-300 overflow-x-auto">
{`{
  "mcpServers": {
    "google-home": {
      "url": "http://localhost:8125/sse"
    }
  }
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}

function ToolCard({ tool, isSelected, onSelect }) {
  const commandMatch = tool.description?.match(/commands\.(\w+)/)?.[1]

  return (
    <div
      className={`card cursor-pointer transition-colors ${
        isSelected ? 'border-blue-500 bg-blue-500/5' : 'hover:border-dark-500'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔧</span>
            <div>
              <h3 className="font-semibold text-white font-mono">{tool.name}</h3>
              {commandMatch && (
                <span className="text-xs text-gray-500">Command: {commandMatch}</span>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-400 mt-2">{tool.description}</p>

          {/* 파라미터 요약 */}
          {tool.inputSchema?.properties && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(tool.inputSchema.properties).map(param => (
                <span key={param} className="badge badge-info font-mono text-xs">
                  {param}
                  {tool.inputSchema.required?.includes(param) && (
                    <span className="text-red-400 ml-1">*</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="text-gray-500">
          {isSelected ? '▼' : '▶'}
        </div>
      </div>
    </div>
  )
}
