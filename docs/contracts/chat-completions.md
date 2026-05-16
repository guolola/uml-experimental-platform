# Chat(流式返回)

## 项目约定

- 设置面板中的 `Base URL` 只填写站点根地址：`https://ai.comfly.org`
- 客户端实际请求路径固定为：`POST /v1/chat/completions`
- `API Key` 通过 `Authorization: Bearer <API_KEY>` 发送
- `stream: true` 时响应为 `text/event-stream`，并以 `data: [DONE]` 结束

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: Model Provider Chat Completions
  version: 1.0.0
  description: >
    本项目实际使用的 Model Provider 流式聊天接口约定。前端配置项中的 Base URL
    只填写站点根地址 https://ai.comfly.org，运行时固定调用 /v1/chat/completions。
paths:
  /v1/chat/completions:
    post:
      summary: Chat(流式返回)
      description: >
        所有对话模型均通过该接口调用。启用 stream=true 时，以 SSE 方式返回增量内容，
        并以 data: [DONE] 结束。
      tags:
        - 聊天(Chat)
      parameters:
        - name: Content-Type
          in: header
          required: true
          schema:
            type: string
            enum:
              - application/json
          example: application/json
        - name: Accept
          in: header
          required: true
          schema:
            type: string
            enum:
              - text/event-stream
          example: text/event-stream
        - name: Authorization
          in: header
          required: true
          schema:
            type: string
          example: Bearer {{YOUR_API_KEY}}
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: 要使用的模型 ID。
                messages:
                  type: array
                  description: 对话消息列表。
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - system
                          - user
                          - assistant
                      content:
                        type: string
                    required:
                      - role
                      - content
                temperature:
                  type: number
                  description: 采样温度，通常在 0 到 2 之间。
                top_p:
                  type: number
                  description: 核采样参数。
                n:
                  type: integer
                  description: 生成候选数量，默认 1。
                stream:
                  type: boolean
                  description: 启用 SSE 增量返回。
                stop:
                  oneOf:
                    - type: string
                    - type: array
                      items:
                        type: string
                  description: 停止序列。
                max_tokens:
                  type: integer
                  description: 最大输出 token 数。
                presence_penalty:
                  type: number
                frequency_penalty:
                  type: number
                logit_bias:
                  type: object
                  additionalProperties:
                    type: number
                  nullable: true
                user:
                  type: string
                response_format:
                  type: object
                  description: >
                    可传 { "type": "json_object" } 以要求模型输出合法 JSON。
                seed:
                  type: integer
                  description: 采样种子。
                tools:
                  type: array
                  description: 可选工具定义列表。
                  items:
                    type: object
                tool_choice:
                  description: >
                    可选。可为 none、auto，或显式函数选择对象。
                  oneOf:
                    - type: string
                      enum:
                        - none
                        - auto
                    - type: object
              required:
                - model
                - messages
            example:
              model: gpt-5.5
              stream: true
              response_format:
                type: json_object
              messages:
                - role: system
                  content: You are a helpful assistant.
                - role: user
                  content: Hello!
      responses:
        "200":
          description: 流式聊天完成事件流
          content:
            text/event-stream:
              schema:
                type: string
              examples:
                stream:
                  value: |
                    data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"{\"rules\":"},"finish_reason":null}]}

                    data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"[]}"},"finish_reason":null}]}

                    data: [DONE]
        "400":
          description: 请求参数错误
        "401":
          description: Bearer Token 无效或缺失
        "429":
          description: 请求频率受限
        "5XX":
          description: 服务端错误
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []
```
