const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const stream =require('stream');
const pipeline = promisify(stream.pipeline);
const Jimp = require('jimp');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

const getPuppeteerLaunchOptions = (logProgress) => {
  let launchOptions = {};
  const isProduction = process.env.NODE_ENV === 'production';
  const executablePathFromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;

  // 优先判断是否为服务器/生产环境
  if (isProduction || executablePathFromEnv) {
    logProgress('检测到生产/服务器环境，使用优化配置');
    const executablePath = executablePathFromEnv || '/usr/bin/google-chrome-stable';
    logProgress(`将使用浏览器: ${executablePath}`);
    
    launchOptions = {
      headless: true,
      executablePath: executablePath,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
        '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote',
        '--single-process', '--disable-extensions', '--disable-accelerated-2d-canvas',
        '--disable-gl-drawing-for-tests', '--mute-audio', '--js-flags=--max-old-space-size=512'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    };
  } else {
    // 否则，假定为本地开发环境
    logProgress('检测到本地开发环境，使用调试配置');
    const browserPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    const localBrowserPath = browserPaths.find(p => {
      try { return fs.existsSync(p); } catch (e) { return false; }
    });

    if (localBrowserPath) {
      logProgress(`找到本地浏览器: ${localBrowserPath}`);
      launchOptions = {
        headless: false,
        executablePath: localBrowserPath,
        defaultViewport: null,
        args: ['--start-maximized', '--auto-open-devtools-for-tabs', '--disable-blink-features=AutomationControlled']
      };
    } else {
      logProgress('警告：未在常规路径找到Chrome/Edge，将尝试使用Puppeteer自带的Chromium。');
      launchOptions = {
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
      };
    }
  }
  return launchOptions;
};

// 使用隐身插件，隐藏Puppeteer的特征
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置

// 中间件
app.use(cors());
app.use(express.json({limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'client/dist')));

// 测试接口
app.get('/api/test', (req, res) => {
  res.json({ message: '服务器正常运行' });
});

// 验证Cookie有效性接口
app.post('/api/verify-cookie', async (req, res) => {
  try {
    const cookie = req.body.cookie;
    console.log('收到Cookie验证请求，Cookie长度:', cookie ? cookie.length : 0);
    
    if (!cookie) {
      return res.status(400).json({ success: false, message: '请提供Cookie' });
    }

    // 打印Cookie的部分内容以便调试（不要打印完整Cookie以保护隐私）
    console.log('Cookie前20个字符:', cookie.substring(0, 20) + '...');
    
    // 打印请求头以便调试
    const headers = {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.60'
    };
    console.log('发送请求到知乎API，请求头:', JSON.stringify(headers).substring(0, 100) + '...');
    
    const response = await axios.get('https://www.zhihu.com/api/v4/me', {
      headers: headers
    });

    // 如果请求成功，返回用户信息
    console.log('知乎API请求成功，用户名:', response.data.name);
    return res.json({ 
      success: true, 
      user: {
        name: response.data.name,
        avatar: response.data.avatar_url,
        url: response.data.url
      } 
    });
  } catch (error) {
    console.error('验证Cookie错误, 状态码:', error.response?.status);
    console.error('错误详情:', error.response?.data || error.message);
    return res.status(401).json({ 
      success: false, 
      message: `Cookie无效或已过期: ${error.response?.status || error.message}`
    });
  }
});

