import { safeStorage } from "electron"
import type { SecretCipher } from "@docs-agent/server"

const PREFIX = "enc:v1:"

export function createElectronCipher(): SecretCipher {
  return {
    encrypt(plain: string): string {
      if (!plain) return ""
      if (!safeStorage.isEncryptionAvailable()) return plain
      return PREFIX + safeStorage.encryptString(plain).toString("base64")
    },
    decrypt(stored: string): string {
      if (!stored) return ""
      if (!stored.startsWith(PREFIX)) return stored
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("系统密钥环不可用，无法解密历史密钥")
      }
      const buf = Buffer.from(stored.slice(PREFIX.length), "base64")
      return safeStorage.decryptString(buf)
    },
  }
}
