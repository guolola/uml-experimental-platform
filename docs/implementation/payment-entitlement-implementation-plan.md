# 支付与权益模块实施方案

本文档定义 UML Experimental Platform 的前台支付、后端支付订单、用户权益、生成次数扣减和支付风险控制方案。实现时以本文档的业务规则和后端合同为准，Figma 原型作为前台视觉与交互参考。

## 1. 目标与范围

- 实现 PC Web 支付优先：微信 Native 扫码支付、支付宝电脑网站支付。
- 支持 8 个 SKU：
  - 时长卡：日卡、周卡、月卡、年卡。
  - 次数包：10 次、50 次、100 次、500 次。
- 新用户邮箱验证成功后赠送 5 次，赠送次数 30 天后过期。
- 建立独立 `billing/payments` 领域，不复用 provider usage、admin quota 或 guest daily limit。
- 支付回调以官方异步通知为准；前端同步跳转、轮询、返回页只做状态展示。
- v1 不实现移动端 H5、小程序支付、自动续费订阅、发票申请前端、完整运营后台前端。

## 2. 关键业务规则

### 2.1 SKU 与权益

- 时长卡按固定天数生效：
  - 日卡：1 天。
  - 周卡：7 天。
  - 月卡：30 天。
  - 年卡：365 天。
- 次数包购买后默认不过期。
- 新用户奖励：
  - 用户邮箱验证成功后发放 5 次。
  - 赠送次数 30 天后过期。
  - 发放必须幂等，同一用户只能收到一次 signup bonus。
- 价格全部以后端 SKU 配置为准，前端不能提交或覆盖价格、次数、天数。
- 金额使用整数分表示，例如 `amountCents = 990` 表示 `¥9.90`，禁止使用浮点金额参与支付校验。

### 2.2 使用优先级

- 活跃时长卡优先，不扣次数。
- 时长卡达到每日启动上限后：
  - 如果用户有次数包余额，允许改扣 1 次继续生成。
  - 如果没有次数余额，返回 `429` 并展示“今日通行卡生成次数已用完，请稍后再试或购买次数包”。
- 无活跃时长卡时，扣次数包或赠送次数。
- 无任何可用权益时，生成入口返回 `402 Payment Required`，前端展示购买入口。

### 2.3 通行卡每日上限

- 时长卡用户每天最多 50 次 AI 生成启动。
- 该值必须可通过环境变量或后台配置调整，默认值用于本地开发和无后台配置时。
- 生成并发限制不属于 billing 权益；由 LLM scheduler 和限流策略按 global/provider/project/user/run 等维度控制。

### 2.4 生成扣减时机

- `/api/runs`、design run、code run、document run、retry、rerun 在排队前预占 1 次或时长卡权益。
- 进入实际 AI 生成阶段后确认消费。
- 请求未排队、排队前失败、或未进入 AI 生成阶段即失败时释放预占。
- 纯本地导出或非 AI 文档生成不扣次数。
- 每个 `runId` 只能产生一条有效预占，避免重复扣次。

## 3. 前台 Figma 对齐

设计稿：<https://www.figma.com/design/s3oACMTKWBG9XCGCWwHUpU/%E6%94%AF%E4%BB%98?node-id=0-1&p=f&t=aOJ1sS6rDxxLWYDC-0>

顶层 frame 对应关系：

- `/pricing 定价页`：`1:489`
- `支付宝支付中间态页`：`1:2`
- `微信支付弹窗`：`1:39`
- `支付确认弹窗`：`1:126`
- `/account/billing 账户支付与权益页`：`1:211`

实现对齐规则：

- `/pricing` 保留 8 个 SKU 的视觉结构，但价格、标题、权益说明、是否展示全部来自 `GET /api/billing/skus`。
- `/account/billing` 保留权益概览、购买入口、订单历史、刷新状态结构；账户页可展示推荐 SKU，但必须提供完整购买入口或复用 pricing SKU 数据。
- 支付确认弹窗根据 SKU 类型动态展示：
  - 时长卡展示有效期、到期时间、时长权益。
  - 次数包展示购买次数、是否过期、到账规则。