// 获取知乎数据接口
app.post('/api/fetch-zhihu-data', async (req, res) => {
  let browser = null;
  const logs = [];  // 用于记录爬取过程中的日志
  
  const logProgress = (message) => {
    console.log(message);
    logs.push(message);
  };
  
  try {
    const { url, cookie, minVotes } = req.body;
    logProgress('收到爬取请求，URL: ' + url);
    logProgress('最小赞同数过滤条件: ' + (minVotes || '无'));
    
    if (!url) {
      return res.status(400).json({ success: false, message: '请提供知乎URL' });
    }
    
    if (!cookie) {
      return res.status(400).json({ success: false, message: '请提供Cookie' });
    }

    // 解析Cookie字符串为对象数组格式
    const cookieObjects = parseCookieString(cookie, '.zhihu.com');
    console.log(`解析后的Cookie对象数量: ${cookieObjects.length}`);

    // 启动浏览器
    const launchOptions = getPuppeteerLaunchOptions(logProgress);
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    // 优化请求，禁用不必要的资源加载
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // 设置视窗大小，模拟桌面浏览
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 注入Cookie
    await page.setCookie(...cookieObjects);
    logProgress('已注入Cookie到浏览器');

    // 导航到目标页面
    logProgress('正在导航到页面: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 3600000 });
    logProgress('页面基本结构加载完成');
    
    // 智能等待关键元素出现
    logProgress('等待页面加载完成...');
    await page.waitForSelector('.QuestionHeader-title', { timeout: 30000 }); // 恢复适中的等待时间
    
    // 等待额外时间确保页面完全加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    logProgress('页面加载完成，已找到问题标题');
    
    // 执行多次滚动，确保加载更多回答
    logProgress('开始执行滚动，加载更多回答...');

    // 获取当前回答数量
    let previousAnswerCount = 0;
    let currentAnswerCount = 0;
    let scrollAttempts = 0;
    let noChangeCount = 0;
    const maxScrollAttempts = 30; // 增加最大滚动尝试次数
    const maxNoChangeAttempts = 3; // 连续多少次没有新回答时停止
    
    do {
      previousAnswerCount = currentAnswerCount;
      
      // 使用模拟人类的平滑滚动代替瞬移滚动
      logProgress(`第 ${scrollAttempts + 1} 次滚动: 开始模拟人类平滑滚动...`);
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const scrollHeight = document.body.scrollHeight;
          const viewportHeight = window.innerHeight;
          
          const timer = setInterval(() => {
            // 每次滚动一小段距离
            const distance = Math.floor(Math.random() * 100) + 100; // 每次滚动100-200px
            window.scrollBy(0, distance);
            totalHeight += distance;

            // 如果滚动位置超过了页面高度，则停止
            if (window.pageYOffset + viewportHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, Math.floor(Math.random() * 50) + 100); // 每隔100-150ms滚动一次
        });
      });
      logProgress(`第 ${scrollAttempts + 1} 次滚动: 平滑滚动完成。`);

      // 等待加载
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 检查回答数量
      currentAnswerCount = await page.evaluate(() => {
        return document.querySelectorAll('.AnswerItem').length;
      });
      
      logProgress(`滚动后检测到 ${currentAnswerCount} 个回答（之前: ${previousAnswerCount}）`);
      scrollAttempts++;
      
      // 检查是否有新回答加载
      if (currentAnswerCount === previousAnswerCount) {
        noChangeCount++;
        logProgress(`连续 ${noChangeCount} 次滚动没有新回答`);
      } else {
        noChangeCount = 0; // 重置计数器
      }
      
    } while ((currentAnswerCount > previousAnswerCount || noChangeCount < maxNoChangeAttempts) && 
             scrollAttempts < maxScrollAttempts);
    
    logProgress(`完成滚动，总共加载了 ${currentAnswerCount} 个回答，滚动次数: ${scrollAttempts}`);
    
    // 再执行一次额外的滚动确保所有内容加载完毕
    await page.evaluate(() => {
      window.scrollTo(0, 0); // 先滚动到顶部
    });
    await new Promise(resolve => setTimeout(resolve, 1500)); // 增加等待时间
    
    logProgress('执行最终滚动以确保所有内容加载完毕...');
    
    // 滚动到底部
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待加载
    
    // 再滚动回顶部
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待加载
    
    // 提取数据
    logProgress('正在提取回答数据...');
    const result = await page.evaluate(() => {
      // 获取问题标题
      const titleElement = document.querySelector('.QuestionHeader-title');
      const title = titleElement ? titleElement.innerText : '无法获取标题';
      
      // 获取问题描述
      const descElement = document.querySelector('.RichText.ztext');
      const description = descElement ? descElement.innerText : '';
      
      // 获取所有回答
      const answerItems = document.querySelectorAll('.AnswerItem');
      console.log(`找到${answerItems.length}个回答元素`);
      
      const answers = Array.from(answerItems).map(item => {
        // 获取作者信息
        const authorElement = item.querySelector('.AuthorInfo-name');
        const authorName = authorElement ? authorElement.innerText : '匿名用户';
        
        // 获取IP归属地信息
        let ipLocation = '未知';
        const ipElements = item.querySelectorAll('.AuthorInfo-detail span');
        if (ipElements && ipElements.length) {
          for (const el of ipElements) {
            const text = el.innerText;
            if (text && (text.includes('IP') || text.includes('属地'))) {
              ipLocation = text.replace(/IP 属地：/, '').trim();
              break;
            }
          }
        }
        
        // 获取点赞数 - 支持多种知乎页面结构
        // 方法1: 最新的按钮结构 (包含aria-label="赞同 xx")
        let voteCountText = '';
        let voteCountNumber = 0;
        
        // 尝试所有可能的选择器
        const possibleSelectors = [
          // 2023新版选择器 - 按钮形式
          '.VoteButton',
          // 2023新版选择器 - 替代形式
          '.Button.VoteButton',
          // 以前的结构
          '.VoteButton--up',
          // 极简选择器
          '[aria-label^="赞同"]'
        ];
        
        // 依次尝试各种选择器
        for (const selector of possibleSelectors) {
          const voteBtn = item.querySelector(selector);
          if (voteBtn) {
            // 优先尝试从aria-label中提取
            const ariaLabel = voteBtn.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.includes('赞同')) {
              // 从"赞同 69"中提取数字
              const match = ariaLabel.match(/赞同\s+(\d+)/);
              if (match && match[1]) {
                voteCountText = match[1];
                voteCountNumber = parseInt(match[1]);
                break;
              }
            }
            
            // 尝试从按钮文本中提取
            const btnText = voteBtn.innerText.trim();
            if (btnText) {
              if (btnText.includes('赞同')) {
                // 处理"赞同 69"形式
                const match = btnText.match(/赞同\s+(\d+|\d+\.\d+[Kk万]?)/);
                if (match && match[1]) {
                  voteCountText = match[1];
                  if (match[1].includes('K') || match[1].includes('k')) {
                    voteCountNumber = Math.round(parseFloat(match[1].replace(/[Kk]/, '')) * 1000);
                  } else if (match[1].includes('万')) {
                    voteCountNumber = Math.round(parseFloat(match[1].replace('万', '')) * 10000);
                  } else {
                    voteCountNumber = parseInt(match[1]);
                  }
                  break;
                }
              } else if (/^\d+$/.test(btnText) || /^\d+\.\d+[Kk万]?$/.test(btnText)) {
                // 纯数字或带单位的数字
                voteCountText = btnText;
                if (btnText.includes('K') || btnText.includes('k')) {
                  voteCountNumber = Math.round(parseFloat(btnText.replace(/[Kk]/, '')) * 1000);
                } else if (btnText.includes('万')) {
                  voteCountNumber = Math.round(parseFloat(btnText.replace('万', '')) * 10000);
                } else {
                  voteCountNumber = parseInt(btnText);
                }
                break;
              }
            }
          }
        }
        
        // 如果上面的方法都失败了，尝试查找专门显示数字的元素
        if (!voteCountText) {
          const voteNumberElement = item.querySelector('.VoteButton-count, .Vote-count');
          if (voteNumberElement) {
            voteCountText = voteNumberElement.innerText.trim();
            if (voteCountText) {
              if (voteCountText.includes('K') || voteCountText.includes('k')) {
                voteCountNumber = Math.round(parseFloat(voteCountText.replace(/[Kk]/, '')) * 1000);
              } else if (voteCountText.includes('万')) {
                voteCountNumber = Math.round(parseFloat(voteCountText.replace('万', '')) * 10000);
              } else {
                voteCountNumber = parseInt(voteCountText) || 0;
              }
            }
          }
        }
        
        // 如果仍然没有找到，设置默认值
        if (!voteCountText) {
          voteCountText = '0';
          voteCountNumber = 0;
        }
        
        // 获取回答内容（纯文本，避免HTML标签）
        const contentElement = item.querySelector('.RichText.ztext');
        let content = '内容为空';
        
        if (contentElement) {
          // 确保获取纯文本内容
          content = contentElement.innerText || contentElement.textContent || '内容为空';
          
          // 调试信息
          console.log(`回答内容长度: ${content.length}, 前50个字符: ${content.substring(0, 50)}`);
        }
        
        return {
          author: authorName,
          ipLocation: ipLocation,
          voteCount: voteCountText,
          voteCountNumber: voteCountNumber,
          content: content
        };
      });

      return {
        title,
        description,
        answers
      };
    });

    logProgress(`数据提取完成，获取到 ${result.answers.length} 条回答`);
    
    // 根据最小赞同数进行过滤
    if (minVotes && !isNaN(parseInt(minVotes))) {
      const minVotesNumber = parseInt(minVotes);
      const filteredAnswers = result.answers.filter(answer => answer.voteCountNumber >= minVotesNumber);
      logProgress(`根据赞同数过滤后，保留了 ${filteredAnswers.length} 条回答（最小赞同数: ${minVotesNumber}）`);
      result.answers = filteredAnswers;
    }
    
    // 生成CSV文件
    if (result.answers.length > 0) {
      logProgress(`第一条回答内容示例: ${result.answers[0].content.substring(0, 100)}...`);
    }

    // 创建CSV内容
    // 添加UTF-8 BOM标记，确保Excel正确识别中文
    let csvContent = "\uFEFF问题,回答内容,IP归属地,赞同数\n";
    
    // 添加每个回答
    result.answers.forEach(answer => {
      // 处理CSV字段，确保正确转义
      const questionField = `"${result.title.replace(/"/g, '""')}"`;
      const contentField = `"${answer.content.replace(/"/g, '""')}"`;
      const ipLocationField = `"${answer.ipLocation || '未知'}"`;
      const voteCountField = `"${answer.voteCountNumber || 0}"`;
      
      csvContent += `${questionField},${contentField},${ipLocationField},${voteCountField}\n`;
    });
    
    // 修改文件扩展名为CSV
    const safeTitle = result.title.substring(0, 20).replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `zhihu_question_${safeTitle}_${Date.now()}.csv`;
    const filePath = path.join(__dirname, 'downloads');
    
    // 确保下载目录存在
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }
    
    const fullFilePath = path.join(filePath, fileName);
    
    try {
      // 直接写入文件，使用带BOM的UTF-8编码
      fs.writeFileSync(fullFilePath, csvContent, 'utf8');
      
      // 验证文件是否成功创建
      if (fs.existsSync(fullFilePath)) {
        const stats = fs.statSync(fullFilePath);
        logProgress(`CSV文件已生成: ${fileName}`);
        logProgress(`CSV文件大小: ${stats.size} 字节`);
        
        // 读取文件的前200个字符进行验证
        const filePreview = fs.readFileSync(fullFilePath, 'utf8').substring(0, 200);
        logProgress(`CSV文件预览: ${filePreview}...`);
      }
    } catch (error) {
      console.error('生成CSV文件失败:', error);
      logProgress(`生成CSV文件失败: ${error.message}`);
    }
    
    // 返回结果和文件下载链接
    res.json({ 
      success: true, 
      data: result,
      logs: logs,
      totalAnswers: result.answers.length,
      scrollAttempts: scrollAttempts,
      excelFile: fileName // 保持相同的字段名，前端代码不需要修改
    });
    
  } catch (error) {
    console.error('爬取知乎数据错误:', error);
    logProgress('爬取知乎数据错误: ' + error.message);
    res.status(500).json({ 
      success: false, 
      message: `爬取失败: ${error.message}`,
      logs: logs
    });
  } finally {
    // 确保浏览器关闭，避免内存泄漏
    if (browser) {
      await browser.close();
      logProgress('浏览器已关闭');
    }
  }
});

