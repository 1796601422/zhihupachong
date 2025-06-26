import { createRouter, createWebHistory } from 'vue-router'
import Search from '../views/Search.vue'
import Home from '../views/Home.vue'

const routes = [
  {
    path: '/',
    name: 'Search',
    component: Search
  },
  {
    path: '/crawler',
    name: 'Crawler',
    component: Home,
    props: (route) => ({ 
      url: route.query.url,
      fromSearch: !!route.query.fromSearch
    })
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/About.vue')
  },
  // 添加重定向，兼容旧版本的链接
  {
    path: '/search',
    redirect: '/'
  },
  // 捕获所有未匹配的路由
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes,
  scrollBehavior() {
    // 始终滚动到顶部
    return { top: 0 }
  }
})

// 防止重复导航错误
const originalPush = router.push
router.push = function(location) {
  return originalPush.call(this, location).catch(err => {
    if (err.name !== 'NavigationDuplicated') throw err
  })
}

// 全局导航守卫
router.beforeEach((to, from, next) => {
  console.log('路由导航:', from.path, '->', to.path, '参数:', to.query);
  
  // 解决导航到爬取页面的问题
  if (to.path === '/crawler') {
    console.log('导航到爬取页面，URL参数:', to.query.url);
    // 无条件放行爬取页面，不再检查URL参数
    next();
  } else {
    next();
  }
})

// 导航后钩子
router.afterEach((to, from) => {
  console.log('导航完成:', from.path, '->', to.path);
})

// 添加全局错误处理
router.onError((error) => {
  console.error('路由错误:', error);
})

export default router 