- 微信弹窗使用后端返回的 `codeUrl` 渲染真实二维码，Figma 中的二维码和金额均为占位。
- 支付宝中间态显示“正在确认支付结果”，但不得信任同步返回结果，必须轮询或等待后端查单结果。
- 原型中的美元价格、`+500 新用户奖励`、银行卡/银行转账、发票按钮视为占位：
  - v1 统一人民币 CNY。
  - 新用户奖励固定为 5 次。
  - 支付方式只展示微信支付和支付宝。
  - 发票按钮 v1 隐藏或置灰，避免空功能。
- 生成入口无权益状态不在该 Figma 中，但必须实现 inline reason 和购买入口。

## 4. Repo 边界与模块布局

遵守当前 monorepo 边界：

- `apps/api/src/index.ts` 只做服务组装、依赖注入和 route 注册。
- API routes 放在 `apps/api/src/routes/billing/`。
- 支付业务、订单、权益、账本、预占逻辑放在 `apps/api/src/billing/`。
- 微信、支付宝外部调用放在：
  - `apps/api/src/adapters/payments/wechat/`
  - `apps/api/src/adapters/payments/alipay/`
- Contract schema 放在 `packages/contracts/src/index.ts`。
- 前台页面和状态放在 `apps/web/src/features/user-platform/`、`apps/web/src/features/marketing-site/`、`apps/web/src/features/.../services/` 的现有边界内。
- 不在 provider usage、admin quota、guest daily limit 中混入付费权益逻辑。

## 5. 数据库迁移

新增 migration：`011_billing_and_payments`。

建议表：

- `billing_skus`
  - `id`
  - `code`
  - `kind`: `time_pass` | `credit_pack`
  - `name`
  - `description`
  - `duration_days`
  - `credit_amount`
  - `amount_cents`
  - `currency`
  - `active`
  - `sort_order`
  - `metadata_json`
  - timestamps
- `payment_orders`
  - `id`
  - `merchant_order_no`
  - `user_id`
  - `sku_id`
  - `provider`: `wechat_native` | `alipay_page`
  - `amount_cents`
  - `currency`
  - `status`: `pending` | `paid` | `expired` | `closed` | `failed` | `refund_pending` | `refunded`
  - `provider_transaction_id`
  - `provider_payload_json`
  - `expires_at`
  - timestamps
- `payment_notifications`
  - `id`
  - `provider`
  - `merchant_order_no`
  - `provider_event_id`
  - `provider_transaction_id`
  - `notification_status`
  - `verified`
  - `sanitized_payload_json`
  - timestamps
- `billing_entitlement_ledger`
  - `id`
  - `user_id`
  - `source_type`: `purchase` | `signup_bonus` | `usage` | `refund` | `admin_adjustment` | `reversal`
  - `source_id`
  - `sku_id`
  - `credit_delta`
  - `valid_from`
  - `valid_until`
  - `metadata_json`
  - timestamps
- `billing_usage_reservations`
  - `id`
  - `run_id`
  - `user_id`
  - `task_type`
  - `reservation_kind`: `time_pass` | `credit`
  - `status`: `reserved` | `confirmed` | `released`
  - `ledger_entry_id`
  - timestamps

Required constraints:

- `billing_skus.code` unique.
- `payment_orders.merchant_order_no` unique.
- provider transaction id unique when present.
- callback event id unique per provider when present.
- `billing_usage_reservations.run_id` unique.
- signup bonus ledger unique per user and bonus type.

## 6. API 与 Contracts

新增 contract schema：

- payment channel enum：`wechat_native`、`alipay_page`
- SKU DTO：
  - code、name、kind、durationDays、creditAmount、amountCents、currency、active、sortOrder、description
- billing summary DTO：
  - creditBalance
  - activePass
  - signupBonus
  - passDailyUsage
  - recentOrders
- create order request：
  - `skuCode`
  - `channel`
  - optional `returnUrl`
- create order response：
  - `orderId`
  - `merchantOrderNo`
  - `status`
  - `amountCents`
  - `currency`
  - `expiresAt`
  - for WeChat: `codeUrl`
  - for Alipay: `paymentFormHtml` or `redirectUrl`
- order status DTO：
  - order id、SKU、amount、channel、status、createdAt、expiresAt、paidAt

新增前台 API：

