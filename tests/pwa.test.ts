import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PWA 앱 셸", () => {
  it("설치 가능한 매니페스트와 필수 아이콘을 제공한다", () => {
    const manifest = JSON.parse(readFileSync(resolve("public/manifest.webmanifest"), "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]));
    for (const icon of manifest.icons) expect(existsSync(resolve("public", icon.src))).toBe(true);
  });

  it("GitHub Pages 하위 경로를 기준으로 서비스 워커를 등록한다", () => {
    const main = readFileSync(resolve("src/main.tsx"), "utf8");
    expect(main).toContain("import.meta.env.BASE_URL");
    expect(main).toContain("serviceWorker.register");
  });

  it("앱 셸을 캐시하고 오프라인 탐색 요청을 복구한다", () => {
    const worker = readFileSync(resolve("public/sw.js"), "utf8");
    expect(worker).toContain('addEventListener("install"');
    expect(worker).toContain('addEventListener("activate"');
    expect(worker).toContain('addEventListener("fetch"');
    expect(worker).toContain("caches.match(BASE_URL.href)");
  });
});