// 关键字搜索接口
app.post('/api/search-questions', async (req, res) => {
  let browser = null;
  
  try {
    const { keyword, cookie, page = 1 } = req.body;
    console.log('收到关键词搜索请求，关键词:', keyword);
    console.log('页码:', page);
    
    if (!keyword) {
      return res.status(400).json({ success: false, message: '请提供搜索关键词' });
    }
    
    if (!cookie) {
      return res.status(400).json({ success: false, message: '请提供Cookie' });
    }

    // 解析Cookie字符串为对象数组格式
    const cookieObjects = parseCookieString(cookie, '.zhihu.com');
    console.log(`解析后的Cookie对象数量: ${cookieObjects.length}`);

    // 启动浏览器
    const launchOptions = getPuppeteerLaunchOptions(console.log);
    browser = await puppeteer.launch(launchOptions);

    const searchPage = await browser.newPage();
    
    // 优化请求，禁用不必要的资源加载
    await searchPage.setRequestInterception(true);
    searchPage.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 设置视窗大小，模拟桌面浏览
    await searchPage.setViewport({ width: 1920, height: 1080 });
    
    // 注入Cookie
    await searchPage.setCookie(...cookieObjects);
    console.log('已注入Cookie到浏览器');

    // 构建搜索URL（限定为问题类型）
    const searchUrl = `https://www.zhihu.com/search?type=question&q=${encodeURIComponent(keyword)}&page=${page}`;
    
    // 导航到搜索页面
    console.log('正在导航到搜索页面:', searchUrl);
    await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 1800000 });
    console.log('搜索页面基本结构加载完成');
    
    // 等待页面加载 - 更新选择器，使用更通用的选择器
    console.log('等待搜索结果加载...');
    
    // 尝试不同的选择器，处理知乎可能的页面结构变化
    await Promise.race([
      searchPage.waitForSelector('.SearchResult-Card', { timeout: 10000 }).catch(() => null),
      searchPage.waitForSelector('.Card.SearchResult-Card', { timeout: 10000 }).catch(() => null),
      searchPage.waitForSelector('.QuestionItem', { timeout: 10000 }).catch(() => null),
      searchPage.waitForSelector('.List-item', { timeout: 10000 }).catch(() => null),
      searchPage.waitForSelector('[data-za-detail-view-path-module="questionItem"]', { timeout: 10000 }).catch(() => null),
      new Promise(resolve => setTimeout(resolve, 12000)) // 最长等待12秒
    ]);
    
    // 等待额外时间确保页面完全加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 执行滚动以加载更多结果
    console.log('执行滚动以加载更多结果...');
    for (let i = 0; i < 3; i++) { // 适当的滚动次数
      await searchPage.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.7);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 获取页面HTML以便调试（仅获取部分内容，避免过大）
    const pageContent = await searchPage.evaluate(() => {
      return document.body.innerHTML.substring(0, 10000); // 获取前10000个字符用于调试
    });
    console.log('页面内容片段 (用于调试):', pageContent.substring(0, 300) + '...');
    
    // 提取搜索结果 - 更新选择器和提取逻辑
    console.log('提取搜索结果数据...');
    const searchResults = await searchPage.evaluate(() => {
      const results = [];
      let questionItems = [];
      
      // 尝试多种可能的选择器来查找问题项
      // 方法1: 标准搜索卡片
      let items = document.querySelectorAll('.SearchResult-Card');
      if (items && items.length > 0) {
        questionItems = items;
      } else {
        // 方法2: 带Card类的搜索结果
        items = document.querySelectorAll('.Card.SearchResult-Card');
        if (items && items.length > 0) {
          questionItems = items;
        } else {
          // 方法3: 问题项
          items = document.querySelectorAll('.QuestionItem');
          if (items && items.length > 0) {
            questionItems = items;
          } else {
            // 方法4: 列表项
            items = document.querySelectorAll('.List-item');
            if (items && items.length > 0) {
              questionItems = items;
            } else {
              // 方法5: 使用数据属性
              items = document.querySelectorAll('[data-za-detail-view-path-module="questionItem"]');
              if (items && items.length > 0) {
                questionItems = items;
              }
            }
          }
        }
      }
      
      console.log('找到问题项数量:', questionItems.length);
      
      // 遍历搜索结果卡片
      Array.from(questionItems).forEach(card => {
        try {
          // 尝试各种可能的选择器来获取标题和链接
          let titleElement = null;
          let title = '';
          let url = '';
          
          // 尝试各种可能的标题选择器
          const possibleTitleSelectors = [
            'a.QuestionItem-title',
            'div.QuestionItem-title a',
            'h2.ContentItem-title a',
            'div.ContentItem-title a',
            '.RichContent-inner a',
            '.QuestionCard-title a',
            '.Question-title a',
            'a[data-za-detail-view-element_name="Title"]',
            'a[itemprop="url"]'
          ];
          
          for (const selector of possibleTitleSelectors) {
            titleElement = card.querySelector(selector);
            if (titleElement) {
              title = titleElement.innerText.trim();
              url = titleElement.href;
              if (title && url) break;
            }
          }
          
          if (!title || !url) {
            // 如果没有找到标题或URL，跳过这个结果
            return;
          }
          
          // 确保URL是知乎问题链接
          if (!url.includes('zhihu.com/question/')) {
            return;
          }
          
          // 获取问题详情（可能不存在）
          let content = '';
          const possibleContentSelectors = [
            '.RichText.ztext',
            '.KfeCollection-DescriptionCard-content',
            '.QuestionItem-excerpt',
            '.RichContent-inner',
            '.RichText'
          ];
          
          for (const selector of possibleContentSelectors) {
            const contentElement = card.querySelector(selector);
            if (contentElement) {
              content = contentElement.innerText.trim();
              if (content) break;
            }
          }
          
          // 获取回答数和关注数
          let answerCount = '0';
          let followCount = '0';
          
          // 尝试各种可能的统计数据选择器
          const possibleStatSelectors = [
            '.QuestionItem-actions .NumberBoard-item .NumberBoard-value',
            '.QuestionItem-metrics .NumberBoard-item .NumberBoard-value',
            '.ContentItem-actions .NumberBoard-item .NumberBoard-value',
            '.Question-metrics .NumberBoard-value',
            '.Question-stats .NumberBoard-value',
            '[itemprop="answerCount"]',
            '[itemprop="followersCount"]'
          ];
          
          for (const selector of possibleStatSelectors) {
            const statItems = card.querySelectorAll(selector);
            if (statItems && statItems.length >= 2) {
              followCount = statItems[0]?.innerText?.trim() || '0';
              answerCount = statItems[1]?.innerText?.trim() || '0';
              break;
            }
          }
          
          // 如果上面的方法都失败，尝试查找单独的回答数和关注数指示器
          if (answerCount === '0' || followCount === '0') {
            // 尝试查找单独的回答数
            const possibleAnswerSelectors = [
              '.QuestionItem-meta .AnswerCount',
              '.QuestionItem-meta [itemprop="answerCount"]',
              '.QuestionItem-meta .meta-item',
              '.question-main-meta .answer-num',
              '.ContentItem-status .ContentItem-statusItem [itemprop="answerCount"]',
              '.ContentItem-status .ContentItem-statusItem:nth-child(2)',
              '.Metrics-item:nth-child(2) .Metrics-count',
              '[data-za-detail-view-path-count]'
            ];
            
            for (const selector of possibleAnswerSelectors) {
              const answerElem = card.querySelector(selector);
              if (answerElem) {
                const text = answerElem.innerText.trim();
                // 提取数字部分，处理"12 个回答"、"12回答"等多种格式
                const answerMatch = text.match(/(\d+[\.\d]*[kKwW万]?)(?:\s*个?回答)?/);
                if (answerMatch && answerMatch[1]) {
                  answerCount = answerMatch[1];
                  break;
                }
              }
            }
            
            // 尝试查找单独的关注数
            const possibleFollowSelectors = [
              '.QuestionItem-meta .FollowerCount',
              '.QuestionItem-meta [itemprop="followersCount"]',
              '.ContentItem-status .ContentItem-statusItem [itemprop="followersCount"]',
              '.ContentItem-status .ContentItem-statusItem:nth-child(1)',
              '.Metrics-item:nth-child(1) .Metrics-count',
              '.QuestionFollowStatus-counts .NumberBoard-item .NumberBoard-value'
            ];
            
            for (const selector of possibleFollowSelectors) {
              const followElem = card.querySelector(selector);
              if (followElem) {
                const text = followElem.innerText.trim();
                // 提取数字部分，处理"12 人关注"、"12关注"等多种格式
                const followMatch = text.match(/(\d+[\.\d]*[kKwW万]?)(?:\s*人?关注)?/);
                if (followMatch && followMatch[1]) {
                  followCount = followMatch[1];
                  break;
                }
              }
            }
          }
          
          // 标准化数值，确保与前端一致
          if (answerCount === '' || answerCount === 'undefined' || answerCount === 'null') {
            answerCount = '0';
          }
          if (followCount === '' || followCount === 'undefined' || followCount === 'null') {
            followCount = '0';
          }
          
          // 获取热度信息（如果存在）
          let hot = '';
          const possibleHotSelectors = [
            '.HotItem-metrics',
            '.HotItem-content .HotItem-metrics',
            '.ContentItem-metrics',
            '.SearchItem-metrics'
          ];
          
          for (const selector of possibleHotSelectors) {
            const hotElement = card.querySelector(selector);
            if (hotElement) {
              hot = hotElement.innerText.trim();
              if (hot) break;
            }
          }
          
          // 添加到结果数组
          results.push({
            title,
            url,
            content,
            answerCount,
            followCount,
            hot
          });
        } catch (error) {
          console.error('提取搜索结果数据时出错:', error);
        }
      });
      
      return results;
    });
    
    console.log(`共找到 ${searchResults.length} 个搜索结果`);
    
    // 如果没有找到结果，可能是页面结构变化导致的，尝试截图保存以便调试
    if (searchResults.length === 0) {
      try {
        await searchPage.screenshot({ path: 'search-debug.png' });
        console.log('已保存页面截图用于调试');
      } catch (err) {
        console.log('截图保存失败:', err.message);
      }
    }
    
    // 估算总页数（因为知乎搜索不会直接显示总页数）
    const totalPages = searchResults.length > 0 ? 50 : 0; // 知乎搜索结果通常限制在50页左右
    
    res.json({
      success: true,
      data: {
        keyword,
        currentPage: page,
        totalPages,
        results: searchResults
      }
    });
    
  } catch (error) {
    console.error('搜索知乎问题错误:', error);
    res.status(500).json({ 
      success: false, 
      message: `搜索失败: ${error.message}` 
    });
  } finally {
    // 确保浏览器关闭，避免内存泄漏
    if (browser) {
      await browser.close();
      console.log('浏览器已关闭');
    }
  }
});

