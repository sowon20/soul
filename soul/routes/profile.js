/**
 * profile.js
 * 프로필 관리 API 라우트
 *
 * Week 2.5: 시스템 프롬프트 & 프로필 시스템
 *
 * 엔드포인트:
 * - 에이전트 프로필 CRUD
 * - 사용자 프로필 CRUD
 * - 시스템 프롬프트 생성
 */

const express = require('express');
const router = express.Router();
const { getAgentProfileManager } = require('../utils/agent-profile');
const { getUserProfileManager } = require('../utils/user-profile');

// ============================================
// 에이전트 프로필 API
// ============================================

/**
 * GET /api/profile/agent
 * 모든 에이전트 프로필 조회
 */
router.get('/agent', (req, res) => {
  try {
    const manager = getAgentProfileManager();
    const profiles = manager.getAllProfiles();

    res.json({
      success: true,
      profiles,
      count: profiles.length
    });
  } catch (error) {
    console.error('Error getting agent profiles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/agent/:profileId
 * 특정 에이전트 프로필 조회
 */
router.get('/agent/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;

    const manager = getAgentProfileManager();
    const profile = manager.getProfile(profileId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error getting agent profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/profile/agent
 * 에이전트 프로필 생성
 */
router.post('/agent', (req, res) => {
  try {
    const profileData = req.body;

    if (!profileData.id || !profileData.name) {
      return res.status(400).json({
        success: false,
        error: 'Profile id and name are required'
      });
    }

    const manager = getAgentProfileManager();
    const profile = manager.createProfile(profileData);

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error creating agent profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/profile/agent/:profileId
 * 에이전트 프로필 업데이트
 */
router.put('/agent/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const updates = req.body;

    const manager = getAgentProfileManager();
    const profile = manager.updateProfile(profileId, updates);

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error updating agent profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/profile/agent/:profileId
 * 에이전트 프로필 삭제
 */
router.delete('/agent/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;

    const manager = getAgentProfileManager();
    const deleted = manager.deleteProfile(profileId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted'
    });
  } catch (error) {
    console.error('Error deleting agent profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/profile/agent/:profileId/system-prompt
 * 시스템 프롬프트 생성
 */
router.post('/agent/:profileId/system-prompt', (req, res) => {
  try {
    const { profileId } = req.params;
    const {
      includeDateTime = true,
      includeUserInfo = true,
      userId = 'default-user',
      additionalContext = ''
    } = req.body;

    const agentManager = getAgentProfileManager();
    const userManager = getUserProfileManager();

    let userProfile = null;
    if (includeUserInfo) {
      userProfile = userManager.getProfile(userId).toPromptContext();
    }

    const systemPrompt = agentManager.generateSystemPrompt(profileId, {
      includeDateTime,
      includeUserInfo,
      userProfile,
      additionalContext
    });

    res.json({
      success: true,
      systemPrompt
    });
  } catch (error) {
    console.error('Error generating system prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/profile/agent/default/:profileId
 * 기본 에이전트 프로필 설정
 */
router.put('/agent/default/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;

    const manager = getAgentProfileManager();
    manager.setDefaultProfile(profileId);

    res.json({
      success: true,
      message: 'Default profile set',
      profileId
    });
  } catch (error) {
    console.error('Error setting default profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 사용자 프로필 API
// ============================================

/**
 * GET /api/profile/user
 * 모든 사용자 프로필 조회
 */
router.get('/user', (req, res) => {
  try {
    const manager = getUserProfileManager();
    const profiles = manager.getAllProfiles();

    res.json({
      success: true,
      profiles,
      count: profiles.length
    });
  } catch (error) {
    console.error('Error getting user profiles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/user/:userId
 * 특정 사용자 프로필 조회
 */
router.get('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const manager = getUserProfileManager();
    const profile = manager.getProfile(userId);

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/profile/user
 * 사용자 프로필 생성
 */
router.post('/user', (req, res) => {
  try {
    const profileData = req.body;

    if (!profileData.userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const manager = getUserProfileManager();
    const profile = manager.createProfile(profileData);

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error creating user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/profile/user/:userId
 * 사용자 프로필 업데이트
 */
router.put('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    const manager = getUserProfileManager();
    const profile = manager.updateProfile(userId, updates);

    res.json({
      success: true,
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/profile/user/:userId
 * 사용자 프로필 삭제
 */
router.delete('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const manager = getUserProfileManager();
    const deleted = manager.deleteProfile(userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted'
    });
  } catch (error) {
    console.error('Error deleting user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/profile/user/:userId/preference
 * 사용자 선호도 설정
 */
router.post('/user/:userId/preference', (req, res) => {
  try {
    const { userId } = req.params;
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required'
      });
    }

    const manager = getUserProfileManager();
    const profile = manager.setPreference(userId, key, value);

    res.json({
      success: true,
      profile: profile.toJSON(),
      preference: { key, value }
    });
  } catch (error) {
    console.error('Error setting user preference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/user/:userId/preference/:key
 * 사용자 선호도 조회
 */
router.get('/user/:userId/preference/:key', (req, res) => {
  try {
    const { userId, key } = req.params;
    const { defaultValue = null } = req.query;

    const manager = getUserProfileManager();
    const value = manager.getPreference(userId, key, defaultValue);

    res.json({
      success: true,
      preference: {
        key,
        value
      }
    });
  } catch (error) {
    console.error('Error getting user preference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/stats
 * 프로필 통계
 */
router.get('/stats', (req, res) => {
  try {
    const agentManager = getAgentProfileManager();
    const userManager = getUserProfileManager();

    const stats = {
      agents: {
        total: agentManager.getAllProfiles().length,
        default: agentManager.defaultProfileId
      },
      users: userManager.getStats()
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting profile stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
