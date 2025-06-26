<template>
  <div class="home-container">
    <div class="form-section">
      <el-form :model="form" label-width="120px" @submit.prevent="handleSubmit">
        <el-form-item label="知乎链接">
          <el-input 
            v-model="form.url" 
            placeholder="请输入知乎问题链接，例如: https://www.zhihu.com/question/12345678"
          />
        </el-form-item>
        
        <el-form-item label="最小赞同数">
          <el-input-number 
            v-model="form.minVotes" 
            :min="0" 
            :step="10"
            placeholder="筛选大于等于此赞同数的回答"
          />
          <span class="filter-hint">设置为0或留空表示不筛选</span>
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            @click="handleSubmit" 
            :loading="loading"
            :disabled="!hasCookie || !form.url"
          >
            开始爬取
          </el-button>
          
          <span v-if="!hasCookie" class="cookie-warning">
            请先设置Cookie <el-button type="text" @click="showCookieDialog">点击设置</el-button>
          </span>
        </el-form-item>
      </el-form>
      
      <div v-if="fromSearch" class="search-navigation-tip">
        <el-alert
          type="info"
          :closable="true"
          show-icon
        >
          <template #title>
            <span>您正在查看从搜索页面跳转而来的问题回答</span>
          </template>
          <template #default>
            <div class="search-navigation-actions">
              <el-button size="small" @click="backToSearch">
                <i class="el-icon-arrow-left"></i> 返回搜索结果
              </el-button>
            </div>
          </template>
        </el-alert>
      </div>
    </div>

    <!-- 爬取进度可视化 -->
    <div v-if="loading" class="progress-section">
      <el-card shadow="hover" class="progress-card">
        <div class="progress-header">
          <div class="progress-title">
            <i class="el-icon-loading"></i> 正在爬取数据
          </div>
          <div class="progress-subtitle">已用时间: {{ elapsedTime }}秒</div>
      </div>
      
        <el-progress 
          :percentage="crawlProgress" 
          :status="crawlProgress >= 100 ? 'success' : ''"
          :stroke-width="18"
        ></el-progress>
        
        <div class="progress-stats">
          <div class="stat-item">
            <div class="stat-label">已发现回答</div>
            <div class="stat-value">{{ currentAnswerCount }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">滚动次数</div>
            <div class="stat-value">{{ scrollAttempts }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">当前状态</div>
            <div class="stat-value status">{{ crawlStatusText }}</div>
          </div>
        </div>
        
        <!-- 添加实时进度信息 -->
        <div class="progress-details" v-if="crawlStage === 2">
          <div class="progress-detail-item">
            <i class="el-icon-loading"></i> 
            <span>正在加载回答 ({{ Math.round(crawlProgress) }}%)</span>
          </div>
          <div class="progress-detail-text">
            {{ progressDetailText }}
          </div>
        </div>
        
        <div class="progress-steps">
          <div class="step" :class="{ 'active': crawlStage >= 1, 'completed': crawlStage > 1 }">
            <div class="step-icon">1</div>
            <div class="step-text">加载页面</div>
          </div>
          <div class="step-connector" :class="{ 'active': crawlStage >= 2 }"></div>
          <div class="step" :class="{ 'active': crawlStage >= 2, 'completed': crawlStage > 2 }">
            <div class="step-icon">2</div>
            <div class="step-text">加载回答</div>
          </div>
          <div class="step-connector" :class="{ 'active': crawlStage >= 3 }"></div>
          <div class="step" :class="{ 'active': crawlStage >= 3, 'completed': crawlStage > 3 }">
            <div class="step-icon">3</div>
            <div class="step-text">提取数据</div>
          </div>
          <div class="step-connector" :class="{ 'active': crawlStage >= 4 }"></div>
          <div class="step" :class="{ 'active': crawlStage >= 4, 'completed': crawlStage > 4 }">
            <div class="step-icon">4</div>
            <div class="step-text">完成</div>
          </div>
        </div>
      </el-card>
    </div>

    <div v-if="result" class="results-container">
      <div class="results-header">
        <h2>问题: {{ result.title }}</h2>
        <div class="results-actions">
          <el-tag type="success">共 {{ result.answers.length }} 个回答</el-tag>
          <el-button 
            v-if="downloadFileUrl" 
            type="success" 
            size="small" 
            @click="downloadFile"
            icon="el-icon-download"
          >
            下载CSV文件
          </el-button>
        </div>
      </div>

      <div class="results-info-card">
        <el-card shadow="hover">
          <div class="info-header">
            <i class="el-icon-info"></i> 爬取统计信息
          </div>
          <table class="stats-table">
            <tr>
              <td class="stats-label">总回答数:</td>
              <td class="stats-value">{{ result.answers.length }}</td>
              <td class="stats-label">爬取用时:</td>
              <td class="stats-value">{{ fetchTime }}秒</td>
              <td class="stats-label">平均点赞:</td>
              <td class="stats-value">{{ averageVotes }}</td>
            </tr>
          </table>
        </el-card>
      </div>
          
      <div class="description" v-if="result.description">
        <el-card shadow="hover" class="description-card">
          <template #header>
            <div class="card-header">
              <span>问题描述</span>
          </div>
          </template>
          <div class="description-content">{{ result.description }}</div>
        </el-card>
        </div>
        
      <div class="answers-list">
        <el-card v-for="(answer, index) in filteredAnswers" :key="index" class="answer-card" shadow="hover">
          <template #header>
            <div class="answer-header">
              <span class="author">{{ answer.author }}</span>
              <span class="votes" :class="getVoteClass(answer.voteCountNumber)">
                <i class="el-icon-caret-top"></i> {{ answer.voteCount }}
              </span>
        </div>
          </template>
          <div class="answer-content" :class="{ 'collapsed': !expandedAnswers[index] && isLongAnswer(answer.content) }">
            {{ answer.content }}
          </div>
          <div v-if="isLongAnswer(answer.content)" class="expand-btn" @click="toggleAnswer(index)">
            {{ expandedAnswers[index] ? '收起' : '展开' }}
          </div>
        </el-card>
      </div>
    </div>
    
    <div v-if="error" class="error-alert">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

export default {
  name: 'Home',
  props: {
    url: {
      type: String,
      default: ''
    },
    fromSearch: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const form = ref({ 
      url: props.url || '',
      minVotes: 0
    })
    const loading = ref(false)
    const error = ref('')
    const result = ref(null)
    const hasCookie = ref(!!localStorage.getItem('zhihu_cookie'))
    const showCookieDialog = inject('showCookieDialog', () => {})
    const sortType = ref('votes')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const isFromSearch = ref(props.fromSearch)
    const lastSearchData = ref(null)
    const fetchTime = ref(0)
    const startTime = ref(0)
    
    // 爬取进度相关
    const crawlProgress = ref(0)
    const elapsedTime = ref(0)
    const crawlStage = ref(0)
    const crawlStatusText = ref('准备中...')
    const currentAnswerCount = ref(0)
    const scrollAttempts = ref(0)
    const progressTimer = ref(null)
    const timeElapsedTimer = ref(null)
    const progressDetailText = ref('正在加载更多回答...')
    const expandedAnswers = ref({})
    const downloadFileUrl = ref('')
    
    // 判断是否为长回答
    const isLongAnswer = (content) => {
      return content && content.length > 150
    }
    
    // 切换回答的展开/收起状态
    const toggleAnswer = (index) => {
      expandedAnswers.value[index] = !expandedAnswers.value[index]
    }
    
    // 计算属性：过滤后的回答
    const filteredAnswers = computed(() => {
      if (!result.value || !result.value.answers) {
        return []
      }
      
      let answers = [...result.value.answers]
      
      // 根据排序方式
      if (sortType.value === 'votes') {
        answers.sort((a, b) => (b.voteCountNumber || 0) - (a.voteCountNumber || 0))
      }
      
      return answers
    })
    
    // 格式化数字
    const formatNumber = (num) => {
      if (!num) return '0'
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // 计算属性：平均点赞数
    const averageVotes = computed(() => {
      if (!result.value || !result.value.answers || result.value.answers.length === 0) {
        return '0';
      }
      
      const totalVotes = result.value.answers.reduce((sum, answer) => {
        return sum + (answer.voteCountNumber || 0);
      }, 0);
      
      return Math.round(totalVotes / result.value.answers.length).toLocaleString();
    });
    
    // 根据点赞数返回不同的CSS类
    const getVoteClass = (voteCount) => {
      if (!voteCount) return '';
      if (voteCount >= 1000) return 'votes-high';
      if (voteCount >= 100) return 'votes-medium';
      return 'votes-low';
    };
    
    // 组件挂载时添加监听器
    onMounted(() => {
      // 监听storage变化，更新hasCookie
      const handleStorageChange = (event) => {
        if (event.key === 'zhihu_cookie' || (event.detail && event.detail.key === 'zhihu_cookie')) {
          hasCookie.value = !!localStorage.getItem('zhihu_cookie')
        }
      }
      
      window.addEventListener('storage', handleStorageChange)
      window.addEventListener('localStorageChange', handleStorageChange)
      
      // 检查URL参数和props
      const urlParam = props.url || route.query.url
      if (urlParam) {
        form.value.url = urlParam
        // 如果有Cookie，延迟一点自动提交
        if (hasCookie.value) {
          setTimeout(() => {
            handleSubmit()
          }, 500)
        } else {
          // 如果没有Cookie，显示提示并打开Cookie设置对话框
          ElMessage.warning('请先设置Cookie才能爬取内容')
          setTimeout(() => {
            showCookieDialog()
          }, 800)
        }
      } else {
        // 清空结果，显示空白爬取页面
        result.value = null
        error.value = null
        loading.value = false
      }
      
      // 检查是否有上一次的搜索状态
      const lastSearch = sessionStorage.getItem('lastSearch')
      if (lastSearch && !isFromSearch.value) {
        try {
          lastSearchData.value = JSON.parse(lastSearch)
          isFromSearch.value = true
          // 清除会话存储中的搜索状态，避免重复使用
          sessionStorage.removeItem('lastSearch')
        } catch (e) {
          console.error('清除上次搜索状态失败:', e)
        }
      }
    })
    
    // 组件卸载时移除监听器和计时器
    onUnmounted(() => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('localStorageChange', handleStorageChange)
      
      // 清除进度相关计时器
      if (progressTimer.value) {
        clearInterval(progressTimer.value)
      }
      if (timeElapsedTimer.value) {
        clearInterval(timeElapsedTimer.value)
      }
    })
    
    // 监听props变化
    watch(() => props.fromSearch, (newVal) => {
      isFromSearch.value = newVal
    })
    
    watch(() => props.url, (newVal) => {
      if (newVal && newVal !== form.value.url) {
        form.value.url = newVal
        // 如果有Cookie，自动提交
        if (hasCookie.value) {
          setTimeout(() => {
            handleSubmit()
          }, 300)
        }
      }
    })
    
    // 更新爬取状态
    const updateCrawlStatus = (stage, status = '', answers = 0, scrollCount = 0) => {
      crawlStage.value = stage
      
      if (status) {
        crawlStatusText.value = status
      } else {
        switch(stage) {
          case 0: crawlStatusText.value = '准备中...'; break
          case 1: crawlStatusText.value = '加载页面...'; break
          case 2: crawlStatusText.value = '加载回答...'; break
          case 3: crawlStatusText.value = '提取数据...'; break
          case 4: crawlStatusText.value = '完成'; break
        }
      }
      
      if (answers > 0) {
        currentAnswerCount.value = answers
      }
      
      if (scrollCount > 0) {
        scrollAttempts.value = scrollCount
      }
      
      // 根据阶段立即更新进度条
      const newProgress = (() => {
        switch(stage) {
          case 0: return 5  // 准备阶段
          case 1: return 20 // 页面加载阶段
          case 2: 
            // 在加载回答阶段，进度与回答数量和滚动次数相关
            if (answers > 0) {
              // 根据已发现回答数和滚动次数调整进度
              const scrollProgress = scrollCount > 0 ? Math.min((scrollCount / 20) * 30, 30) : 0
              const answerProgress = Math.min((answers / 50) * 25, 25)
              return Math.min(20 + scrollProgress + answerProgress, 75)
            }
            return 40
          case 3: return 90 // 数据提取阶段
          case 4: return 100 // 完成阶段
          default: return crawlProgress.value
        }
      })()
      
      // 平滑过渡到新进度
      const animateToProgress = (targetProgress) => {
        const startProgress = crawlProgress.value
        const duration = 500 // 500毫秒过渡时间
        const startTime = Date.now()
        
        const animate = () => {
          const now = Date.now()
          const elapsed = now - startTime
          
          if (elapsed < duration) {
            const progress = startProgress + (targetProgress - startProgress) * (elapsed / duration)
            crawlProgress.value = Math.min(progress, targetProgress)
            requestAnimationFrame(animate)
          } else {
            crawlProgress.value = targetProgress
          }
        }
        
        requestAnimationFrame(animate)
      }
      
      animateToProgress(newProgress)
    }
    
    // 结束进度跟踪
    const finishProgressTracking = () => {
      // 清除进度相关计时器
      if (progressTimer.value) {
        clearInterval(progressTimer.value)
        progressTimer.value = null
      }
      
      if (timeElapsedTimer.value) {
        clearInterval(timeElapsedTimer.value)
        timeElapsedTimer.value = null
      }
      
      // 设置进度为100%，使用平滑过渡
      updateCrawlStatus(4)
    }
    
          // 初始化进度显示
    const initProgressTracking = () => {
      crawlProgress.value = 0
      elapsedTime.value = 0
      crawlStage.value = 0
      crawlStatusText.value = '准备中...'
      currentAnswerCount.value = 0
      scrollAttempts.value = 0
      progressDetailText.value = '正在加载更多回答...'
      
      // 启动计时器，更新已用时间
      timeElapsedTimer.value = setInterval(() => {
        elapsedTime.value = ((Date.now() - startTime.value) / 1000).toFixed(1)
      }, 100)
      
      // 无需再使用模拟进度条更新的计时器，因为我们现在直接基于状态更新
      updateCrawlStatus(0)
    }
    
    // 处理表单提交
    const handleSubmit = async () => {
      if (!form.value.url) {
        error.value = '请输入知乎问题链接'
        return
      }
      
      if (!hasCookie.value) {
        error.value = '请先设置Cookie'
        showCookieDialog()
        return
      }
      
      loading.value = true
      error.value = null
      result.value = null
      startTime.value = Date.now()
      
      // 初始化进度显示
      initProgressTracking()
      
      try {
        // 短暂延迟，显示准备阶段
        await new Promise(r => setTimeout(r, 500))
        updateCrawlStatus(1, '正在加载页面...')
        
        // 发送请求
        const response = await axios.post('/api/fetch-zhihu-data', {
          url: form.value.url,
          cookie: localStorage.getItem('zhihu_cookie'),
          minVotes: form.value.minVotes || 0
        })
        
        // 提取真实数据更新进度
        const extractProgressUpdates = () => {
          // 检测服务端日志信息中的回答数量和滚动信息
          const serverLogs = response.data.logs || []
          if (serverLogs.length > 0) {
            // 从日志中提取回答数量和滚动次数
            let maxAnswers = 0
            let maxScrolls = 0
            let isExtracting = false
            let isCompleted = false
            
            let lastProgressUpdate = Date.now()
            
            serverLogs.forEach(log => {
              // 检测滚动进度
              if (log.includes('滚动后检测到')) {
                const answersMatch = log.match(/滚动后检测到 (\d+) 个回答/)
                if (answersMatch && answersMatch[1]) {
                  const answers = parseInt(answersMatch[1])
                  if (answers > maxAnswers) {
                    maxAnswers = answers
                    currentAnswerCount.value = answers
                    // 更频繁地更新进度
                    updateCrawlStatus(2, '滚动加载回答中...', maxAnswers, maxScrolls)
                    progressDetailText.value = `已加载 ${maxAnswers} 个回答，继续滚动加载中...`
                    lastProgressUpdate = Date.now()
                  }
                }
                
                maxScrolls++
              } 
              // 检测连续无变化的滚动
              else if (log.includes('连续')) {
                const noChangeMatch = log.match(/连续 (\d+) 次滚动没有新回答/)
                if (noChangeMatch && parseInt(noChangeMatch[1]) > 0) {
                  // 连续无变化可能意味着接近完成
                  updateCrawlStatus(2, '即将完成加载...', maxAnswers, maxScrolls)
                  progressDetailText.value = `连续 ${noChangeMatch[1]} 次滚动没有发现新回答，即将完成加载...`
                }
              }
              // 检测提取阶段
              else if (log.includes('正在提取回答数据')) {
                isExtracting = true
                updateCrawlStatus(3, '正在提取数据...', maxAnswers, maxScrolls)
              } 
              // 检测完成阶段
              else if (log.includes('数据提取完成')) {
                isExtracting = true
                isCompleted = true
                const totalMatch = log.match(/获取到 (\d+) 条回答/)
                if (totalMatch && totalMatch[1]) {
                  const total = parseInt(totalMatch[1])
                  updateCrawlStatus(3, '数据提取完成...', total, maxScrolls)
                }
              }
            })
            
            // 根据日志状态更新进度
            if (maxAnswers > 0) {
              if (isCompleted) {
                updateCrawlStatus(4, '爬取完成', maxAnswers, maxScrolls)
              } else if (isExtracting) {
                updateCrawlStatus(3, '正在提取数据...', maxAnswers, maxScrolls)
              } else {
                updateCrawlStatus(2, '滚动加载回答中...', maxAnswers, maxScrolls)
              }
            }
          }
        }
        
        // 尝试从响应中提取进度信息
        try {
          extractProgressUpdates()
        } catch (e) {
          console.error('提取进度信息失败:', e)
        }
        
        // 使用服务器返回的实际数据更新最终进度
        if (response.data.totalAnswers && response.data.scrollAttempts) {
          scrollAttempts.value = response.data.scrollAttempts
          // 根据爬取阶段更新状态
          if (response.data.logs && response.data.logs.some(log => log.includes('数据提取完成'))) {
            updateCrawlStatus(4, '爬取完成', response.data.totalAnswers, response.data.scrollAttempts)
          } else {
            updateCrawlStatus(3, '正在提取数据...', response.data.totalAnswers, response.data.scrollAttempts)
          }
        }
        
        if (response.data.success) {
          // 短暂延迟，模拟提取阶段
          await new Promise(r => setTimeout(r, 1000))
          
          result.value = response.data.data
          ElMessage.success(`成功获取 ${result.value.answers.length} 条回答`)
          
          // 计算爬取用时
          fetchTime.value = ((Date.now() - startTime.value) / 1000).toFixed(1)
          
          // 更新最终进度
          updateCrawlStatus(4, '爬取完成', result.value.answers.length, scrollAttempts.value)
          finishProgressTracking()
          
          // 设置下载文件名
          if (response.data.excelFile) {
            downloadFileUrl.value = response.data.excelFile;
            ElMessage.success(`CSV文件已生成，可以下载`);
          }
        } else {
          error.value = response.data.message || '获取数据失败'
          finishProgressTracking()
        }
      } catch (err) {
        console.error('爬取知乎数据错误:', err)
        error.value = err.response?.data?.message || '服务器错误，请稍后再试'
        finishProgressTracking()
      } finally {
        loading.value = false
      }
    }
    
    // 处理页码变化
    const handlePageChange = (page) => {
      currentPage.value = page
      // 滚动到页面顶部
      window.scrollTo(0, 0)
    }
    
    // 处理排序方式变化
    const sortAnswers = () => {
      // 排序方式改变后重置页码
      currentPage.value = 1
    }
    
    // 返回搜索页面
    const backToSearch = () => {
      try {
        // 尝试使用router导航
        if (lastSearchData.value) {
          router.push({
            path: '/',
            query: {
              keyword: lastSearchData.value.keyword,
              page: lastSearchData.value.page
            }
          }).catch(err => {
            console.error('导航错误：', err);
            // 如果router导航失败，使用window.location
            if (lastSearchData.value) {
              window.location.href = `/?keyword=${encodeURIComponent(lastSearchData.value.keyword)}&page=${lastSearchData.value.page}`;
            } else {
              window.location.href = '/';
            }
          });
        } else {
          router.push('/').catch(err => {
            console.error('导航错误：', err);
            window.location.href = '/';
          });
        }
      } catch (err) {
        console.error('返回搜索页面错误：', err);
        // 备用导航方法
        window.location.href = '/';
      }
    }
    
    // 下载CSV文件
    const downloadFile = () => {
      if (!downloadFileUrl.value) {
        ElMessage.warning('CSV文件不存在');
        return;
      }
      
      // 创建下载链接
      const downloadUrl = `/api/download/${encodeURIComponent(downloadFileUrl.value)}`;
      console.log('下载链接:', downloadUrl);
      
      // 使用fetch API下载文件
      ElMessage.info('开始下载CSV文件，请稍候...');
      
      fetch(downloadUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`下载失败: ${response.status} ${response.statusText}`);
          }
          return response.blob();
        })
        .then(blob => {
          // 创建一个临时URL
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', downloadFileUrl.value);
          document.body.appendChild(link);
          link.click();
          
          // 清理
          window.URL.revokeObjectURL(url);
          document.body.removeChild(link);
          ElMessage.success('CSV文件下载成功');
        })
        .catch(error => {
          console.error('下载文件错误:', error);
          ElMessage.error(`下载失败: ${error.message}`);
        });
    }
    
    return {
      form,
      loading,
      error,
      result,
      hasCookie,
      showCookieDialog,
      filteredAnswers,
      currentPage,
      pageSize,
      sortType,
      fromSearch: isFromSearch,
      formatNumber,
      handleSubmit,
      handlePageChange,
      sortAnswers,
      backToSearch,
      fetchTime,
      averageVotes,
      getVoteClass,
      // 爬取进度相关
      crawlProgress,
      elapsedTime,
      crawlStage,
      crawlStatusText,
      currentAnswerCount,
      scrollAttempts,
      progressDetailText,
      expandedAnswers,
      isLongAnswer,
      toggleAnswer,
      downloadFile,
      downloadFileUrl
    }
  }
}
</script>

