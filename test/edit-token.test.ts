import { describe, expect, it } from "vitest"

import {
  generateEditToken,
  hashEditToken,
  safeEqual,
} from "../worker/edit-token"

describe("hashEditToken", () => {
  it("is the lowercase hex SHA-256", async () => {
    expect(await hashEditToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
})

describe("generateEditToken", () => {
  it("makes 43 base64url characters, different every time", () => {
    const a = generateEditToken()
    const b = generateEditToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
})

describe("safeEqual", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("token", "token")).toBe(true)
    expect(safeEqual("token", "tokem")).toBe(false)
    expect(safeEqual("token", "token2")).toBe(false)
    expect(safeEqual("", "token")).toBe(false)
  })
})
