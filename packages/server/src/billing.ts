import type { Usage } from "@mariozechner/pi-ai"

export class Billing {
  input = 0
  output = 0
  cacheRead = 0
  cacheWrite = 0
  total = 0
  cost: number | null = 0
  record(usage: Usage, priced: boolean) {
    this.input += usage.input
    this.output += usage.output
    this.cacheRead += usage.cacheRead
    this.cacheWrite += usage.cacheWrite
    this.total += usage.totalTokens
    this.cost = priced && this.cost !== null ? this.cost + usage.cost.total : null
    return this.snapshot()
  }
  snapshot() {
    return {
      prompt_tokens: this.input + this.cacheRead + this.cacheWrite,
      completion_tokens: this.output,
      cached_tokens: this.cacheRead,
      total_tokens: this.total,
      cost_usd: this.cost,
    }
  }
}
