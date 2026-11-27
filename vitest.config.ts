import { availableParallelism } from "node:os"
import { defineConfig } from "vitest/config"

const defaultConcurrency = Math.min(12, Math.max(6, availableParallelism() - 2))
const concurrency = Math.max(
  1,
  Number(
    process.env.BENCH_CONCURRENCY ||
      process.env.TEST_CONCURRENCY ||
      process.env.CONCURRENCY ||
      defaultConcurrency,
  ),
)

export default defineConfig({
  test: {
    maxConcurrency: concurrency,
    fileParallelism: true,
  },
})
