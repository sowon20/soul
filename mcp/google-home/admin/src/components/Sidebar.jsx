const menuItems = [
  { id: 'google-home', icon: '🏠', label: 'Google Home 기기' },
  { id: 'homegraph', icon: '⚙️', label: 'HomeGraph 설정' },
  { id: 'devices', icon: '📱', label: '수동 디바이스' },
  { id: 'tools', icon: '🔧', label: 'MCP Tools' },
  { id: 'automation', icon: '⚡', label: '자동화 규칙' },
]

export default function Sidebar({ activeSection, onSectionChange }) {
  return (
    <aside className="w-64 bg-dark-800 border-r border-dark-600 flex flex-col">
      {/* 로고 */}
      <div className="p-6 border-b border-dark-600">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🏠</span>
          <span>Smart Home MCP</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Admin Console</p>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map(item => (
            <li key={item.id}>
              <button
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeSection === item.id
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 하단 정보 */}
      <div className="p-4 border-t border-dark-600">
        <div className="text-xs text-gray-500">
          <div className="flex justify-between mb-1">
            <span>MCP Port</span>
            <span className="text-gray-400">8125</span>
          </div>
          <div className="flex justify-between">
            <span>SSE Endpoint</span>
            <span className="text-gray-400">/sse</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
