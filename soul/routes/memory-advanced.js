/**
 * memory-advanced.js
 * 고급 메모리 API 라우트
 *
 * Week 2: 메모리 고도화
 *
 * 엔드포인트:
 * - 관계 그래프
 * - 타임라인 뷰
 * - 패턴 분석
 * - 태그 클라우드
 */

const express = require('express');
const router = express.Router();
const { getMemoryManager } = require('../utils/memory-layers');
const { RelationshipGraph, EntityExtractor } = require('../utils/relationship-graph');
const { TimelineView, TIME_UNITS } = require('../utils/timeline-view');
const { PatternAnalyzer, TagCloud } = require('../utils/pattern-analysis');

/**
 * GET /api/memory-advanced/graph
 * 관계 그래프 조회
 */
router.get('/graph', async (req, res) => {
  try {
    const { limit = 100, minImportance = 0 } = req.query;

    // 임시: 그래프 생성 (실제로는 영구 저장소에서 로드)
    const graph = new RelationshipGraph();

    // 예시 엔티티 추가
    const reactEntity = graph.addEntity({
      name: 'React',
      type: 'technology',
      mentions: 10
    });

    const vueEntity = graph.addEntity({
      name: 'Vue',
      type: 'technology',
      mentions: 5
    });

    graph.addRelationship({
      from: reactEntity.id,
      to: vueEntity.id,
      type: 'similar_to',
      strength: 0.8
    });

    // 중요도 계산
    graph.calculateImportance();

    // 그래프 데이터 추출
    const graphData = graph.toGraphData({
      limit: parseInt(limit),
      minImportance: parseFloat(minImportance)
    });

    res.json({
      success: true,
      graph: graphData,
      stats: graph.getStats()
    });
  } catch (error) {
    console.error('Error getting graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/memory-advanced/graph/analyze
 * 텍스트에서 엔티티 & 관계 추출
 */
router.post('/graph/analyze', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const extractor = new EntityExtractor();
    const entities = extractor.extractEntities(text);

    res.json({
      success: true,
      entities,
      count: entities.length
    });
  } catch (error) {
    console.error('Error analyzing text:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/timeline
 * 타임라인 조회
 */
router.get('/timeline', async (req, res) => {
  try {
    const {
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0,
      groupBy = TIME_UNITS.DAY
    } = req.query;

    const memoryManager = await getMemoryManager();
    const timeline = new TimelineView(memoryManager);

    const result = await timeline.getTimeline({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: parseInt(limit),
      offset: parseInt(offset),
      groupBy
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting timeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/timeline/date/:date
 * 특정 날짜의 메모리
 */
router.get('/timeline/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { includeRelated = 'false' } = req.query;

    const memoryManager = await getMemoryManager();
    const timeline = new TimelineView(memoryManager);

    const result = await timeline.getMemoriesForDate(
      new Date(date),
      { includeRelated: includeRelated === 'true' }
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting memories for date:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/timeline/activity
 * 시간대별 활동 분석
 */
router.get('/timeline/activity', async (req, res) => {
  try {
    const {
      startDate = null,
      endDate = null,
      groupBy = TIME_UNITS.DAY
    } = req.query;

    const memoryManager = await getMemoryManager();
    const timeline = new TimelineView(memoryManager);

    const result = await timeline.analyzeActivity({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      groupBy
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error analyzing activity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/timeline/density
 * 대화 밀도 분석
 */
router.get('/timeline/density', async (req, res) => {
  try {
    const {
      startDate = null,
      endDate = null
    } = req.query;

    const memoryManager = await getMemoryManager();
    const timeline = new TimelineView(memoryManager);

    const result = await timeline.analyzeDensity({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error analyzing density:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/patterns
 * 패턴 분석
 */
router.get('/patterns', async (req, res) => {
  try {
    const {
      lookbackDays = '30',
      minOccurrences = '3'
    } = req.query;

    const memoryManager = await getMemoryManager();
    const analyzer = new PatternAnalyzer(memoryManager);

    const result = await analyzer.analyzePatterns({
      lookbackDays: parseInt(lookbackDays),
      minOccurrences: parseInt(minOccurrences)
    });

    res.json({
      success: true,
      patterns: result
    });
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/tags
 * 태그 클라우드
 */
router.get('/tags', async (req, res) => {
  try {
    const {
      lookbackDays = '30',
      minCount = '2',
      maxTags = '50'
    } = req.query;

    const memoryManager = await getMemoryManager();
    const tagCloud = new TagCloud(memoryManager);

    const result = await tagCloud.generate({
      lookbackDays: parseInt(lookbackDays),
      minCount: parseInt(minCount),
      maxTags: parseInt(maxTags)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error generating tag cloud:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/tags/relationships
 * 태그 관계 분석
 */
router.get('/tags/relationships', async (req, res) => {
  try {
    const { lookbackDays = '30' } = req.query;

    const memoryManager = await getMemoryManager();
    const tagCloud = new TagCloud(memoryManager);

    const result = await tagCloud.analyzeTagRelationships({
      lookbackDays: parseInt(lookbackDays)
    });

    res.json({
      success: true,
      relationships: result
    });
  } catch (error) {
    console.error('Error analyzing tag relationships:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/memory-advanced/search
 * 고급 검색 (시간 범위 포함)
 */
router.get('/search', async (req, res) => {
  try {
    const {
      query,
      startDate = null,
      endDate = null,
      limit = '50'
    } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const memoryManager = await getMemoryManager();
    const timeline = new TimelineView(memoryManager);

    const result = await timeline.search(query, {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
