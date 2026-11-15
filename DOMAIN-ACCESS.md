# 域名与跨设备访问修复

日期：2026-11-15。正式入口：https://mahjong.jianghaolin.com/

此前 Cloudflare Worker 和 Durable Object 已上线，但 wrangler 配置只有 workers_dev=true，未绑定个人域名。主站首页与 /works 的麻将入口均跳转到 workers.dev。外部电脑能打开主站却打不开游戏时，这个跳转域名成为独立的网络依赖。已确认服务仍正常；没有获得故障电脑的网络诊断，不能断言其具体 DNS、TLS 或网络拦截原因。

本次修复：
- Cloudflare Custom Domain mahjong.jianghaolin.com 绑定原 jingao-jiangshan-mahjong 服务；同一份原有 Durable Object 状态和静态资源，不要求本地电脑开机。
- wrangler.jsonc 固定 account_id 并记录 custom_domain 路由，旧 workers.dev 地址保留。
- 主站只替换 application.mjs 中一个共享作品地址；首页和作品页均生效。其他 16 个模块、1402 个既有静态文件及所有绑定不变。通过 content-only API 发布，未重新上传网站资源或迁移数据。
- 网站规范源文件 app/profile-content.ts 同步这一处地址，未提交该网站工作区的其他未发布改动。

验证：
- Google 和 Cloudflare 公共 DNS 均返回正式域名的 A 记录。
- 新域名 HTTPS 的首页、game.html、health 和课桌图片均 HTTP 200，TLS 仍按默认方式验证；健康检查 authority=server。
- 测试机器一度保留新域名创建前的 NXDOMAIN 缓存，因此测试进程仅对此域名采用公共 DNS 的真实结果，不修改系统 DNS，不关闭 TLS 验证。
- 四个独立生产 net.js 客户端通过 wss://mahjong.jianghaolin.com 进行 167 条成功操作、两次结算，公开状态和暗牌保护、重试、重复/过期请求、刷新和离线 AI 均通过。
- 主站首页和作品页均 HTTP 200，已无旧游戏链接，均含正式域名。

Cloudflare 自定义域名文档：https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
发布基线、精确差异和验证记录保存在工作区 mahjong-domain-release-20261115。

公开浏览器验收：直接打开正式域名成功显示大厅；打开主站作品页，其麻将卡片 href 已是 https://mahjong.jianghaolin.com/。截图保存在发布记录目录。
