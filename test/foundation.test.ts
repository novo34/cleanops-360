import { describe, expect, it } from "vitest"
import HomePage from "../app/page"

describe("Foundation bootstrap", () => {
  it("renders the CleanOps 360 identity and foundation message", () => {
    const page = HomePage()
    const children = Array.isArray(page.props.children)
      ? page.props.children
      : [page.props.children]

    expect(page.type).toBe("main")
    expect(children[0].type).toBe("h1")
    expect(children[0].props.children).toBe("CleanOps 360")
    expect(children[1].type).toBe("p")
    expect(children[1].props.children).toBe("Foundation bootstrap en desarrollo.")
  })
})