// 登录功能已移除

/**
 * 工具函数：解析Cookie字符串为Puppeteer要求的对象格式
 * @param {string} cookieStr Cookie字符串
 * @param {string} domain 域名
 * @returns {Array} Cookie对象数组
 */
function parseCookieString(cookieStr, domain) {
  if (!cookieStr) return [];
  
  return cookieStr.split(';')
    .filter(pair => pair.trim().length > 0)
    .map(pair => {
      const parts = pair.trim().split('=');
      const name = parts.shift();
      const value = parts.join('='); // 处理值中可能包含等号的情况
      
      return { name, value, domain };
    });
}

// 验证码处理功能已移除

// 完全重写下载接口
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'downloads', filename);
  
  console.log(`尝试下载文件: ${filePath}`);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    return res.status(404).json({ success: false, message: '文件不存在' });
  }
  
  try {
    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
    
    // 根据文件扩展名设置不同的Content-Type
    if (filename.endsWith('.csv')) {
      // 确保CSV文件使用UTF-8编码
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    } else if (filename.endsWith('.txt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    
    // 直接使用文件流发送文件，不修改文件内容
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log(`开始下载文件: ${filename}`);
  } catch (error) {
    console.error(`下载文件错误: ${error}`);
    res.status(500).json({ success: false, message: `下载失败: ${error.message}` });
  }
});