- `GET /api/billing/skus`
  - 返回 active SKU。
  - 未登录也可访问，用于 `/pricing`。
- `GET /api/billing/summary`
  - 登录后返回当前权益、有效卡、次数余额、订单摘要。
  - 如果用户已验证邮箱但未领 signup bonus，在这里幂等补发。
- `POST /api/billing/orders`
  - 登录后创建支付订单。
  - 请求只允许传 `skuCode`、`channel`、`returnUrl`。
  - 后端读取 SKU 金额并创建 provider 订单。
- `GET /api/billing/orders/:orderId`
  - 登录后查询自己的订单。
  - pending 状态可触发 provider 查单。
- `POST /api/billing/payment-callbacks/wechat/native`
  - 无需登录，但必须验证签名和解密通知。
- `POST /api/billing/payment-callbacks/alipay/page`
  - 无需登录，但必须验证支付宝签名。

Run route 行为变化：

- 无权益返回 `402`，响应中包含 billing summary 和 pay CTA 所需信息。
- 通行卡每日上限触发返回 `429`，响应中包含原因和可购买次数包提示。
- 成功预占后才允许创建 queued run。

## 7. 支付流程

### 7.1 微信 Native

1. 用户在 `/pricing` 或 `/account/billing` 选择 SKU。
2. 打开支付确认弹窗，选择微信支付。
3. 前端调用 `POST /api/billing/orders`。
4. 后端创建内部订单，调用微信 Native 下单。
5. 后端返回 `codeUrl`、订单号、金额、过期时间。
6. 前端展示微信二维码弹窗，并轮询 `GET /api/billing/orders/:orderId`。
7. 微信异步通知到达后，后端验签、解密、校验金额和订单号。
8. 订单状态改为 paid，并写入权益 ledger。
9. 前端轮询到 paid 后关闭弹窗并刷新 billing summary。

### 7.2 支付宝电脑网站支付

1. 用户选择支付宝支付。
2. 前端调用 `POST /api/billing/orders`。
3. 后端创建内部订单，调用支付宝 SDK 生成电脑网站支付表单或跳转地址。
4. 前端跳转支付宝。
5. 用户从支付宝返回后进入“支付确认中”页面。
6. 前端轮询订单状态；后端可主动查单。
7. 支付宝异步通知到达后，后端验签并校验订单号、金额、交易状态。
8. 订单状态改为 paid，并写入权益 ledger。
9. 前端展示支付成功和权益到账。

### 7.3 回调安全

回调处理必须满足：

- 不依赖前端同步返回判断支付成功。
- 验证签名。
- 校验 app id / merchant id。
- 校验订单号、金额、币种、交易状态。
- 重复通知不重复发放权益。
- 回调日志去敏，不记录密钥、私钥、完整敏感原文。
- 支付成功、发放权益、写通知记录在同一事务中完成。

## 8. 前端实现

### 8.1 `/pricing`

- 通过 `GET /api/billing/skus` 获取 SKU。
- 分组展示时长卡和次数包。
- 未登录点击购买：跳转登录/注册，登录后回到原 SKU。
- 已登录点击购买：打开支付确认弹窗。
- inactive 或未配置价格的 SKU 不展示。

### 8.2 支付确认弹窗

- 展示 SKU 名称、金额、权益、订单有效期、支付方式。
- 价格、权益、SKU 类型全部来自 API。
- 支付按钮创建订单。
- 创建订单过程中禁用重复提交。

### 8.3 微信支付弹窗

- 使用 `qrcode.react` 渲染 `codeUrl`。
- 展示订单号、金额、倒计时。
- 支持状态：等待支付、支付成功、订单过期、支付失败。
- 提供刷新状态、取消支付、关闭。
- 支付成功后刷新 billing summary。

### 8.4 支付宝中间态页

- 路由用于支付宝同步返回后的确认页。
- 显示“正在确认支付结果”。
- 轮询后端订单状态，不信任 URL query。
- 成功后进入账户账单页或返回原生成流程。
- 未确认或失败时提供刷新与返回账单页。

### 8.5 `/account/billing`

- 展示：
  - 当前次数余额。
  - 当前有效时长卡和到期时间。
  - 新用户赠送次数和过期时间。
  - 订单历史。
  - 购买入口。
