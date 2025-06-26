<template>
  <div class="search-container">
    <div class="search-form">
      <el-form :model="form" label-width="120px" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="请输入要搜索的知乎问题关键词" />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            @click="handleSearch" 
            :loading="loading"
            :disabled="!form.keyword"
          >
            搜索
          </el-button>
          
          <span v-if="!hasCookie" class="cookie-warning">
            请先设置Cookie <el-button type="text" @click="showCookieDialog">点击设置</el-button>
          </span>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 热门搜索提示词 -->
    <div v-if="!loading && !result && !error" class="hot-search-section">
      <el-card shadow="hover" class="hot-search-card">
        <template #header>
          <div class="hot-search-header">
            <span><i class="el-icon-data-analysis"></i> 热门搜索</span>
            <el-button type="text" @click="refreshHotKeywords">换一换</el-button>
          </div>
        </template>
        <div class="hot-search-content">
          <div class="hot-search-categories">
            <div class="category-item" v-for="(category, index) in hotCategories" :key="index">
              <h3 class="category-title">{{ category.name }}</h3>
              <div class="keyword-list">
                <div 
                  v-for="(keyword, kIndex) in category.keywords" 
                  :key="kIndex" 
                  class="hot-keyword-item"
                  @click="useKeyword(keyword)"
                >
                  <span class="keyword-rank" :class="{'top-rank': kIndex < 3}">{{ kIndex + 1 }}</span>
                  <span class="keyword-text">{{ keyword }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>
    
    <!-- 搜索进度可视化 -->
    <div v-if="loading" class="progress-section">
      <el-card shadow="hover" class="progress-card">
        <div class="progress-header">
          <div class="progress-title">
            <i class="el-icon-loading"></i> 正在搜索相关问题
          </div>
          <div class="progress-subtitle">已用时间: {{ elapsedTime }}秒</div>
        </div>
        
        <el-progress 
          :percentage="searchProgress" 
          :status="searchProgress >= 100 ? 'success' : ''"
          :stroke-width="18"
        ></el-progress>
        
        <div class="progress-stats">
          <div class="stat-item">
            <div class="stat-label">状态</div>
            <div class="stat-value status">{{ searchStatusText }}</div>
          </div>
        </div>
        
        <div class="progress-steps">
          <div class="step" :class="{ 'active': searchStage >= 1, 'completed': searchStage > 1 }">
            <div class="step-icon">1</div>
            <div class="step-text">加载页面</div>
          </div>
          <div class="step-connector" :class="{ 'active': searchStage >= 2 }"></div>
          <div class="step" :class="{ 'active': searchStage >= 2, 'completed': searchStage > 2 }">
            <div class="step-icon">2</div>
            <div class="step-text">执行搜索</div>
          </div>
          <div class="step-connector" :class="{ 'active': searchStage >= 3 }"></div>
          <div class="step" :class="{ 'active': searchStage >= 3, 'completed': searchStage > 3 }">
            <div class="step-icon">3</div>
            <div class="step-text">提取结果</div>
          </div>
        </div>
      </el-card>
    </div>

    <div v-if="result && result.results.length > 0" class="result-section">
      <div class="results-header">
        <div class="results-title">
          <h2>搜索结果: {{ result.keyword }}</h2>
          <p>共找到相关问题 {{ result.results.length }} 个</p>
        </div>
        <div class="results-actions">
          <span class="hot-sort-text">按热度排序</span>
        </div>
      </div>
      
      <div class="results-list">
        <div v-for="(item, index) in sortedResults" :key="index" class="result-card">
          <h3 class="result-title">
            <a :href="item.url" target="_blank" @click.prevent="goToQuestion(item)">{{ item.title }}</a>
          </h3>
          
          <div class="result-stats">
            <span class="stat-item" v-if="getFollowCountNumber(item.followCount) > 0">
              <i class="el-icon-view"></i> {{ item.followCount }} 关注
            </span>
            <span class="stat-item answer-count" :class="getAnswerCountClass(item.answerCount)" v-if="getAnswerCountNumber(item.answerCount) > 0">
              <i class="el-icon-chat-dot-square"></i> {{ item.answerCount }} 回答
            </span>
            <span v-if="item.hot" class="stat-item hot">
              <i class="el-icon-data-analysis"></i> {{ item.hot }}
            </span>
          </div>
          
          <div class="result-footer">
            <el-button 
              type="primary" 
              size="small" 
              class="view-answers-btn"
              @click="goToQuestion(item)"
            >
              查看回答
            </el-button>

            <div class="tag-list">
              <el-tag v-if="getAnswerCountNumber(item.answerCount) > 50" size="mini" type="success">热门问题</el-tag>
              <el-tag v-if="getFollowCountNumber(item.followCount) > 1000" size="mini" type="danger">高关注</el-tag>
            </div>
          </div>
        </div>
      </div>

      <div v-if="result.totalPages > 1" class="pagination">
        <el-pagination
          background
          layout="prev, pager, next"
          :total="result.totalPages * 10"
          :page-size="10"
          :current-page="currentPage"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <div v-else-if="result && result.results.length === 0" class="no-results">
      <el-empty description="未找到相关问题">
        <template #description>
          <p>没有找到与"{{ result.keyword }}"相关的问题</p>
          <div class="search-tips">
            <h4>搜索提示：</h4>
            <ul>
              <li>请尝试使用其他关键词</li>
              <li>确保Cookie有效并且登录状态正常</li>
              <li>尝试搜索更具体或常见的内容</li>
            </ul>

            <div class="suggested-keywords">
              <h4>推荐关键词：</h4>
              <div class="keyword-tags">
                <el-tag 
                  v-for="(keyword, index) in suggestedKeywords" 
                  :key="index" 
                  class="suggested-tag"
                  @click="useKeyword(keyword)"
                  effect="plain"
                >
                  {{ keyword }}
                </el-tag>
              </div>
            </div>
          </div>
        </template>
        <el-button type="primary" @click="handleRetry">重新搜索</el-button>
      </el-empty>
    </div>
    
    <div v-if="error" class="error-section">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <div class="error-actions">
        <el-button type="primary" @click="handleRetry">重试</el-button>
        <el-button @click="showCookieDialog">重新设置Cookie</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

export default {
  name: 'Search',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const form = ref({ keyword: '' })
    const loading = ref(false)
    const error = ref('')
    const result = ref(null)
    const currentPage = ref(1)
    const sortOption = ref('default')
    const hasCookie = ref(!!localStorage.getItem('zhihu_cookie'))
    const showCookieDialog = inject('showCookieDialog', () => {})
    
    // 搜索进度相关
    const searchProgress = ref(0)
    const elapsedTime = ref(0)
    const searchStage = ref(0)
    const searchStatusText = ref('准备中...')
    const startTime = ref(0)
    const timeElapsedTimer = ref(null)
    
    // 将回答数从字符串转换为数字
    const getAnswerCountNumber = (answerCount) => {
      if (!answerCount) return 0;
      const num = parseInt(answerCount.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    // 将关注数从字符串转换为数字
    const getFollowCountNumber = (followCount) => {
      if (!followCount) return 0;
      const num = parseInt(followCount.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    // 常用关键词推荐
    const suggestedKeywords = [
      '人工智能',
      '前端开发',
      '数据分析',
      '创业经验',
      '职场成长',
      '健康生活',
      '学习方法'
    ];

    // 热门搜索分类
    const hotCategories = ref([
      {
        name: '科技',
        keywords: ['人工智能', 'ChatGPT', '量子计算', '区块链', '元宇宙', '芯片技术', '自动驾驶']
      },
      {
        name: '职场',
        keywords: ['职业规划', '跳槽技巧', '面试经验', '职场人际关系', '远程工作', '副业', '职业倦怠']
      },
      {
        name: '生活',
        keywords: ['健康饮食', '居家健身', '心理健康', '亲子教育', '理财投资', '旅行攻略', '读书心得']
      }
    ]);

    // 刷新热门关键词
    const refreshHotKeywords = () => {
      // 对每个分类的关键词进行随机排序
      hotCategories.value.forEach(category => {
        category.keywords = category.keywords.sort(() => Math.random() - 0.5);
      });
      
      // 随机排序分类
      hotCategories.value = [...hotCategories.value].sort(() => Math.random() - 0.5);
    };

    // 使用推荐的关键词
    const useKeyword = (keyword) => {
      form.value.keyword = keyword;
      handleSearch();
    };
    
    // 根据回答数返回不同的类名
    const getAnswerCountClass = (count) => {
      const num = getAnswerCountNumber(count)
      if (num >= 100) return 'high'
      if (num >= 10) return 'medium'
      return 'low'
    }
    
    // 排序后的结果
    const sortedResults = computed(() => {
      if (!result.value || !result.value.results) {
        return []
      }
      
      const results = [...result.value.results]
      
      switch(sortOption.value) {
        case 'answers-desc':
          return results.sort((a, b) => getAnswerCountNumber(b.answerCount) - getAnswerCountNumber(a.answerCount))
        case 'follows-desc':
          return results.sort((a, b) => getFollowCountNumber(b.followCount) - getFollowCountNumber(a.followCount))
        default:
          return results
      }
    })
    
    // 处理排序变化
    const sortResults = () => {
      // 不需要特殊处理，依靠计算属性自动更新
    }
    
    // 初始化进度显示
    const initSearchProgress = () => {
      searchProgress.value = 0
      elapsedTime.value = 0
      searchStage.value = 0
      searchStatusText.value = '准备中...'
      startTime.value = Date.now()
      
      // 启动计时器，更新已用时间
      timeElapsedTimer.value = setInterval(() => {
        elapsedTime.value = ((Date.now() - startTime.value) / 1000).toFixed(1)
      }, 100)
    }
    
    // 更新搜索状态
    const updateSearchStatus = (stage, status = '') => {
      searchStage.value = stage
      
      if (status) {
        searchStatusText.value = status
      } else {
        switch(stage) {
          case 0: searchStatusText.value = '准备中...'; break
          case 1: searchStatusText.value = '加载页面...'; break
          case 2: searchStatusText.value = '执行搜索...'; break
          case 3: searchStatusText.value = '提取结果...'; break
          case 4: searchStatusText.value = '完成'; break
        }
      }
      
      // 根据阶段立即更新进度条
      const newProgress = (() => {
        switch(stage) {
          case 0: return 5  // 准备阶段
          case 1: return 30 // 页面加载阶段
          case 2: return 60 // 执行搜索阶段
          case 3: return 90 // 提取结果阶段
          case 4: return 100 // 完成阶段
          default: return searchProgress.value
        }
      })()
      
      // 平滑过渡到新进度
      const animateToProgress = (targetProgress) => {
        const startProgress = searchProgress.value
        const duration = 500 // 500毫秒过渡时间
        const startTime = Date.now()
        
        const animate = () => {
          const now = Date.now()
          const elapsed = now - startTime
          
          if (elapsed < duration) {
            const progress = startProgress + (targetProgress - startProgress) * (elapsed / duration)
            searchProgress.value = Math.min(progress, targetProgress)
            requestAnimationFrame(animate)
          } else {
            searchProgress.value = targetProgress
          }
        }
        
        requestAnimationFrame(animate)
      }
      
      animateToProgress(newProgress)
    }
    
    // 结束进度跟踪
    const finishSearchProgress = () => {
      // 清除计时器
      if (timeElapsedTimer.value) {
        clearInterval(timeElapsedTimer.value)
        timeElapsedTimer.value = null
      }
      
      // 设置进度为100%
      updateSearchStatus(4)
    }

    // 处理搜索
    const handleSearch = async () => {
      if (!form.value.keyword) {
        error.value = '请输入搜索关键词'
        return
      }
      
      if (!localStorage.getItem('zhihu_cookie')) {
        error.value = '请先设置Cookie'
        showCookieDialog()
        return
      }
      
      loading.value = true
      error.value = null
      result.value = null
      currentPage.value = 1
      sortOption.value = 'default'
      
      // 初始化进度跟踪
      initSearchProgress()
      
      try {
        // 短暂延迟，显示准备阶段
        await new Promise(r => setTimeout(r, 500))
        updateSearchStatus(1, '正在加载页面...')
        
        // 发送请求
        const response = await axios.post('/api/search-questions', {
          keyword: form.value.keyword,
          cookie: localStorage.getItem('zhihu_cookie'),
          page: currentPage.value
        })
        
        // 模拟搜索过程
        updateSearchStatus(2, '执行搜索中...')
        await new Promise(r => setTimeout(r, 1000))
        
        updateSearchStatus(3, '提取搜索结果...')
        await new Promise(r => setTimeout(r, 800))
        
        if (response.data.success) {
          result.value = response.data.data
          
          // 格式化回答数和关注数
          if (result.value.results && result.value.results.length > 0) {
            result.value.results.forEach(item => {
              // 确保回答数和关注数是数字形式，方便排序
              if (!item.answerCount || item.answerCount === '0') {
                item.answerCount = '0';
              }
              if (!item.followCount || item.followCount === '0') {
                item.followCount = '0';
              }
            });
            
            ElMessage.success(`搜索成功，找到 ${result.value.results.length} 个相关问题`)
            finishSearchProgress()
          } else {
            ElMessage.warning('未找到相关问题，请尝试其他关键词')
            finishSearchProgress()
          }
        } else {
          error.value = response.data.message || '搜索失败'
          finishSearchProgress()
        }
      } catch (err) {
        console.error('搜索知乎问题错误:', err)
        error.value = err.response?.data?.message || '服务器错误，请稍后再试'
        finishSearchProgress()
      } finally {
        loading.value = false
      }
    }
    
    // 处理页面切换
    const handlePageChange = async (page) => {
      if (page === currentPage.value) return
      
      loading.value = true
      error.value = null
      
      // 初始化进度跟踪
      initSearchProgress()
      updateSearchStatus(1, '加载页面...')
      
      try {
        const response = await axios.post('/api/search-questions', {
          keyword: form.value.keyword,
          cookie: localStorage.getItem('zhihu_cookie'),
          page: page
        })
        
        updateSearchStatus(2, '执行搜索中...')
        await new Promise(r => setTimeout(r, 800))
        
        updateSearchStatus(3, '提取搜索结果...')
        
        if (response.data.success) {
          result.value = response.data.data
          currentPage.value = page
          // 滚动到页面顶部
          window.scrollTo({ top: 0, behavior: 'smooth' })
          finishSearchProgress()
        } else {
          error.value = response.data.message || '获取下一页失败'
          finishSearchProgress()
        }
      } catch (err) {
        console.error('获取下一页错误:', err)
        error.value = err.response?.data?.message || '服务器错误，请稍后再试'
        finishSearchProgress()
      } finally {
        loading.value = false
      }
    }
    
    // 跳转到问题页面
    const goToQuestion = (item) => {
      // 保存目前的搜索状态
      sessionStorage.setItem('lastSearch', JSON.stringify({
        keyword: form.value.keyword,
        page: currentPage.value
      }))
      
      // 提取问题ID
      const match = item.url.match(/question\/(\d+)/);
      const questionId = match ? match[1] : null;
      
      if (questionId) {
        try {
          // 构建完整的知乎问题URL
          const questionUrl = `https://www.zhihu.com/question/${questionId}`;
          
          // 阻止可能的导航事件监听器
          event?.preventDefault?.();
          
          // 使用直接修改window.location的方式跳转，确保完整的页面刷新
          window.location.href = `/crawler?url=${encodeURIComponent(questionUrl)}&fromSearch=true`;
          
          // 不再使用router.push，因为它可能不会触发完整的页面重新加载
          // 如果需要router.push，则应该在以下代码的catch中使用window.location.href作为备选方案
        } catch (err) {
          console.error('页面跳转错误:', err);
          ElMessage.error('页面跳转失败，请刷新页面后重试');
        }
      } else {
        ElMessage.error('无法解析问题链接');
      }
    }

    // 处理重试
    const handleRetry = () => {
      if (form.value.keyword) {
        handleSearch();
      } else {
        error.value = null;
        result.value = null;
      }
    }
    
    // 组件挂载时
    onMounted(() => {
      // 检查URL参数
      if (route.query.keyword) {
        form.value.keyword = route.query.keyword
        
        // 设置页码
        if (route.query.page) {
          currentPage.value = parseInt(route.query.page) || 1
        }
        
        // 如果有Cookie，自动搜索
        if (hasCookie.value) {
          setTimeout(() => {
            handleSearch()
          }, 500)
        }
      }
    })
    
    // 组件销毁时清除计时器
    onUnmounted(() => {
      if (timeElapsedTimer.value) {
        clearInterval(timeElapsedTimer.value)
      }
    })

    // 监听Cookie变化
    watch(() => localStorage.getItem('zhihu_cookie'), (newValue) => {
      hasCookie.value = !!newValue
    })

    return {
      form,
      loading,
      error,
      result,
      currentPage,
      sortOption,
      hasCookie,
      showCookieDialog,
      sortedResults,
      getAnswerCountClass,
      getAnswerCountNumber,
      getFollowCountNumber,
      suggestedKeywords,
      useKeyword,
      handleSearch,
      handlePageChange,
      goToQuestion,
      handleRetry,
      sortResults,
      // 进度相关
      searchProgress,
      elapsedTime,
      searchStage,
      searchStatusText,
      hotCategories,
      refreshHotKeywords
    }
  }
}
</script>

<style>
.search-container {
  max-width: 1200px;
  margin: 0 auto;
}

.search-form {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.cookie-warning {
  margin-left: 15px;
  color: #e6a23c;
}

/* 进度条样式 */
.progress-section {
  margin-bottom: 2rem;
}

.progress-card {
  padding: 1rem;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.progress-title {
  font-size: 18px;
  font-weight: bold;
  color: #409EFF;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-subtitle {
  color: #606266;
  font-size: 14px;
}

.progress-stats {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  text-align: center;
}

.stat-label {
  color: #909399;
  font-size: 13px;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 22px;
  font-weight: bold;
  color: #303133;
}

.stat-value.status {
  font-size: 16px;
  color: #409EFF;
}

/* 步骤指示器 */
.progress-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  position: relative;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
  position: relative;
  z-index: 2;
}

.step-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #F5F7FA;
  border: 2px solid #EBEEF5;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  color: #909399;
  margin-bottom: 8px;
  transition: all 0.3s ease;
}

.step-text {
  font-size: 13px;
  color: #909399;
  transition: all 0.3s ease;
}

.step-connector {
  flex-grow: 1;
  height: 2px;
  background-color: #EBEEF5;
  position: relative;
  z-index: 1;
  transition: background-color 0.3s ease;
}

/* 激活状态 */
.step.active .step-icon {
  background-color: #e6f3ff;
  border-color: #79bbff;
  color: #409EFF;
}

.step.active .step-text {
  color: #409EFF;
}

/* 完成状态 */
.step.completed .step-icon {
  background-color: #409EFF;
  border-color: #409EFF;
  color: white;
}

.step-connector.active {
  background-color: #79bbff;
}

.result-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.results-title h2 {
  margin: 0;
  margin-bottom: 5px;
  font-size: 18px;
}

.results-title p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.result-card {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.result-card:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
}

.result-title {
  margin-top: 0;
  margin-bottom: 1rem;
}

.result-title a {
  color: #1a73e8;
  text-decoration: none;
  font-size: 18px;
  transition: color 0.3s;
}

.result-title a:hover {
  color: #0d47a1;
  text-decoration: underline;
}

.result-content {
  color: #606266;
  font-size: 14px;
  margin-bottom: 1.5rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.6;
}

.result-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat-item {
  font-size: 14px;
  color: #909399;
}

.answer-count {
  padding: 2px 8px;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.05);
}

.answer-count.high {
  color: #f56c6c;
  font-weight: bold;
}

.answer-count.medium {
  color: #e6a23c;
}

.answer-count.low {
  color: #67c23a;
}

.hot {
  color: #f56c6c;
}

.result-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px dashed #eee;
}

.tag-list {
  display: flex;
  gap: 0.5rem;
}

.pagination {
  margin-top: 2rem;
  display: flex;
  justify-content: center;
}

.error-section {
  margin-top: 2rem;
}

.error-actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.5rem;
}

.no-results {
  margin-top: 3rem;
}

.search-tips {
  margin-top: 1.5rem;
  text-align: left;
}

.search-tips h4 {
  margin-bottom: 0.5rem;
}

.search-tips ul {
  padding-left: 1.5rem;
  margin-bottom: 1rem;
}

.suggested-keywords {
  margin-top: 1.5rem;
  background-color: #f9f9f9;
  padding: 1rem;
  border-radius: 4px;
}

.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.suggested-tag {
  cursor: pointer;
  transition: all 0.3s ease;
}

.suggested-tag:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.results-actions {
  display: flex;
  align-items: center;
}

.hot-sort-text {
  color: #606266;
  font-size: 14px;
}

@media screen and (max-width: 768px) {
  .results-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .result-footer {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
  
  .tag-list {
    width: 100%;
  }
  
  .progress-steps {
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }
  
  .step-connector {
    display: none;
  }
}

/* 热门搜索样式 */
.hot-search-section {
  margin-bottom: 2rem;
}

.hot-search-card {
  margin-top: 1.5rem;
}

.hot-search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hot-search-header i {
  margin-right: 5px;
  color: #f56c6c;
}

.hot-search-content {
  padding: 0.5rem 0;
}

.hot-search-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}

.category-item {
  flex: 1;
  min-width: 250px;
}

.category-title {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 16px;
  color: #303133;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #ebeef5;
}

.keyword-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.hot-keyword-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.hot-keyword-item:hover {
  background-color: #f5f7fa;
  transform: translateX(5px);
}

.keyword-rank {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 20px;
  height: 20px;
  margin-right: 10px;
  border-radius: 50%;
  background-color: #909399;
  color: white;
  font-size: 12px;
  font-weight: bold;
}

.keyword-rank.top-rank {
  background-color: #f56c6c;
}

.keyword-text {
  color: #303133;
  font-size: 14px;
}
</style> 