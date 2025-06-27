# 使用Node.js官方镜像作为基础镜像
FROM node:18-slim

# 安装Chromium依赖
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 安装Chrome浏览器
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY package*.json ./

# 安装服务端依赖
RUN npm install

# 复制客户端package.json文件
COPY client/package*.json ./client/

# 安装客户端依赖
RUN cd client && npm install

# 复制所有文件
COPY . .

# 构建客户端
RUN cd client && npm run build

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=10000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 暴露端口
EXPOSE 10000

# 启动命令
CMD ["node", "server.js"] 