<style>
.home-container {
  max-width: 1200px;
  margin: 0 auto;
}

.form-section {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.filter-hint {
  margin-left: 10px;
  color: #909399;
  font-size: 13px;
}

.cookie-warning {
  margin-left: 15px;
  color: #e6a23c;
}

.search-navigation-tip {
  margin-top: 1rem;
}

.search-navigation-actions {
  margin-top: 0.5rem;
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
  justify-content: space-around;
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

/* 添加实时进度信息样式 */
.progress-details {
  margin: 1rem 0;
  padding: 0.5rem;
  background-color: #f5f7fa;
  border-radius: 4px;
  border-left: 4px solid #409EFF;
}

.progress-detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 4px;
}

.progress-detail-text {
  font-size: 14px;
  color: #606266;
  padding-left: 24px;
}

.results-container {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.results-header h2 {
  margin: 0;
}

.results-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.results-info-card {
  margin-bottom: 2rem;
}

.info-header {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 1rem;
  color: #409EFF;
}

.stats-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 20px 5px;
}

.stats-label {
  color: #606266;
  font-size: 0.9rem;
  text-align: right;
  white-space: nowrap;
  width: 80px;
}

.stats-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #303133;
  padding-right: 30px;
}

.description {
  margin-bottom: 2rem;
}