// 处理前端路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

async function legacyScrollAndScrape(page, logProgress) {
    logProgress('[传统模式] 开始滚动加载...');
    let previousAnswerCount = 0;
    let currentAnswerCount = 0;
    let scrollAttempts = 0;
    let noChangeCount = 0;
    const maxScrollAttempts = 15;
    const maxNoChangeAttempts = 3;

    do {
        previousAnswerCount = await page.evaluate(() => document.querySelectorAll('.List-item').length);
        
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                const scrollHeight = document.body.scrollHeight;
                const viewportHeight = window.innerHeight;
                let scrollCount = 0;
                const timer = setInterval(() => {
                    const distance = Math.floor(Math.random() * 100) + 100;
                    window.scrollBy(0, distance);
                    scrollCount++;
                    if (window.pageYOffset + viewportHeight >= scrollHeight || scrollCount > 30) {
                        clearInterval(timer);
                        resolve();
                    }
                }, Math.floor(Math.random() * 50) + 100);
            });
        });
        logProgress(`[传统模式] 第 ${scrollAttempts + 1} 次滚动完成。`);

        await new Promise(resolve => setTimeout(resolve, 3000));
        
        currentAnswerCount = await page.evaluate(() => document.querySelectorAll('.List-item').length);
        logProgress(`[传统模式] 当前回答数: ${currentAnswerCount}`);

        if (currentAnswerCount === previousAnswerCount) {
            noChangeCount++;
        } else {
            noChangeCount = 0;
        }
        scrollAttempts++;
        
    } while (scrollAttempts < maxScrollAttempts && noChangeCount < maxNoChangeAttempts);
    
    logProgress('[传统模式] 滚动结束。');
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll('.List-item')).map(item => {
            const author = item.querySelector('.UserLink-link');
            const content = item.querySelector('.RichText.ztext');
            const vote = item.querySelector('.VoteButton--up');
            return {
                author: author ? author.innerText : '匿名用户',
                content: content ? content.innerText : '',
                vote: vote ? vote.innerText : '0',
            };
        });
    });
}

