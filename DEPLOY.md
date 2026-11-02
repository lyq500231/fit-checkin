# 部署到公网（路线 B：GitHub Pages → 手机秒变 App）

git 已安装（2.56），本目录已是 git 仓库并完成首次提交。下面 3 步上线。

## 第 1 步：在 GitHub 建一个空仓库
1. 打开 https://github.com/new （没有账号先注册，免费）
2. Repository name 填：`fit-checkin`（或你喜欢的名字）
3. 选 **Public**
4. **不要**勾选 "Add a README / .gitignore / license"（保持空仓库）
5. 点 Create repository

## 第 2 步：把代码推上去
在本文件夹打开 PowerShell，执行（把 `你的用户名` 换成你的 GitHub 用户名）：
```powershell
git remote add origin https://github.com/你的用户名/fit-checkin.git
git push -u origin main
```
首次推送会弹出浏览器让你登录 GitHub 并授权，点同意即可。

> 想让我代推？把建好的仓库地址（https://github.com/xxx/fit-checkin.git）发给我即可。

## 第 3 步：开启 Pages，拿到公网网址
1. 仓库页面 → **Settings** → 左侧 **Pages**
2. Build and deployment → Source 选 **Deploy from a branch**
3. Branch 选 `main`、目录选 `/ (root)` → Save
4. 等 1~2 分钟，页面顶部会出现网址：
   `https://你的用户名.github.io/fit-checkin/`

## 第 4 步：变成手机 App（PWA）
- 手机浏览器打开上面的网址
- iPhone Safari：分享按钮 → **添加到主屏幕**
- Android Chrome：菜单 → **添加到主屏幕 / 安装应用**
- 之后它就是桌面图标、全屏运行、**断网也能用**（Service Worker 已内置）
- 每个人的打卡数据存在各自手机里，互不干扰；换机用「设置 → 导出/导入 JSON」迁移

## 以后更新代码
```powershell
git add -A
git commit -m "描述改了什么"
git push
```
推完 1 分钟左右线上自动更新（用户端需刷新一次或等 SW 更新）。

## 不想用 GitHub 的备选
- 本目录已生成 `dist.zip`（干净部署包）：
  - Netlify：打开 https://app.netlify.com/drop ，把 `dist.zip` 拖进去即得网址
  - Cloudflare Pages：Workers & Pages → Create → Pages → Upload assets，上传 `dist` 文件夹
- 局域网临时共享：`powershell -ExecutionPolicy Bypass -File .\serve.ps1`

## 把 git 身份改成你自己（可选，影响提交记录署名）
```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```
（GitHub 隐私邮箱见 https://github.com/settings/emails ，形如 xxx@users.noreply.github.com）

## 提示
- 中国大陆访问 github.io 偶尔较慢；若在意速度，用 Cloudflare Pages（pages.dev）或 Netlify 拖拽版。
- 仓库是 Public 的话 `_test/` 测试页也会被公开（不含任何个人数据），介意可在推送前删除该文件夹。
## 全自动部署（推荐，配合 deploy.ps1）
1. 注册并登录 GitHub 后，打开 https://github.com/settings/tokens
2. Generate new token (classic) → Note 填 `fitcheck` → 勾选 **repo** Scope → 拉到最底 Generate token
3. 复制令牌（只显示一次），在本文件夹 PowerShell 执行：
   ```powershell
   Set-Content -Path "$env:USERPROFILE\.fitcheck-gh-token" -Value "ghp_粘贴你的令牌"
   ```
4. 执行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
   ```
   脚本会自动：建仓库 → 推送 → 开 Pages → 打印公网网址，并清空令牌文件。
5. 手机打开打印出的网址 → 添加到主屏幕，即成 App。