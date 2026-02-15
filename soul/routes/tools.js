/**
 * routes/tools.js
 *
 * 내장 도구 관련 API 엔드포인트
 */

const express = require('express');
const router = express.Router();
const { builtinTools } = require('../utils/builtin-tools');
const TodoModel = require('../models/Todo');

/**
 * GET /api/tools/builtin/list
 *
 * 31개 내장 도구 목록 반환
 */
router.get('/builtin/list', (req, res) => {
  try {
    // builtin-tools.js에서 export한 도구 배열
    const tools = builtinTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: getCategoryFromToolName(tool.name),
      input_schema: tool.input_schema
    }));

    res.json({
      success: true,
      tools,
      total: tools.length
    });
  } catch (error) {
    console.error('도구 목록 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: '도구 목록을 불러올 수 없습니다'
    });
  }
});

/**
 * 도구 이름으로 카테고리 추정
 */
function getCategoryFromToolName(name) {
  const categories = {
    memory: ['recall_memory', 'save_memory', 'update_memory', 'list_memories'],
    profile: ['get_profile', 'update_profile', 'update_tags'],
    messaging: ['send_message', 'schedule_message', 'cancel_scheduled_message', 'list_scheduled_messages'],
    calendar: ['get_events', 'create_event', 'update_event', 'delete_event'],
    todo: ['manage_todo'],
    note: ['manage_note'],
    web: ['search_web', 'read_url', 'browse'],
    file: ['file_read', 'file_write', 'file_list', 'file_info'],
    cloud: ['cloud_search', 'cloud_read', 'cloud_write', 'cloud_delete', 'cloud_list'],
    system: ['execute_command', 'get_weather']
  };

  for (const [category, tools] of Object.entries(categories)) {
    if (tools.includes(name)) {
      return category;
    }
  }

  return 'other';
}

/**
 * POST /api/tools/builtin/manage_todo
 *
 * 할일 관리 API
 */
router.post('/builtin/manage_todo', async (req, res) => {
  try {
    const { action, todo_id, title, description, status, priority, dueDate, due_date, tags } = req.body;

    switch (action) {
      case 'list': {
        const todos = await TodoModel.getAllTodos();
        return res.json({ success: true, todos });
      }

      case 'create': {
        if (!title) {
          return res.status(400).json({ success: false, error: 'Title is required' });
        }
        const todo = await TodoModel.createTodo({
          title,
          description,
          priority: priority || 'medium',
          dueDate: dueDate || due_date,
          tags
        });
        return res.json({ success: true, todo });
      }

      case 'update': {
        if (!todo_id) {
          return res.status(400).json({ success: false, error: 'todo_id is required' });
        }
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (priority !== undefined) updates.priority = priority;
        if (dueDate !== undefined || due_date !== undefined) updates.due_date = dueDate || due_date;
        if (tags !== undefined) updates.tags = tags;

        await TodoModel.updateTodo(todo_id, updates);
        const updated = await TodoModel.getTodoById(todo_id);
        return res.json({ success: true, todo: updated });
      }

      case 'delete': {
        if (!todo_id) {
          return res.status(400).json({ success: false, error: 'todo_id is required' });
        }
        await TodoModel.deleteTodo(todo_id);
        return res.json({ success: true });
      }

      case 'toggle': {
        if (!todo_id) {
          return res.status(400).json({ success: false, error: 'todo_id is required' });
        }
        const todo = await TodoModel.getTodoById(todo_id);
        if (!todo) {
          return res.status(404).json({ success: false, error: 'Todo not found' });
        }
        const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
        await TodoModel.updateTodo(todo_id, { status: newStatus });
        const updated = await TodoModel.getTodoById(todo_id);
        return res.json({ success: true, todo: updated });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('manage_todo error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tools/builtin/:toolName
 * 범용 builtin 도구 실행 API (패널 UI에서 직접 호출)
 */
router.post('/builtin/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const { executeBuiltinTool, isBuiltinTool } = require('../utils/builtin-tools');

    if (!isBuiltinTool(toolName)) {
      return res.status(404).json({ success: false, error: `Unknown tool: ${toolName}` });
    }

    const result = await executeBuiltinTool(toolName, req.body);
    res.json(result);
  } catch (error) {
    console.error(`[tools/${req.params.toolName}] Error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
