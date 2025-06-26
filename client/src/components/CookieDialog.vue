<template>
  <el-dialog
    title="设置知乎Cookie"
    v-model="dialogVisible"
    width="50%"
    :before-close="handleClose"
  >
    <el-alert
      title="如何获取Cookie？"
      type="info"
      description="1. 在浏览器中登录知乎 2. 按F12打开开发者工具 3. 切换到'网络(Network)'面板 4. 刷新页面 5. 点击任意zhihu.com请求 6. 在'请求头'中找到并复制cookie的值"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    />
    
    <el-alert
      v-if="cookieWarning"
      title="注意"
      type="warning"
      :description="cookieWarning"
      :closable="true"
      show-icon
      style="margin-bottom: 20px"
      @close="cookieWarning = ''"
    />
    
    <el-input
      v-model="cookieValue"
      type="textarea"
      :rows="6"
      placeholder="请粘贴知乎Cookie..."
    />
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleSave" :disabled="!cookieValue">保存</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
import { ref, watch } from 'vue'

export default {
  name: 'CookieDialog',
  props: {
    visible: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:visible', 'save'],
  setup(props, { emit }) {
    const cookieValue = ref('')
    const dialogVisible = ref(false)
    const cookieWarning = ref('')
    
    // 监听外部visible属性变化
    watch(() => props.visible, (newVal) => {
      dialogVisible.value = newVal
      // 每次打开对话框时加载已保存的cookie
      if (newVal) {
        const savedCookie = localStorage.getItem('zhihu_cookie')
        cookieValue.value = savedCookie || ''
      }
    })
    
    // 监听本地dialogVisible变化，同步更新父组件
    watch(dialogVisible, (newVal) => {
      emit('update:visible', newVal)
    })
    
    // 处理关闭对话框
    const handleClose = () => {
      dialogVisible.value = false
    }
    
    // 验证Cookie格式是否有效
    const validateCookie = (cookie) => {
      if (!cookie) return { valid: false, message: 'Cookie不能为空' }
      
      // 检查Cookie是否包含必要的字段
      const requiredFields = ['z_c0', '_zap', 'SESSIONID']
      const missingFields = []
      
      requiredFields.forEach(field => {
        if (!cookie.includes(field + '=')) {
          missingFields.push(field)
        }
      })
      
      if (missingFields.length > 0) {
        return {
          valid: false,
          message: `Cookie可能不完整，缺少以下字段: ${missingFields.join(', ')}`
        }
      }
      
      return { valid: true }
    }
    
    // 清理Cookie字符串
    const cleanCookie = (cookie) => {
      // 移除可能存在的多余空格、换行符等
      let cleaned = cookie.trim().replace(/\r?\n|\r/g, '')
      
      // 移除可能存在的"Cookie: "前缀
      if (cleaned.toLowerCase().startsWith('cookie:')) {
        cleaned = cleaned.substring(7).trim()
      }
      
      return cleaned
    }
    
    // 处理保存Cookie
    const handleSave = () => {
      if (!cookieValue.value) {
        cookieWarning.value = 'Cookie不能为空'
        return
      }
      
      // 清理Cookie
      const cleanedCookie = cleanCookie(cookieValue.value)
      
      // 验证Cookie
      const validation = validateCookie(cleanedCookie)
      if (!validation.valid) {
        cookieWarning.value = validation.message
        cookieValue.value = cleanedCookie // 更新为清理后的值
        return
      }
      
      // 发送到父组件
      emit('save', cleanedCookie)
    }
    
    return {
      cookieValue,
      dialogVisible,
      cookieWarning,
      handleClose,
      handleSave
    }
  }
}
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style> 