.answers-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.answer-card {
  margin-bottom: 0;
  border-radius: 8px;
  padding: 1.5rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.answer-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08) !important;
}

.answer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.author {
  font-weight: bold;
}

.votes {
  padding: 2px 8px;
  border-radius: 12px;
}

.votes-high {
  color: #fff;
  background-color: #f56c6c;
}

.votes-medium {
  color: #fff;
  background-color: #e6a23c;
}

.votes-low {
  color: #fff;
  background-color: #67c23a;
}

.answer-content {
  white-space: pre-wrap;
  line-height: 1.6;
  transition: max-height 0.3s ease;
  overflow: hidden;
}

.answer-content.collapsed {
  max-height: 4.8em; /* 显示3行文本 */
  position: relative;
}

.expand-btn {
  color: #409EFF;
  cursor: pointer;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  margin-top: 8px;
  transition: all 0.2s ease;
}

.expand-btn:hover {
  color: #66b1ff;
}

.error-alert {
  margin-top: 2rem;
}

/* 描述卡片样式 */
.description-card {
  margin-bottom: 2rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.description-content {
  white-space: pre-wrap;
  line-height: 1.6;
}

@media screen and (max-width: 768px) {
  .stats-table {
    display: flex;
    flex-direction: column;
  }
  
  .stats-table tr {
    display: flex;
    flex-wrap: wrap;
  }
  
  .stats-label, .stats-value {
    display: inline-block;
    padding: 5px 0;
  }
  
  .stats-label {
    width: auto;
    text-align: left;
    margin-right: 10px;
  }
  
  .stats-value {
    font-size: 1.2rem;
    margin-right: 20px;
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
</style> 