- 购买入口可展示推荐 SKU，但必须能进入完整 8 SKU 购买。
- 订单历史支付方式只展示微信支付、支付宝。
- 发票按钮 v1 隐藏或置灰。

### 8.6 生成入口无权益状态

- 无权益时不只禁用按钮。
- 展示具体原因：
  - “当前没有可用生成次数或有效时长卡。”
  - “今日通行卡生成次数已用完，请稍后再试或购买次数包。”
- 提供前往 `/pricing` 或 `/account/billing` 的购买入口。

## 9. 后台与运营能力

后台不需要前台原型稿，但 API 侧预留运营能力：

- SKU 配置：
  - 8 个 SKU 的价格、启用状态、排序、说明。
  - 生产环境必须显式配置正式价格。
- 订单管理：
  - 按用户、订单号、状态、渠道、时间范围查询。
  - 支持主动查单和关闭过期订单。
- 权益管理：
  - 查看用户 ledger、余额、有效卡、预占记录。
  - 管理员手动补偿次数。
- 退款：
  - v1 后台或管理员流程发起/记录退款。
  - 退款成功写负向 ledger。
  - 不删除历史消费。
  - 如果退款后权益为负，阻止后续使用并提示联系客服。
- 风险日志：
  - 记录签名失败、金额不匹配、重复回调、未知订单、异常退款。

## 10. 配置与合规

### 10.1 环境变量

建议配置：

- `PUBLIC_API_BASE_URL`
- `UML_BILLING_SKUS_JSON`
- `UML_BILLING_PASS_DAILY_LIMIT`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_PRIVATE_KEY_PATH` 或 `WECHAT_PAY_PRIVATE_KEY`
- `WECHAT_PAY_SERIAL_NO`
- `WECHAT_PAY_PLATFORM_CERT_PATH` 或平台证书配置
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY_PATH` 或 `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY_PATH` 或 `ALIPAY_PUBLIC_KEY`
- `ALIPAY_GATEWAY_URL`

生产环境缺少正式支付配置时，创建订单接口必须返回配置错误，不能降级为假支付。

### 10.2 本地开发

- 本地使用 mock/sandbox adapter。
- mock adapter 可模拟：
  - 创建订单。
  - 支付成功。
  - 支付失败。
  - 订单过期。
  - 重复回调。
- mock adapter 只能在非生产环境启用。

### 10.3 正式上线前置

- 可公网访问的 HTTPS 回调域名。
- 微信/支付宝商户资质。
- 微信/支付宝应用审核材料。
- 中国大陆正式 Web 收款按部署与业务主体要求准备 ICP/备案。
- 密钥、公私钥、APIv3 key 不进入源码、日志或前端 bundle。

## 11. 外部参考

- 微信支付 Native 下单文档：<https://pay.wechatpay.cn/doc/v3/merchant/4012791877>
- 微信支付支付成功回调通知文档：<https://pay.wechatpay.cn/doc/v3/merchant/4012791861>
- 支付宝电脑网站支付接口文档：<https://opendocs.alipay.com/apis/api_1/alipay.trade.page.pay>
- 支付宝电脑网站支付返回通知说明：<https://developer.alibaba.com/docs/doc.htm?articleId=105901&docType=1&treeId=237>
- 支付宝官方 Node SDK：<https://github.com/alipay/alipay-sdk-nodejs-all>

实现时应以最新官方文档为准复核签名、证书、回调和查单细节。

## 12. 分阶段实现计划

### Phase 1：Contracts、DB、基础服务

- 新增 billing contract schemas 和类型。
- 新增 migration `011_billing_and_payments`。
- 实现 billing repository：
  - SKU 查询。
  - order 创建和状态更新。
  - notification 幂等记录。
  - ledger 写入和 summary 聚合。
  - usage reservation 预占、确认、释放。
- 实现 mock payment adapter。

### Phase 2：支付订单与回调

- 实现 `GET /api/billing/skus`。
- 实现 `GET /api/billing/summary`。
- 实现 `POST /api/billing/orders`。
- 实现 `GET /api/billing/orders/:orderId`。
- 实现微信和支付宝回调 endpoint。
- 接入微信/支付宝 adapter，生产环境严格检查配置。

