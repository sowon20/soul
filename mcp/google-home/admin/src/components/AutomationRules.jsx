import { useState, useEffect } from 'react'
import { getAutomationRules, saveAutomationRules } from '../api/client'

export default function AutomationRules({ devices, tools, onError }) {
  const [rules, setRules] = useState([])
  const [editingRule, setEditingRule] = useState(null)
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    setRules(getAutomationRules())
  }, [])

  const emptyRule = {
    id: '',
    name: '',
    enabled: true,
    condition: {
      type: 'time', // time, state
      value: '',
    },
    action: {
      toolName: '',
      params: {},
    }
  }

  const handleSave = (rule) => {
    let newRules
    if (isAdding) {
      rule.id = Date.now().toString()
      newRules = [...rules, rule]
    } else {
      newRules = rules.map(r => r.id === rule.id ? rule : r)
    }
    setRules(newRules)
    saveAutomationRules(newRules)
    setEditingRule(null)
    setIsAdding(false)
  }

  const handleDelete = (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const newRules = rules.filter(r => r.id !== id)
    setRules(newRules)
    saveAutomationRules(newRules)
  }

  const handleToggle = (id) => {
    const newRules = rules.map(r =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    )
    setRules(newRules)
    saveAutomationRules(newRules)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">자동화 규칙</h2>
        <button
          onClick={() => {
            setEditingRule(emptyRule)
            setIsAdding(true)
          }}
          className="btn btn-primary"
        >
          + 규칙 추가
        </button>
      </div>

      <div className="card bg-yellow-900/20 border-yellow-700/50">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="font-medium text-yellow-400">개발 중인 기능</div>
            <p className="text-sm text-yellow-500/80 mt-1">
              자동화 규칙은 현재 UI만 제공되며, 실제 실행은 별도 스케줄러 구현이 필요합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 규칙 목록 */}
      <div className="grid gap-4">
        {rules.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-4">⚡</div>
            <div className="text-gray-400">등록된 자동화 규칙이 없습니다.</div>
          </div>
        ) : (
          rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              tools={tools}
              onEdit={() => {
                setEditingRule(rule)
                setIsAdding(false)
              }}
              onDelete={() => handleDelete(rule.id)}
              onToggle={() => handleToggle(rule.id)}
            />
          ))
        )}
      </div>

      {/* 편집 모달 */}
      {editingRule && (
        <RuleEditModal
          rule={editingRule}
          tools={tools}
          devices={devices}
          isNew={isAdding}
          onSave={handleSave}
          onClose={() => {
            setEditingRule(null)
            setIsAdding(false)
          }}
        />
      )}
    </div>
  )
}

function RuleCard({ rule, tools, onEdit, onDelete, onToggle }) {
  const tool = tools.find(t => t.name === rule.action?.toolName)

  return (
    <div className={`card ${!rule.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">⚡</span>
            <div>
              <h3 className="font-semibold text-white">{rule.name || '이름 없음'}</h3>
              <span className={`text-xs ${rule.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                {rule.enabled ? '활성화' : '비활성화'}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="badge badge-warning">조건</span>
              <span className="text-gray-300">
                {rule.condition?.type === 'time' ? `시간: ${rule.condition.value}` : `상태: ${rule.condition.value}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-info">실행</span>
              <span className="text-gray-300 font-mono">{rule.action?.toolName || '-'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 토글 스위치 */}
          <button
            onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-colors ${
              rule.enabled ? 'bg-green-600' : 'bg-dark-600'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${
                rule.enabled ? 'translate-x-6' : ''
              }`}
            />
          </button>
          <button onClick={onEdit} className="btn btn-secondary text-sm">
            수정
          </button>
          <button onClick={onDelete} className="btn btn-danger text-sm">
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

function RuleEditModal({ rule, tools, devices, isNew, onSave, onClose }) {
  const [form, setForm] = useState(rule)

  const handleChange = (path, value) => {
    const keys = path.split('.')
    setForm(prev => {
      const newForm = { ...prev }
      let current = newForm
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] }
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
      return newForm
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name) {
      alert('규칙 이름을 입력하세요.')
      return
    }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-dark-600">
          <h3 className="text-xl font-bold text-white">
            {isNew ? '규칙 추가' : '규칙 수정'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">규칙 이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="예: 아침 보일러 켜기"
              className="input"
            />
          </div>

          <div>
            <label className="label">조건 타입</label>
            <select
              value={form.condition?.type}
              onChange={(e) => handleChange('condition.type', e.target.value)}
              className="input"
            >
              <option value="time">시간</option>
              <option value="state">상태</option>
            </select>
          </div>

          <div>
            <label className="label">
              {form.condition?.type === 'time' ? '시간 (HH:MM)' : '상태 조건'}
            </label>
            <input
              type={form.condition?.type === 'time' ? 'time' : 'text'}
              value={form.condition?.value}
              onChange={(e) => handleChange('condition.value', e.target.value)}
              placeholder={form.condition?.type === 'time' ? '07:00' : 'temperature > 25'}
              className="input"
            />
          </div>

          <div>
            <label className="label">실행할 Tool</label>
            <select
              value={form.action?.toolName}
              onChange={(e) => handleChange('action.toolName', e.target.value)}
              className="input"
            >
              <option value="">선택하세요</option>
              {tools.map(tool => (
                <option key={tool.name} value={tool.name}>{tool.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">파라미터 (JSON)</label>
            <textarea
              value={JSON.stringify(form.action?.params || {}, null, 2)}
              onChange={(e) => {
                try {
                  handleChange('action.params', JSON.parse(e.target.value))
                } catch {}
              }}
              className="input h-32 font-mono text-sm"
              placeholder='{"agentUserId": "user123"}'
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn btn-primary flex-1">
              저장
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
