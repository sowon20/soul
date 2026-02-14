/**
 * Todo Model
 * 할일 관리 (SQLite)
 */

const { Todo } = require('../db/models');
const crypto = require('crypto');

/**
 * 모든 할일 조회
 */
async function getAllTodos() {
  return await Todo.find({});
}

/**
 * 할일 생성
 */
async function createTodo({ title, description, priority = 'medium', dueDate, tags }) {
  const todoId = `todo_${crypto.randomUUID()}`;

  const data = {
    todo_id: todoId,
    title,
    description: description || null,
    status: 'pending',
    priority,
    due_date: dueDate || null,
    tags: tags ? JSON.stringify(tags) : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return await Todo.create(data);
}

/**
 * 할일 업데이트
 */
async function updateTodo(todoId, updates) {
  const data = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  // 완료 상태로 변경되면 completed_at 설정
  if (updates.status === 'completed') {
    data.completed_at = new Date().toISOString();
  }

  // tags 배열이면 JSON 문자열로 변환
  if (updates.tags && Array.isArray(updates.tags)) {
    data.tags = JSON.stringify(updates.tags);
  }

  return await Todo.updateOne({ todo_id: todoId }, data);
}

/**
 * 할일 삭제
 */
async function deleteTodo(todoId) {
  return await Todo.deleteOne({ todo_id: todoId });
}

/**
 * 상태별 필터링
 */
async function getTodosByStatus(status) {
  return await Todo.find({ status });
}

/**
 * ID로 조회
 */
async function getTodoById(todoId) {
  const todos = await Todo.find({ todo_id: todoId });
  return todos[0] || null;
}

module.exports = {
  getAllTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodosByStatus,
  getTodoById
};