### Phase 3：Auth 与 Run 权益集成

- 邮箱验证成功后幂等发放 5 次。
- 已验证老用户首次读取 summary 时补发 signup bonus。
- run start、design/code/document run、retry/rerun 接入预占。
- 生成阶段开始后确认消费，未进入生成阶段失败时释放预占。
- 无权益和通行卡每日上限响应接入前端所需 contract。

### Phase 4：前台页面

- `/pricing` 接入 billing SKU API。
- 新增 `/account/billing`。
- 实现支付确认弹窗。
- 实现微信二维码弹窗。
- 实现支付宝支付中间态页。
- 生成入口接入无权益/通行卡每日上限 inline reason。

### Phase 5：运营 API 与风险补充

- 增加 admin API 查询订单、查单、关闭过期订单。
- 增加 admin API 查看用户权益 ledger 和手动补偿。
- 增加退款记录和负向 ledger。
- 增加支付风险日志查询能力。

## 13. 测试计划

### Contracts

- billing SKU schema 解析。
- create order request 拒绝非法渠道。
- create order request 不接受前端金额字段。
- order status DTO 覆盖 pending、paid、expired、failed、refunded。

### API unit tests

- 新用户赠送幂等。
- 邮箱未验证不可使用赠送权益。
- 服务端 SKU 金额优先，前端不能改价。
- 微信/支付宝重复回调不重复发放。
- 金额不匹配、签名错误、订单号不匹配均拒绝。
- 时长卡优先，次数包扣减。
- 通行卡每日上限 fallback 到次数包。
- 预占确认和释放。

### API route tests

- 未登录不能创建订单。
- 支付回调无需登录但必须验签。
- 无权益 run start 返回 `402`，不创建 run。
- 通行卡每日上限返回 `429` 或 fallback 到次数包。
- retry/rerun 与普通 run 一样扣权益。

### Web tests

- `/pricing` 渲染 8 个 SKU。
- `/account/billing` 渲染权益、有效卡、订单历史。
- 支付确认弹窗展示动态 SKU 信息。
- 微信二维码弹窗渲染 `codeUrl` 并轮询订单。
- 支付宝中间态轮询订单状态。
- 无权益生成入口显示 inline reason 和购买入口。

### 验证命令

- `npm run test:contracts`
- `npm run test:api`
- `npm run test:web`
- `npm run typecheck:web`

## 14. Goal 模式提示词

```text
请在 E:\umlExperimentalPlatform 中实现支付与权益模块，严格按照 docs/implementation/payment-entitlement-implementation-plan.md 执行。目标是完成 PC Web 支付 v1：微信 Native 扫码支付、支付宝电脑网站支付、8 个 SKU（日卡/周卡/月卡/年卡/10次/50次/100次/500次）、邮箱验证后新用户赠送 5 次、生成任务权益预占/确认/释放、无权益和通行卡每日上限提示、/pricing、/account/billing、支付确认弹窗、微信二维码弹窗、支付宝支付中间态页。

实现时保持现有 monorepo 边界：apps/api/src/index.ts 只做注册和组装；API routes 放 apps/api/src/routes/billing/；支付和权益业务放 apps/api/src/billing/；微信/支付宝外部调用放 apps/api/src/adapters/payments/{wechat,alipay}/；contracts 放 packages/contracts/src/index.ts；前端遵守 apps/web 的 app/features/entities/services/shared 分层。不要把付费权益混入 provider usage、admin quota 或 guest daily limit。

请先阅读相关现有模块、测试和合同，再分阶段实现：contracts 和 migration、billing repository/service、mock/sandbox payment adapter、订单与回调 routes、auth signup bonus、run start/retry/rerun 权益集成、前台页面和状态、admin 查询/补偿/退款基础 API、测试。支付金额必须以后端 SKU 为准，使用整数分；回调必须验签、校验订单号/金额/币种/交易状态，并保证幂等；生产环境缺少正式支付配置时不得降级为假支付。

完成后运行并汇报：npm run test:contracts、npm run test:api、npm run test:web、npm run typecheck:web。如果有命令无法运行，说明原因和剩余风险。
```
