<template>
  <div class="app-container">
    <header class="app-header">
      <h1>知乎内容爬虫</h1>
      <div class="nav-menu">
        <a href="/" class="nav-item" :class="{ 'router-link-active': isSearchActive }">关键词搜索</a>
        <a href="/crawler" class="nav-item" :class="{ 'router-link-active': isCrawlerActive }">回答爬取</a>
      </div>
      <div class="user-status">
        <template v-if="user">
          <span class="welcome-text">欢迎, {{ user.name }}</span>
          <el-button type="danger" size="small" @click="handleLogout">退出登录</el-button>
        </template>
        <template v-else>
          <el-button type="info" size="small" @click="showCookieDialog">设置Cookie</el-button>
        </template>
      </div>
    </header>

    <main>
      <router-view/>
    </main>

    <footer class="app-footer">
      <div class="footer-content">
        <p>&copy; 2025 知乎内容爬虫工具</p>
        <p class="footer-desc">基于 Vue.js + Node.js + Puppeteer 技术构建</p>
        <div class="footer-links">
          <a href="#" @click.prevent="showAbout">关于我们</a>
          <span class="divider">|</span>
          <a href="#" @click.prevent="showPrivacy">隐私政策</a>
          <span class="divider">|</span>
          <a href="#" @click.prevent="showTerms">使用条款</a>
        </div>
      </div>
    </footer>

    <div class="watermark">
      <div class="watermark-content" v-for="i in 10" :key="i">
        知乎内容爬虫 · 仅供学习使用
      </div>
    </div>

    <CookieDialog 
      v-model:visible="cookieDialogVisible" 
      @save="handleCookieSave" 
    />
  </div>
</template>

