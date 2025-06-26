<template>
  <div class="about-container">
    <el-card>
      <template #header>
        <h2>关于本项目</h2>
      </template>
      
      <div class="content">
        <h3>知乎内容爬虫</h3>
        <p>本项目是一个用于爬取知乎问题及回答的工具，基于Vue、Node.js和Puppeteer开发。</p>
        
        <h3>项目架构</h3>
        <p>采用前端 (Vue) + 服务端 (Node.js) + 无头浏览器 (Puppeteer) 的三层分离架构。</p>
        
        <h3>特点</h3>
        <ul>
          <li>模拟真实浏览器环境，有效绕过反爬机制</li>
          <li>使用用户提供的Cookie，无需处理登录过程</li>
          <li>支持无限滚动，获取问题下的所有回答</li>
          <li>清洗HTML，提供干净的纯文本内容</li>
        </ul>
        
        <h3>注意事项</h3>
        <p>本工具仅供学习研究使用，请勿用于商业目的或违反知乎用户协议的行为。请尊重知乎及创作者的权益。</p>
      </div>
    </el-card>
  </div>
</template>

<script>
export default {
  name: 'About'
}
</script>

<style scoped>
.about-container {
  max-width: 800px;
  margin: 0 auto;
}

.content {
  line-height: 1.8;
}

h3 {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  color: #0066ff;
}

ul {
  padding-left: 1.5rem;
}

li {
  margin-bottom: 0.5rem;
}
</style> 