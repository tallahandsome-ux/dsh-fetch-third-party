/**
 * The self-contained model-facing tool `web_fetch_url` (design 方案 B):
 * works in any session without touching the agent preset, unlike the official
 * `web_fetch` tool which is preset-gated and defaults to disabled.
 * @module dsh-fetch-third-party/tool
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

/** Register the tool and its conservative-use guidance. */
export function applyWebFetchUrlTool(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:web_fetch_url',
    order: 112,
    text: 'Use the web_fetch_url tool to retrieve the full content of one specific HTTP(S) URL when a search result snippet is not enough to answer. Fetch one URL at a time; do not fetch repeatedly when the information is already sufficient.',
  })

  ctx.tools.register(defineTool({
    name: 'web_fetch_url',
    description: 'Fetch the full content of one specific HTTP(S) URL through a user-configured third-party fetch service and return it as text.',
    parameters: {
      url: { type: 'string', required: true, description: 'The HTTP(S) URL to fetch.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          statusCode: { type: 'integer', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `URL: ${value.url}\nStatus: ${value.statusCode}\n\n${value.content}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await ctx.web.fetch({ url: args.url }, exec.signal)
      return {
        url: result.url,
        statusCode: result.statusCode,
        content: result.body.content,
      }
    },
  }))
}
