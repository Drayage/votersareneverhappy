/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 https://drayage.github.io/votersareneverhappy/ 하위에서 서빙되므로
// 빌드/미리보기는 저장소 하위 경로를, 개발/테스트는 루트를 사용한다.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/votersareneverhappy/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