<script>
import { ref, onMounted, provide, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus'
import CookieDialog from './components/CookieDialog.vue'

export default {
  name: 'App',
  components: {
    CookieDialog
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const user = ref(null)
    const cookieDialogVisible = ref(false)
    const hasCookie = ref(!!localStorage.getItem('zhihu_cookie'))

    // 计算当前是否在爬取页面
    const isCrawlerActive = computed(() => {
      return route.path === '/crawler'
    })
    
    // 计算当前是否在搜索页面
    const isSearchActive = computed(() => {
      return route.path === '/' || route.path === '/search'
    })

    // 导航到回答爬取页面
    const goToCrawler = () => {
      try {
        // 使用window.location进行硬性导航，确保页面重新加载
        window.location.href = '/crawler';
      } catch (err) {
        console.error('导航错误:', err);
        ElMessage.error('页面跳转失败，请刷新页面后重试');
      }
    }

    // 验证Cookie并获取用户信息
    const verifyCookie = async (cookie) => {
      if (!cookie) return false;
      
      // 创建加载指示器
      const loading = ElLoading.service({
        lock: true,
        text: '验证Cookie中...',
        background: 'rgba(0, 0, 0, 0.7)'
      });
      
      try {
        console.log('验证Cookie: 长度', cookie.length);
        
        // 设置请求超时时间
        const response = await axios.post('/api/verify-cookie', { cookie }, {
          timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
          user.value = response.data.user;
          console.log('Cookie验证成功, 用户:', user.value.name);
          ElMessage.success(`欢迎, ${user.value.name}`);
          hasCookie.value = true;
          return true;
        }
        
        console.error('验证失败:', response.data);
        ElMessage.error(response.data.message || 'Cookie验证失败');
        hasCookie.value = false;
        return false;
      } catch (error) {
        console.error('验证Cookie异常:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Cookie验证失败';
        ElMessage.error(errorMessage);
        hasCookie.value = false;
        return false;
      } finally {
        loading.close();
      }
    }

    // 处理Cookie保存
    const handleCookieSave = async (cookie) => {
      if (!cookie) {
        ElMessage.warning('Cookie不能为空');
        return;
      }
      
      // 验证Cookie是否有效
      const isValid = await verifyCookie(cookie);
      
      if (isValid) {
        // 保存到localStorage
        localStorage.setItem('zhihu_cookie', cookie);
        cookieDialogVisible.value = false;
        ElMessage.success('Cookie已保存');
        
        // 触发一个事件，通知其他组件Cookie已更新
        window.dispatchEvent(new CustomEvent('localStorageChange', {
          detail: {
            key: 'zhihu_cookie',
            value: cookie
          }
        }));
      } else {
        // 错误消息已在verifyCookie中显示
      }
    }

    // 显示Cookie设置对话框
    const showCookieDialog = () => {
      cookieDialogVisible.value = true;
    }

    // 处理退出登录
    const handleLogout = () => {
      ElMessageBox.confirm(
        '确定要退出登录吗？这将清除保存的Cookie。',
        '退出登录',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }
      ).then(() => {
        // 清除localStorage中的Cookie
        localStorage.removeItem('zhihu_cookie');
        // 清除用户信息
        user.value = null;
        hasCookie.value = false;
        ElMessage.success('已退出登录');
        
        // 触发事件通知其他组件Cookie已移除
        window.dispatchEvent(new CustomEvent('localStorageChange', {
          detail: {
            key: 'zhihu_cookie',
            value: null
          }
        }));
      }).catch(() => {
        // 用户取消操作
      });
    };

    // 提供showCookieDialog方法给子组件使用
    provide('showCookieDialog', showCookieDialog);
    provide('hasCookie', hasCookie);

    // 组件挂载时检查是否有存储的Cookie
    onMounted(async () => {
      const savedCookie = localStorage.getItem('zhihu_cookie');
      if (savedCookie) {
        await verifyCookie(savedCookie);
      }
      
      // 添加全局导航错误处理
      router.onError((error) => {
        console.error('路由导航错误:', error)
        ElMessage.error('页面加载失败，请刷新页面重试')
      })
    });

    const showAbout = () => {
      router.push('/about');
    };

    const showPrivacy = () => {
      ElMessageBox.alert(
        '本工具仅供学习和研究使用，请勿用于商业目的或违反知乎用户协议的行为。使用本工具时，请遵守相关法律法规和知乎的使用条款。',
        '隐私政策',
        {
          confirmButtonText: '我知道了'
        }
      );
    };

    const showTerms = () => {
      ElMessageBox.alert(
        '使用本工具即表示您同意：\n1. 仅将获取的内容用于个人学习和研究\n2. 不将内容用于商业用途\n3. 尊重知乎和原作者的知识产权\n4. 自行承担使用本工具的一切风险',
        '使用条款',
        {
          confirmButtonText: '我同意'
        }
      );
    };

    return {
      user,
      cookieDialogVisible,
      isCrawlerActive,
      isSearchActive,
      showCookieDialog,
      handleCookieSave,
      handleLogout,
      showAbout,
      showPrivacy,
      showTerms,
      goToCrawler
    }
  }
}
</script>

<style>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
}

.app-header {
  background-color: #0066ff;
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.nav-menu {
  display: flex;
  gap: 20px;
}

.nav-item {
  color: white;
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.router-link-active {
  background-color: rgba(255, 255, 255, 0.2);
  font-weight: bold;
}

.user-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.welcome-text {
  margin-right: 10px;
}

main {
  flex: 1;
  padding: 1rem;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.app-footer {
  background-color: #f5f5f5;
  padding: 1rem;
  text-align: center;
  margin-top: auto;
  border-top: 1px solid #e0e0e0;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
}

.footer-desc {
  color: #666;
  font-size: 0.9rem;
  margin: 5px 0;
}

.footer-links {
  margin-top: 10px;
}

.footer-links a {
  color: #0066ff;
  text-decoration: none;
  margin: 0 5px;
}

.footer-links a:hover {
  text-decoration: underline;
}

.divider {
  color: #ccc;
}

/* 水印样式 */
.watermark {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.watermark-content {
  color: rgba(0, 0, 0, 0.03);
  font-size: 18px;
  transform: rotate(-45deg);
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  justify-content: space-around;
}
</style> 