app.post('/api/scrape', async (req, res) => {
    const { url, cookie } = req.body;
    const sessionId = uuidv4();
    sessions.set(sessionId, { status: '准备中', progress: 0 });

    const logProgress = (message) => {
        // ... existing code ...
    };

    let browser;
    try {
        const browser = await puppeteer.launch(getPuppeteerLaunchOptions(logProgress));
        const page = await browser.newPage();
        
        await page.setCookie(...JSON.parse(cookie));
        logProgress('Cookie设置成功');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        logProgress('页面导航成功');

        await page.waitForSelector('.QuestionHeader-title', { timeout: 30000 });
        logProgress('页面加载完成，已找到问题标题');

        let discoveredApiUrl = null;
        const apiResponseListener = async (response) => {
            const req = response.request();
            if (req.resourceType() === 'xhr' && req.url().includes('/answers') && req.method() === 'GET') {
                try {
                    const json = await response.json();
                    if (json.paging && typeof json.paging.is_end !== 'undefined') {
                        logProgress(`成功捕获知乎回答API端点: ${req.url()}`);
                        if(!discoveredApiUrl) discoveredApiUrl = req.url();
                    }
                } catch (e) { /* ignore non-json responses */ }
            }
        };
        page.on('response', apiResponseListener);

        logProgress('执行初步滚动以发现API...');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(resolve => setTimeout(resolve, 4000));

        page.off('response', apiResponseListener);

        let allAnswers = [];

        if (discoveredApiUrl) {
            logProgress('检测到API，切换到API直连模式...');
            
            const initialAnswers = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.List-item')).map(item => {
                    const author = item.querySelector('.UserLink-link');
                    const content = item.querySelector('.RichText.ztext');
                    const vote = item.querySelector('.VoteButton--up');
                    return {
                        author: author ? author.innerText : '匿名用户',
                        content: content ? content.innerText : '',
                        vote: vote ? vote.innerText : '0',
                    };
                });
            });
            allAnswers.push(...initialAnswers);
            logProgress(`已从初始页面抓取 ${initialAnswers.length} 个回答。`);

            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            const userAgent = await browser.userAgent();
            
            let nextUrl = discoveredApiUrl;
            let apiRequestCount = 0;

            while (nextUrl && apiRequestCount < 200) { 
                apiRequestCount++;
                logProgress(`[API模式] 第 ${apiRequestCount} 次请求...`);
                
                const apiRes = await fetch(nextUrl, {
                    headers: {
                        'Cookie': cookieString,
                        'User-Agent': userAgent,
                        'Accept': 'application/json, text/plain, */*',
                    }
                });

                if(!apiRes.ok) {
                    logProgress(`[API模式] 请求失败，状态码: ${apiRes.status}`);
                    break;
                }
                
                const data = await apiRes.json();
                
                if (data.data && Array.isArray(data.data)) {
                    const answersFromApi = data.data.map(item => {
                        const $ = cheerio.load(item.content);
                        return {
                            author: item.author.name,
                            content: $.text(),
                            vote: item.voteup_count,
                        };
                    });
                    allAnswers.push(...answersFromApi);
                    logProgress(`[API模式] 成功获取 ${answersFromApi.length} 个回答。当前总数: ${allAnswers.length}`);
                }

                if (data.paging && !data.paging.is_end) {
                    nextUrl = data.paging.next;
                } else {
                    logProgress('[API模式] API已返回所有数据。');
                    nextUrl = null;
                }
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
            }

        } else {
            logProgress('警告: 未能发现API端点，退回至传统的滚动模式。');
            allAnswers = await legacyScrollAndScrape(page, logProgress);
        }

        const questionTitle = await page.evaluate(() => document.querySelector('.QuestionHeader-title').innerText);
        
        progressData.status = '数据提取完成';
        progressData.progress = 100;
        updateProgress(sessionId, progressData);

        await browser.close();

        const csv = convertToCsv(allAnswers, questionTitle);
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir);
        }
        const filename = `zhihu_question_${questionTitle.replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}.csv`;
        const filePath = path.join(downloadsDir, filename);
        fs.writeFileSync(filePath, csv);

        res.json({
            success: true,
            message: '爬取成功',
            questionTitle,
            totalAnswers: allAnswers.length,
            answers: allAnswers,
            downloadUrl: `/api/download/${filename}`
        });

    } catch (error) {
        logProgress(`爬取知乎数据错误: ${error.message}`);
        console.error('爬取知乎数据错误:', error);
        if (browser) {
            await browser.close();
        }
        sessions.delete(sessionId);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/progress/:sessionId', (req, res) => {
    // ... existing code ...
}); 